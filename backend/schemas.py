from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from decimal import Decimal


class RequestItemOut(BaseModel):
    id: UUID
    request_id: UUID
    field_name: Optional[str]
    current_value: Optional[str]
    proposed_value: Optional[str]
    approval_status: str
    reviewer_comment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class RequestOut(BaseModel):
    id: UUID
    sender: str
    subject: Optional[str]
    request_type: Optional[str]
    vendor_number: Optional[str]
    vendor_name: Optional[str]
    confidence: Optional[Decimal]
    classification_status: Optional[str]
    notes: Optional[str]
    status: str
    reviewer: Optional[str]
    created_at: datetime
    reviewed_at: Optional[datetime]
    completed_at: Optional[datetime]
    items: List[RequestItemOut] = []

    class Config:
        from_attributes = True


class RequestListOut(BaseModel):
    id: UUID
    sender: str
    subject: Optional[str]
    request_type: Optional[str]
    vendor_number: Optional[str]
    vendor_name: Optional[str]
    confidence: Optional[Decimal]
    classification_status: Optional[str]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ItemPatchIn(BaseModel):
    approval_status: str  # "approved" | "denied"
    reviewer_comment: Optional[str] = None


class AuditRow(BaseModel):
    id: UUID
    sender: str
    request_type: Optional[str]
    status: str
    classification_status: Optional[str]
    reviewer: Optional[str]
    created_at: datetime
    reviewed_at: Optional[datetime]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True