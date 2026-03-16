import io
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile, HTTPException
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from database import get_db
from models import Request as RequestModel, RequestItem
from agent import run_agent

limiter = Limiter(key_func=get_remote_address)
router = APIRouter()


def parse_excel(file_bytes: bytes) -> str:
    """
    Read the SAP Vendor Setup/Change form and return a plain-text
    representation of col B (field label) and col C (value) pairs,
    skipping blank rows and dropdown scaffolding.
    """
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        # Use the main form sheet; fall back to first sheet
        sheet_name = "SAP VENDOR SET UP OR CHANGE" if "SAP VENDOR SET UP OR CHANGE" in wb.sheetnames else wb.sheetnames[0]
        ws = wb[sheet_name]
        lines = []
        for row in ws.iter_rows(values_only=True):
            label = row[1] if len(row) > 1 else None
            value = row[2] if len(row) > 2 else None
            if not label or not value:
                continue
            label_str = str(label).strip()
            value_str = str(value).strip()
            if not label_str or not value_str:
                continue
            if value_str in ("SELECT ONE", "") or value_str.startswith("="):
                continue
            lines.append(f"{label_str}: {value_str}")
        return "\n".join(lines) if lines else "(no form data extracted)"
    except Exception as e:
        return f"(failed to parse Excel: {e})"


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
        "vendor_number": req.vendor_number,
        "vendor_name": req.vendor_name,
        "items_count": len(req.items),
        "notes": req.notes,
    }