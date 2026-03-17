import os
from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from models import Request, RequestItem, RequestAttachment, SapLookup, VendorLookup
from schemas import RequestOut, RequestListOut, ItemPatchIn, AttachmentOut
from routes.ingest import parse_excel
from agent import run_agent

UPLOAD_DIR = "/app/uploads"

router = APIRouter()


@router.get("/api/requests", response_model=List[RequestListOut])
def list_requests(db: Session = Depends(get_db)):
    return db.query(Request).order_by(Request.created_at.desc()).all()


@router.get("/api/requests/{request_id}")
def get_request(request_id: UUID, db: Session = Depends(get_db)):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    result = RequestOut.model_validate(req).model_dump()

    if req.request_type == "partner_function_change":
        # CSR workflow: enrich each item with account name + SAP current CSR from sap_lookup
        account_ids = [item["account_id"] for item in result["items"] if item.get("account_id")]
        sap_rows = db.query(SapLookup).filter(SapLookup.account_id.in_(account_ids)).all()
        sap_map = {row.account_id: row for row in sap_rows}
        for item in result["items"]:
            sap = sap_map.get(item.get("account_id"))
            item["account_name"] = sap.account_name if sap else None
            item["sap_current_value"] = sap.current_csr if sap else None

    elif req.request_type == "change_existing" and req.vendor_number:
        # Vendor workflow: fill in current_value from vendor_lookup where agent left it null
        vendor = db.query(VendorLookup).filter(VendorLookup.vendor_number == req.vendor_number).first()
        if vendor:
            vendor_data = {
                "VENDOR_NAME": vendor.vendor_name, "VENDOR_ACCT_GROUP": vendor.acct_group,
                "COMPANY_CODE": vendor.company_code, "STREET_ADDRESS": vendor.street_address,
                "CITY": vendor.city, "STATE": vendor.state, "ZIP": vendor.zip,
                "COUNTRY": vendor.country, "EIN": vendor.ein,
                "PAYMENT_TERMS": vendor.payment_terms, "PAYMENT_METHOD": vendor.payment_method,
                "BANK_KEY": vendor.bank_key, "BANK_ACCT_NUMBER": vendor.bank_acct_number,
                "BANK_ACCT_HOLDER": vendor.bank_acct_holder, "BANK_NAME": vendor.bank_name,
            }
            for item in result["items"]:
                if item.get("current_value") is None:
                    item["current_value"] = vendor_data.get(item["field_name"])

    return result


@router.post("/api/requests/{request_id}/approve")
def approve_request(request_id: UUID, db: Session = Depends(get_db)):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    for item in req.items:
        if item.approval_status == "pending":
            item.approval_status = "approved"

    req.status = "approved"
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "approved", "request_id": str(request_id)}


@router.post("/api/requests/{request_id}/deny")
def deny_request(request_id: UUID, db: Session = Depends(get_db)):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    for item in req.items:
        item.approval_status = "denied"

    req.status = "denied"
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "denied", "request_id": str(request_id)}


@router.post("/api/requests/{request_id}/flag")
def flag_request(request_id: UUID, db: Session = Depends(get_db)):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    req.status = "flagged"
    db.commit()
    return {"status": "flagged", "request_id": str(request_id)}


@router.patch("/api/requests/{request_id}/items/{item_id}")
def patch_item(
    request_id: UUID,
    item_id: UUID,
    body: ItemPatchIn,
    db: Session = Depends(get_db),
):
    item = (
        db.query(RequestItem)
        .filter(RequestItem.id == item_id, RequestItem.request_id == request_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    allowed = {"approved", "denied", "pending"}
    if body.approval_status not in allowed:
        raise HTTPException(status_code=400, detail=f"approval_status must be one of {allowed}")

    item.approval_status = body.approval_status
    if body.reviewer_comment is not None:
        item.reviewer_comment = body.reviewer_comment

    db.commit()
    db.refresh(item)
    return {"item_id": str(item_id), "approval_status": item.approval_status}


@router.get("/api/requests/{request_id}/attachments", response_model=List[AttachmentOut])
def list_attachments(request_id: UUID, db: Session = Depends(get_db)):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return db.query(RequestAttachment).filter(
        RequestAttachment.request_id == request_id
    ).order_by(RequestAttachment.uploaded_at.asc()).all()


@router.get("/api/requests/{request_id}/attachments/{attachment_id}/download")
def download_attachment(request_id: UUID, attachment_id: UUID, db: Session = Depends(get_db)):
    att = db.query(RequestAttachment).filter(
        RequestAttachment.id == attachment_id,
        RequestAttachment.request_id == request_id,
    ).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if not os.path.exists(att.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        path=att.file_path,
        filename=att.filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.post("/api/requests/{request_id}/attachments")
async def upload_attachment(
    request_id: UUID,
    notes: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    existing = db.query(RequestAttachment).filter(
        RequestAttachment.request_id == request_id
    ).count()
    next_version = existing + 1

    file_bytes = await file.read()
    folder = os.path.join(UPLOAD_DIR, str(request_id))
    os.makedirs(folder, exist_ok=True)
    file_path = os.path.join(folder, f"v{next_version}_{file.filename}")
    with open(file_path, "wb") as f:
        f.write(file_bytes)

    att = RequestAttachment(
        request_id=request_id,
        version=str(next_version),
        filename=file.filename,
        file_path=file_path,
        notes=notes,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return AttachmentOut.model_validate(att)


@router.post("/api/requests/{request_id}/reprocess")
async def reprocess_request(
    request_id: UUID,
    reviewer_comment: str = Form(...),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # Resolve attachment: use new upload if provided, else fall back to latest on disk
    if file and file.filename:
        file_bytes = await file.read()
        existing_count = db.query(RequestAttachment).filter(
            RequestAttachment.request_id == request_id
        ).count()
        next_version = existing_count + 1
        folder = os.path.join(UPLOAD_DIR, str(request_id))
        os.makedirs(folder, exist_ok=True)
        file_path = os.path.join(folder, f"v{next_version}_{file.filename}")
        with open(file_path, "wb") as f:
            f.write(file_bytes)
        db.add(RequestAttachment(
            request_id=request_id,
            version=str(next_version),
            filename=file.filename,
            file_path=file_path,
            notes=reviewer_comment,
        ))
        excel_table = parse_excel(file_bytes)
    else:
        # No new file — use latest saved attachment
        latest = db.query(RequestAttachment).filter(
            RequestAttachment.request_id == request_id
        ).order_by(RequestAttachment.uploaded_at.desc()).first()
        if latest and os.path.exists(latest.file_path):
            with open(latest.file_path, "rb") as f:
                excel_table = parse_excel(f.read())
        else:
            excel_table = "(no attachment)"

    # Inject reviewer comment into email body for AI context
    augmented_body = (
        f"{req.notes or ''}\n\n"
        f"--- Reviewer Note (Manual Review) ---\n{reviewer_comment}"
    )

    from datetime import datetime, timezone
    try:
        result = run_agent(
            sender=req.sender,
            subject=req.subject or "",
            timestamp=datetime.now(timezone.utc).isoformat(),
            email_body=augmented_body,
            excel_table=excel_table,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {e}")

    # Reset request with new AI output
    req.request_type = result.get("request_type")
    req.vendor_number = result.get("vendor_number")
    req.vendor_name = result.get("vendor_name")
    req.confidence = result.get("confidence")
    req.classification_status = result.get("classification_status")
    req.notes = result.get("notes")
    req.raw_agent_output = result
    req.status = "pending_review"
    req.reviewed_at = None
    req.completed_at = None

    # Replace all items with new extraction
    for old_item in req.items:
        db.delete(old_item)
    db.flush()

    for item in result.get("items", []):
        db.add(RequestItem(
            request_id=req.id,
            account_id=item.get("account_id"),
            field_name=item.get("field_name"),
            current_value=item.get("current_value"),
            proposed_value=item.get("proposed_value"),
        ))

    db.commit()
    db.refresh(req)

    return {
        "request_id": str(req.id),
        "classification_status": req.classification_status,
        "confidence": float(req.confidence) if req.confidence else None,
        "request_type": req.request_type,
        "status": req.status,
        "items_count": len(req.items),
        "notes": req.notes,
    }