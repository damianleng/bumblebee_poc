from database import engine, SessionLocal
from models import Base, SapLookup

SAP_SEED = [
    ("100123", "Walmart Inc.",         "[CSR_A]", "North America Sales", "US-South",     "Retail"),
    ("100456", "Kroger Co.",           "[CSR_A]", "North America Sales", "US-Midwest",   "Retail"),
    ("100789", "Target Corporation",   "[CSR_A]", "North America Sales", "US-Central",   "Retail"),
    ("100234", "Costco Wholesale",     "[CSR_D]", "North America Sales", "US-West",      "Wholesale"),
    ("100567", "Safeway Inc.",         "[CSR_D]", "North America Sales", "US-West",      "Retail"),
    ("100890", "Publix Super Markets", "[CSR_C]", "North America Sales", "US-Southeast", "Retail"),
    ("100345", "H-E-B Grocery",       "[CSR_C]", "North America Sales", "US-South",     "Retail"),
    ("100678", "Meijer Inc.",          "[CSR_B]", "North America Sales", "US-Midwest",   "Retail"),
    ("100901", "Hy-Vee Inc.",         "[CSR_B]", "North America Sales", "US-Midwest",   "Retail"),
    ("100112", "Winn-Dixie Stores",   "[CSR_E]", "North America Sales", "US-Southeast", "Retail"),
    ("100223", "Giant Food Stores",   "[CSR_E]", "North America Sales", "US-East",      "Retail"),
    ("100334", "Stop & Shop",         "[CSR_F]", "North America Sales", "US-Northeast", "Retail"),
    ("100445", "Harris Teeter",       "[CSR_F]", "North America Sales", "US-East",      "Retail"),
]


def init():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if db.query(SapLookup).count() == 0:
            print("Seeding sap_lookup...")
            for row in SAP_SEED:
                db.add(SapLookup(
                    account_id=row[0],
                    account_name=row[1],
                    current_csr=row[2],
                    current_partner=row[3],
                    region=row[4],
                    segment=row[5],
                ))
            db.commit()
            print(f"Seeded {len(SAP_SEED)} SAP records.")
        else:
            print("sap_lookup already seeded, skipping.")
    finally:
        db.close()


if __name__ == "__main__":
    init()
