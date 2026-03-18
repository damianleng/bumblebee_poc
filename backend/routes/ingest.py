from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile, HTTPException
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from database import get_db
from models import Request as RequestModel, RequestItem, RequestAttachment
from agent import run_agent
from utils import parse_excel, save_attachment

limiter = Limiter(key_func=get_remote_address)
router = APIRouter()


@router.post("/api/ingest")
@limiter.limit("10/minute")
async def ingest(
    request: Request,
    sender: str = Form(...),
    subject: str = Form(...),
    email_body: str = Form(...),
    attachment: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    timestamp = datetime.now(timezone.utc).isoformat()

    excel_table = "(no attachment)"
    attachment_filename = None
    attachment_bytes = None
    if attachment and attachment.filename:
        attachment_bytes = await attachment.read()
        attachment_filename = attachment.filename
        excel_table = parse_excel(attachment_bytes)

    try:
        result = run_agent(
            sender=sender,
            subject=subject,
            timestamp=timestamp,
            email_body=email_body,
            excel_table=excel_table,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {e}")

    req = RequestModel(
        sender=sender,
        subject=subject,
        request_type=result.get("request_type"),
        vendor_number=result.get("vendor_number"),
        vendor_name=result.get("vendor_name"),
        confidence=result.get("confidence"),
        classification_status=result.get("classification_status"),
        notes=result.get("notes"),
        raw_agent_output=result,
        status="pending_review",
    )
    db.add(req)
    db.flush()

    for item in result.get("items", []):
        db.add(RequestItem(
            request_id=req.id,
            account_id=item.get("account_id"),
            field_name=item.get("field_name"),
            current_value=item.get("current_value"),
            proposed_value=item.get("proposed_value"),
        ))

    if attachment_bytes and attachment_filename:
        file_path = save_attachment(str(req.id), 1, attachment_filename, attachment_bytes)
        db.add(RequestAttachment(
            request_id=req.id,
            version="1",
            filename=attachment_filename,
            file_path=file_path,
            notes="Original attachment",
        ))

    db.commit()
    db.refresh(req)

    return {
        "request_id": str(req.id),
        "classification_status": req.classification_status,
        "confidence": float(req.confidence) if req.confidence else None,
        "request_type": req.request_type,
        "vendor_number": req.vendor_number,
        "vendor_name": req.vendor_name,
        "items_count": len(req.items),
        "notes": req.notes,
    }