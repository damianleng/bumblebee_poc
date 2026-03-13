"""
Run once to generate the .xlsx attachments for fixture 1 and fixture 2.
Usage: python fixtures/generate_fixtures.py
"""
import os
import pandas as pd

BASE = os.path.dirname(os.path.abspath(__file__))


def make_fixture_1():
    df = pd.DataFrame([
        {"Account ID": "100123", "Account Name": "Walmart Inc.",       "Field": "CSR", "Current Value": "[CSR_A]", "Proposed Value": "[CSR_B]"},
        {"Account ID": "100456", "Account Name": "Kroger Co.",         "Field": "CSR", "Current Value": "[CSR_A]", "Proposed Value": "[CSR_C]"},
        {"Account ID": "100789", "Account Name": "Target Corporation", "Field": "CSR", "Current Value": "[CSR_A]", "Proposed Value": "[CSR_C]"},
    ])
    path = os.path.join(BASE, "fixture_1_bulk_reassignment", "attachment.xlsx")
    df.to_excel(path, index=False)
    print(f"Created: {path}")


def make_fixture_2():
    df = pd.DataFrame([
        {"Account ID": "100234", "Account Name": "Costco Wholesale", "Field": "CSR", "Current Value": "[CSR_D]", "Proposed Value": "[CSR_B]"},
    ])
    path = os.path.join(BASE, "fixture_2_single_update", "attachment.xlsx")
    df.to_excel(path, index=False)
    print(f"Created: {path}")


if __name__ == "__main__":
    make_fixture_1()
    make_fixture_2()
    print("Done. Fixture 3 has no Excel attachment by design.")
