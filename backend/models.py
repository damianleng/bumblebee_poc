import uuid
from sqlalchemy import Column, String, Text, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB, TIMESTAMP as TIMESTAMPTZ
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Request(Base):
    __tablename__ = "requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sender = Column(String(255), nullable=False)
    subject = Column(String(500))
    request_type = Column(String(100))
    vendor_number = Column(String(50))
    vendor_name = Column(String(255))
    confidence = Column(Numeric(3, 2))
    classification_status = Column(String(50))
    notes = Column(Text)
    raw_agent_output = Column(JSONB)
    status = Column(String(50), default="pending_review")
    reviewer = Column(String(255))
    created_at = Column(TIMESTAMPTZ, server_default=func.now())
    reviewed_at = Column(TIMESTAMPTZ)
    completed_at = Column(TIMESTAMPTZ)

    items = relationship("RequestItem", back_populates="request", cascade="all, delete")


class RequestItem(Base):
    __tablename__ = "request_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id = Column(UUID(as_uuid=True), ForeignKey("requests.id", ondelete="CASCADE"))
    field_name = Column(String(100))
    current_value = Column(String(255))
    proposed_value = Column(String(255))
    approval_status = Column(String(50), default="pending")
    reviewer_comment = Column(Text)
    created_at = Column(TIMESTAMPTZ, server_default=func.now())

    request = relationship("Request", back_populates="items")


class VendorLookup(Base):
    __tablename__ = "vendor_lookup"

    vendor_number = Column(String(50), primary_key=True)
    vendor_name = Column(String(255), nullable=False)
    acct_group = Column(String(100))
    company_code = Column(String(50))
    street_address = Column(String(255))
    city = Column(String(100))
    state = Column(String(50))
    zip = Column(String(20))
    country = Column(String(50))
    ein = Column(String(50))
    payment_terms = Column(String(50))
    payment_method = Column(String(50))
    bank_key = Column(String(50))
    bank_acct_number = Column(String(50))
    bank_acct_holder = Column(String(255))
    bank_name = Column(String(255))
