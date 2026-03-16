from database import engine, SessionLocal
from models import Base, VendorLookup

def init():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    print("vendor_lookup starts empty — vendors are added when new_vendor requests complete.")


if __name__ == "__main__":
    init()
