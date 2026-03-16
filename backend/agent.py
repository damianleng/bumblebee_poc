import json
import os
import anthropic

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """
You are a Master Data request parser for an enterprise SAP system.
You read emails and optional Excel attachments and extract request details into structured JSON.

There are two types of requests you will encounter:

TYPE 1 — Partner Function / CSR Change:
  The attachment (if any) is a simple table with columns like Account ID, Account Name, Field, Current Value, Proposed Value.
  The email will mention reassigning CSRs or partner functions across customer accounts.
  Each item in the output represents one customer account being changed.

TYPE 2 — Vendor Setup / Change:
  The attachment is a SAP Vendor Setup/Change form where field labels appear in column B and values in column C.
  Key header fields (Requestor, Phone, Date, Type) have labels in column E and values in column G.
  The Type field will say NEW VENDOR or CHANGE EXISTING.
  Each item in the output represents one SAP field being created or changed.

Rules:
- Detect which type based on the email content and attachment structure.
- ONLY extract fields that are explicitly stated. Never infer or guess.
- For partner_function_change: each item needs account_id, field_name, current_value, proposed_value.
- For new_vendor: each item needs field_name and proposed_value (current_value is always null).
- For change_existing: only include fields that are being changed as items. account_id is null.
- If a field is blank, missing, or says SELECT ONE, skip it.
- Return ONLY valid JSON. No explanation, no markdown, no preamble.
"""

USER_PROMPT_TEMPLATE = """
Email metadata:
- From: {sender}
- Subject: {subject}
- Received: {timestamp}

Email body:
{email_body}

Attachment content:
{excel_table}

Return this exact JSON:
{{
  "request_type": "partner_function_change | new_vendor | change_existing",
  "vendor_number": "e.g. V-002847 for change_existing, null otherwise",
  "vendor_name": "vendor NAME 1 for vendor requests, null for CSR requests",
  "confidence": 0.0 to 1.0,
  "notes": "key context from the email or form comments",
  "items": [
    {{
      "account_id": "numeric SAP account ID for CSR requests, null for vendor requests",
      "field_name": "field being changed e.g. CSR or BANK_KEY",
      "current_value": "current value if known, else null",
      "proposed_value": "new value being requested"
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
        for key in ("account_id", "field_name", "current_value", "proposed_value"):
            if item.get(key):
                item[key] = item[key].strip()
        # Strip non-numeric from account_id for CSR items
        if item.get("account_id"):
            import re
            item["account_id"] = re.sub(r"\D", "", item["account_id"]) or None

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