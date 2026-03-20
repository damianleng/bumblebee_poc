from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from models import Request, VendorLookup

router = APIRouter()

# Mock vendor number counter — in a real integration SAP assigns this
_MOCK_VENDOR_COUNTER = 3001


@router.post("/api/demo/reset")
def demo_reset(db: Session = Depends(get_db)):
    global _MOCK_VENDOR_COUNTER
    _MOCK_VENDOR_COUNTER = 3001
    db.execute(text("DELETE FROM vendor_lookup WHERE vendor_number LIKE 'V-003%'"))
    db.commit()
    return {"status": "ok", "message": "Vendor counter reset to V-003001 and mock vendor rows cleared."}


@router.post("/api/skybot/execute")
def skybot_execute(request_id: UUID, db: Session = Depends(get_db)):
    global _MOCK_VENDOR_COUNTER

    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    approved_items = [i for i in req.items if i.approval_status == "approved"]

    # For new_vendor requests: write the approved fields into vendor_lookup
    # so future change requests can show current values in the HITL screen
    assigned_vendor_number = req.vendor_number
    if req.request_type == "new_vendor":
        assigned_vendor_number = f"V-{_MOCK_VENDOR_COUNTER:06d}"
        _MOCK_VENDOR_COUNTER += 1

        field_map = {item.field_name: item.proposed_value for item in approved_items}
        new_vendor = VendorLookup(
            vendor_number=assigned_vendor_number,
            vendor_name=req.vendor_name or field_map.get("VENDOR_NAME"),
            acct_group=field_map.get("VENDOR_ACCT_GROUP"),
            company_code=field_map.get("COMPANY_CODE"),
            street_address=field_map.get("STREET_ADDRESS"),
            city=field_map.get("CITY"),
            state=field_map.get("STATE"),
            zip=field_map.get("ZIP"),
            country=field_map.get("COUNTRY"),
            ein=field_map.get("EIN"),
            payment_terms=field_map.get("PAYMENT_TERMS"),
            payment_method=field_map.get("PAYMENT_METHOD"),
            bank_key=field_map.get("BANK_KEY"),
            bank_acct_number=field_map.get("BANK_ACCT_NUMBER"),
            bank_acct_holder=field_map.get("BANK_ACCT_HOLDER"),
            bank_name=field_map.get("BANK_NAME"),
        )
        db.add(new_vendor)
        # Store the assigned number back on the request for audit trail
        req.vendor_number = assigned_vendor_number

    # For change_existing requests: apply approved field changes to vendor_lookup
    elif req.request_type == "change_existing" and req.vendor_number:
        vendor = db.query(VendorLookup).filter(
            VendorLookup.vendor_number == req.vendor_number
        ).first()
        if vendor:
            field_setters = {
                # Underscore keys
                "VENDOR_NAME": "vendor_name", "VENDOR_ACCT_GROUP": "acct_group",
                "COMPANY_CODE": "company_code", "STREET_ADDRESS": "street_address",
                "CITY": "city", "STATE": "state", "ZIP": "zip", "COUNTRY": "country",
                "EIN": "ein", "PAYMENT_TERMS": "payment_terms",
                "PAYMENT_METHOD": "payment_method", "BANK_KEY": "bank_key",
                "BANK_ACCT_NUMBER": "bank_acct_number", "BANK_ACCT_HOLDER": "bank_acct_holder",
                "BANK_NAME": "bank_name",
                # Space/alternate keys (as AI extracts from SAP form labels)
                "BANK KEY": "bank_key",
                "BANK ACCT #": "bank_acct_number",
                "BANK ACCT HOLDER NAME": "bank_acct_holder",
                "BANK NAME": "bank_name",
                "BANK COUNTRY": "country",
                "PAYMENT METHOD": "payment_method",
                "ACH COMPANY": "payment_method",
            }
            for item in approved_items:
                attr = field_setters.get(item.field_name)
                if attr and item.proposed_value:
                    setattr(vendor, attr, item.proposed_value)

    req.status = "completed"
    req.completed_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "status": "success",
        "skybot_job_id": "SKY-2026-MOCK-001",
        "message": "SAP update submitted successfully",
        "sap_confirmation": "BAPI_VENDOR_CREATE executed" if req.request_type == "new_vendor" else "BAPI_VENDOR_CHANGE executed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "records_updated": len(approved_items),
        "vendor_number": assigned_vendor_number,
    }