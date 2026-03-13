import io
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from sqlalchemy.orm import Session
import pandas as pd

from database import get_db
from models import Request, RequestItem
from agent import run_agent

router = APIRouter()


def parse_excel(file_bytes: bytes) -> str:
    """Convert Excel attachment to a plain-text table string."""
    try:
        df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")
        return df.to_string(index=False)
    except Exception as e:
        return f"(failed to parse Excel: {e})"


@router.post("/api/ingest")
async def ingest(
    sender: str = Form(...),
    subject: str = Form(...),
    email_body: str = Form(...),
    attachment: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    timestamp = datetime.now(timezone.utc).isoformat()

    excel_table = "(no attachment)"
    if attachment and attachment.filename:
        raw_bytes = await attachment.read()
        excel_table = parse_excel(raw_bytes)

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

    req = Request(
        sender=sender,
        subject=subject,
        request_type=result.get("request_type"),
        sub_type=result.get("sub_type"),
        confidence=result.get("confidence"),
        classification_status=result.get("classification_status"),
        notes=result.get("notes"),
        raw_agent_output=result,
        status="pending_review",
    )
    db.add(req)
    db.flush()

    for item in result.get("items", []):
        account_id = item.get("account_id") or ""
        if not account_id:
            continue  # skip items Claude couldn't resolve an account ID for
        db.add(RequestItem(
            request_id=req.id,
            account_id=account_id,
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
        "sub_type": req.sub_type,
        "items_count": len(req.items),
        "notes": req.notes,
    }