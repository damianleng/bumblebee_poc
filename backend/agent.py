import json
import re
import os
import anthropic

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """
You are a Master Data request parser for an enterprise SAP system.
Read the email and Excel attachment and extract request details into structured JSON.
ONLY extract what is explicitly stated. Never infer or guess.
If a field is missing, return null.
Return ONLY valid JSON. No explanation, no markdown, no preamble.
"""

USER_PROMPT_TEMPLATE = """
Email metadata:
- From: {sender}
- Subject: {subject}
- Received: {timestamp}

Email body:
{email_body}

Excel attachment content:
{excel_table}

Return this exact JSON:
{{
  "request_type": "partner_function_change | vendor_change | material_update | new_vendor",
  "sub_type": "e.g. csr_reassignment",
  "confidence": 0.0 to 1.0,
  "notes": "important context from the email",
  "items": [
    {{
      "account_id": "numeric SAP account ID only",
      "field_name": "field being changed e.g. CSR",
      "current_value": "current value if mentioned, else null",
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
        # Strip non-numeric from account_id
        if item.get("account_id"):
            item["account_id"] = re.sub(r"\D", "", item["account_id"])
        # Trim strings
        for key in ("field_name", "current_value", "proposed_value"):
            if item.get(key):
                item[key] = item[key].strip()

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