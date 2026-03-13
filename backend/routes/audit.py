from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
from models import Request
from schemas import AuditRow

router = APIRouter()


@router.get("/api/audit", response_model=List[AuditRow])
def audit_log(
    status: Optional[str] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Request)
    if status:
        query = query.filter(Request.status == status)
    if from_date:
        query = query.filter(Request.created_at >= from_date)
    if to_date:
        query = query.filter(Request.created_at <= to_date)
    return query.order_by(Request.created_at.desc()).all()