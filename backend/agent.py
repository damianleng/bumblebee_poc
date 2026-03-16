import json
import os
import anthropic

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """
You are a Master Data request parser for an enterprise SAP system.
You read emails and SAP Vendor Setup/Change form attachments and extract the request details into structured JSON.

The Excel attachment is a SAP Vendor Setup/Change form. Field labels appear in column B, and the filled-in values appear in column C.
Key fields to look for: Type (NEW VENDOR or CHANGE EXISTING), VENDOR #, NAME 1, VENDOR ACCT GROUP, VENDOR IN COMPANY CODE,
STREET ADDRESS, CITY, STATE, ZIP, COUNTRY, EIN, PAYMENT TERMS, payment method checkboxes (P-CARD/ACH COMPANY/ACH PERSONAL/CHECK),
BANK KEY, BANK ACCT #, BANK ACCT HOLDER NAME, BANK NAME, DEPOSIT CONFIRMATION EMAIL, and Comments/Special Notes.

Rules:
- ONLY extract fields that are explicitly filled in. Never infer or guess missing values.
- For change_existing requests: only include fields that are actually being changed as items.
- For new_vendor requests: include all filled fields as items (current_value is always null).
- If a field is blank or says "SELECT ONE", skip it.
- Return ONLY valid JSON. No explanation, no markdown, no preamble.
"""

USER_PROMPT_TEMPLATE = """
Email metadata:
- From: {sender}
- Subject: {subject}
- Received: {timestamp}

Email body:
{email_body}

SAP Vendor Form content (col B = field label, col C = value):
{excel_table}

Return this exact JSON:
{{
  "request_type": "new_vendor | change_existing",
  "vendor_number": "e.g. V-002847, or null for new vendors",
  "vendor_name": "NAME 1 value from the form",
  "confidence": 0.0 to 1.0,
  "notes": "key context from the email or the Comments field on the form",
  "items": [
    {{
      "field_name": "SAP field name in UPPER_SNAKE_CASE e.g. BANK_KEY",
      "current_value": "current value if this is a change, else null",
      "proposed_value": "new value from the form"
    }}
  ]
}}
"""


def safe_parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


def validate_extracted(data: dict) -> dict:
    """Step 2 — clean and classify the extracted output."""
    items = data.get("items", [])
    for item in items:
        for key in ("field_name", "current_value", "proposed_value"):
            if item.get(key):
                item[key] = item[key].strip()

    if data.get("vendor_number"):
        data["vendor_number"] = data["vendor_number"].strip()
    if data.get("vendor_name"):
        data["vendor_name"] = data["vendor_name"].strip().upper()

    confidence = float(data.get("confidence", 0))
    data["classification_status"] = (
        "auto_classified" if confidence >= 0.85 else "needs_review"
    )
    data["items"] = items
    return data


def run_agent(
    sender: str,
    subject: str,
    timestamp: str,
    email_body: str,
    excel_table: str = "(no attachment)",
) -> dict:
    """Run the two-step extract + validate pipeline."""
    user_prompt = USER_PROMPT_TEMPLATE.format(
        sender=sender,
        subject=subject,
        timestamp=timestamp,
        email_body=email_body,
        excel_table=excel_table,
    )

    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw_text = response.content[0].text
    extracted = safe_parse_json(raw_text)
    validated = validate_extracted(extracted)
    return validated