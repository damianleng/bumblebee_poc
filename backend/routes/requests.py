from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Request, RequestItem, SapLookup, VendorLookup
from schemas import RequestOut, RequestListOut, ItemPatchIn

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