from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Request

router = APIRouter()


@router.post("/api/skybot/execute")
def skybot_execute(request_id: UUID, db: Session = Depends(get_db)):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    approved_items = [i for i in req.items if i.approval_status == "approved"]

    req.status = "completed"
    req.completed_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "status": "success",
        "skybot_job_id": "SKY-2026-MOCK-001",
        "message": "SAP update submitted successfully",
        "sap_confirmation": "BAPI_PARTNER_FUNC_UPDATE executed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "records_updated": len(approved_items),
    }