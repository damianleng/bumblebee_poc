# CLAUDE.md — Bumblebee Master Data Automation PoC

## Project Overview

You are building a **Master Data Automation AI Agent** PoC for BumbleBee Foods, developed
by G7 Tech Services. The PoC automates the Partner Function Change Request workflow —
the highest-frequency pain point identified during the March 5, 2026 discovery session.

**Single developer build. Use Claude Code to accelerate full-stack development.**

---

## Business Context

BumbleBee Foods receives 15–17 emails per day requesting changes to SAP vendor/account
records. Today this is 100% manual — analysts read emails, look up SAP values, enter changes
by hand. Each mistake has downstream financial consequences.

The PoC shows a working AI Agent that:
1. Reads incoming emails + Excel attachments
2. Extracts the requested data changes into structured JSON
3. Presents them to a human reviewer (HITL) for approval
4. Simulates a write-back to SAP via Skybot (hardcoded mock in PoC)
5. Logs a full audit trail

**Hero scenario: Partner Function Change Request** — reassigning CSR (Customer Service
Representative) across a list of Sold-To accounts. This mirrors the exact email the Supply Chain Manager sends to the Master Data inbox.

---

## Infrastructure

**No AWS. No cloud. Everything runs on G7's existing on-premises Docker/Portainer server.**

### Existing Stack (errekaese — already running, do not modify)
| Service | Port | Role |
|---|---|---|
| rks-postgres | 5432 | PostgreSQL 16 — reuse, add new tables only |
| rks-api | 8000 | Existing G7 API — do not touch |
| rks-n8n | 5678 | n8n automation — optional webhook trigger for demo |
| botiza-zep | — | Zep memory — Phase 2 only, ignore for now |
| Portainer | 9443 | Container management — monitor PoC here |

### New Service (you build this)
| Service | Port | Role |
|---|---|---|
| poc-bumblebee | 8001 | FastAPI backend — new service in errekaese stack |
| poc-bumblebee-frontend | 3000 | React SPA — served from nginx or same container |

### VM Specs
- 2 vCPU, 4GB RAM, 20GB storage, Ubuntu 22.04 LTS
- PostgreSQL 16 on rks-postgres

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) — Single Page App |
| Backend | Python FastAPI |
| AI Agent | Anthropic Claude API (claude-sonnet-4-5) via anthropic SDK |
| Database | PostgreSQL 16 via rks-postgres (psycopg3 — no ORM) |
| File Storage | Local Docker volume (no S3) |
| Excel Parsing | pandas + openpyxl |
| Containerization | Docker + Docker Compose |
| Container Mgmt | Portainer (errekaese stack) |
| SAP Integration | Skybot mock — hardcoded success JSON |

---

## Database Schema

Connect to: `rks-postgres` (port 5432). Add these tables to the existing instance.

```sql
-- Core request entity — one row per incoming email
CREATE TABLE requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    request_type VARCHAR(100),
    sub_type VARCHAR(100),
    confidence DECIMAL(3,2),
    classification_status VARCHAR(50),
    notes TEXT,
    raw_agent_output JSONB,
    status VARCHAR(50) DEFAULT 'pending_review',
    reviewer VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- One row per extracted line item within a request
CREATE TABLE request_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
    account_id VARCHAR(50) NOT NULL,
    field_name VARCHAR(100),
    current_value VARCHAR(255),
    proposed_value VARCHAR(255),
    approval_status VARCHAR(50) DEFAULT 'pending',
    reviewer_comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hardcoded SAP reference table — replaces live SAP query in PoC
CREATE TABLE sap_lookup (
    account_id VARCHAR(50) PRIMARY KEY,
    account_name VARCHAR(255) NOT NULL,
    current_csr VARCHAR(255),
    current_partner VARCHAR(255),
    region VARCHAR(100),
    segment VARCHAR(100)
);

-- Seed data
INSERT INTO sap_lookup VALUES
('100123', 'Walmart Inc.',          '[CSR_A]',   'North America Sales', 'US-South',    'Retail'),
('100456', 'Kroger Co.',            '[CSR_A]',   'North America Sales', 'US-Midwest',  'Retail'),
('100789', 'Target Corporation',    '[CSR_A]',   'North America Sales', 'US-Central',  'Retail'),
('100234', 'Costco Wholesale',      '[CSR_D]',     'North America Sales', 'US-West',     'Wholesale'),
('100567', 'Safeway Inc.',          '[CSR_D]',     'North America Sales', 'US-West',     'Retail'),
('100890', 'Publix Super Markets',  '[CSR_C]','North America Sales', 'US-Southeast','Retail'),
('100345', 'H-E-B Grocery',        '[CSR_C]','North America Sales', 'US-South',    'Retail'),
('100678', 'Meijer Inc.',           '[CSR_B]','North America Sales', 'US-Midwest',  'Retail'),
('100901', 'Hy-Vee Inc.',          '[CSR_B]','North America Sales', 'US-Midwest',  'Retail'),
('100112', 'Winn-Dixie Stores',    '[CSR_E]',  'North America Sales', 'US-Southeast','Retail'),
('100223', 'Giant Food Stores',    '[CSR_E]',  'North America Sales', 'US-East',     'Retail'),
('100334', 'Stop & Shop',          '[CSR_F]',   'North America Sales', 'US-Northeast','Retail'),
('100445', 'Harris Teeter',        '[CSR_F]',   'North America Sales', 'US-East',     'Retail');
```

---

## AI Agent Design

### Two-Step Pipeline

**Step 1 — Extract**
```python
SYSTEM_PROMPT = """
You are a Master Data request parser for an enterprise SAP system.
Read the email and Excel attachment and extract request details into structured JSON.
ONLY extract what is explicitly stated. Never infer or guess.
If a field is missing, return null.
Return ONLY valid JSON. No explanation, no markdown, no preamble.
"""

USER_PROMPT = """
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
```

**Step 2 — Validate**
- Strip non-numeric chars from account_id
- Trim all string values
- confidence >= 0.85 → `auto_classified`
- confidence < 0.85 → `needs_review`
- Never invent values — missing fields → null

### Safe JSON Parsing
```python
def safe_parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())
```

---

## API Endpoints

```
POST   /api/ingest                          — Email + Excel → AI agent → store to DB
GET    /api/requests                        — List all requests
GET    /api/requests/:id                    — Single request with items
POST   /api/requests/:id/approve            — Approve all items → trigger Skybot mock
POST   /api/requests/:id/deny              — Deny request
POST   /api/requests/:id/flag              — Flag for manual review
PATCH  /api/requests/:id/items/:item_id    — Approve/deny individual line item
GET    /api/audit                           — Full audit log
POST   /api/skybot/execute                 — Skybot mock → hardcoded success payload
GET    /health                              — Health check
```

### Skybot Mock Response
```json
{
  "status": "success",
  "skybot_job_id": "SKY-2026-MOCK-001",
  "message": "SAP update submitted successfully",
  "sap_confirmation": "BAPI_PARTNER_FUNC_UPDATE executed",
  "timestamp": "<current ISO timestamp>",
  "records_updated": "<count of approved items>"
}
```

---

## Frontend — 4 Screens

**Screen 1 — Dashboard**
- Table: Request ID, Sender, Request Type, Submitted, Status, Actions
- Status badges: pending_review (yellow), in_review (blue), approved (green), denied (red), completed (dark green), flagged (orange)
- Upload button: drag-and-drop email body + Excel file

**Screen 2 — AI Parsing Result**
- Card: Sender, Timestamp, Request Type, Confidence score, Classification status
- Extracted table: Account ID | Account Name | Field | Current Value | Proposed Value
- Buttons: "Send for Review" | "Flag for Manual Review"

**Screen 3 — HITL Delta Screen**
- Side-by-side: SAP Current Values vs AI Proposed Changes
- Per line item: Approve ✓ | Deny ✗ | Comment
- Request-level: Approve All | Deny All
- Submit → Skybot mock

**Screen 4 — Audit Dashboard**
- Table: Request ID | Sender | Request Type | Submitted | Status | Reviewed By | Completed
- Filter by status and date range

---

## Project Structure

```
poc-bumblebee/
├── backend/
│   ├── main.py
│   ├── agent.py             # Two-step Claude pipeline
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas
│   ├── database.py          # DB connection
│   ├── routes/
│   │   ├── ingest.py
│   │   ├── requests.py
│   │   ├── audit.py
│   │   └── skybot.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── ParsingResult.jsx
│   │   │   ├── HITLReview.jsx
│   │   │   └── AuditDashboard.jsx
│   │   └── components/
│   └── package.json
├── migrations/
│   └── 001_init.sql         # DB schema + sap_lookup seed data
├── fixtures/
│   ├── fixture_1_bulk_reassignment/
│   │   ├── email.txt
│   │   └── attachment.xlsx
│   ├── fixture_2_single_update/
│   │   ├── email.txt
│   │   └── attachment.xlsx
│   └── fixture_3_ambiguous/
│       └── email.txt
├── Dockerfile
├── docker-compose.yml
└── CLAUDE.md
```

---

## Phase 1 Checklist (Weeks 1–2)

### Week 1 — Infrastructure & Scaffold
- [ ] Connect to G7 VM via RDP (Microsoft Remote Desktop)
- [ ] Access Portainer at port 9443
- [ ] Get rks-postgres credentials from infra dev
- [ ] Create `bumblebee_poc` database on rks-postgres
- [ ] Run migrations/001_init.sql — create all 3 tables + seed sap_lookup
- [ ] Scaffold FastAPI project with /health endpoint
- [ ] Add poc-bumblebee service to errekaese docker-compose
- [ ] Verify service visible and healthy in Portainer

### Week 2 — AI Agent Pipeline
- [ ] Build POST /api/ingest endpoint (accept email body + Excel upload)
- [ ] Build Excel parser with pandas + openpyxl
- [ ] Integrate Anthropic SDK — two-step extract + validate
- [ ] Test against all 3 demo fixtures
- [ ] Store results to rks-postgres
- [ ] Postman test: email + Excel in → JSON out → stored in DB

**Phase 1 Deliverable:** curl/Postman demo showing POST /api/ingest → correct JSON → stored in rks-postgres → service visible in Portainer.

---

## Demo Fixtures

**Fixture 1 — CSR Bulk Reassignment (hero scenario)**
- Sender: Sales Operations User
- 3 accounts: 100123 → [CSR_B], 100456 + 100789 → [CSR_C]
- Expected confidence: ~0.95, auto_classified

**Fixture 2 — Single Account Update**
- Sender: Regional Sales Manager
- 1 account only — tests single-item edge case
- Expected confidence: ~0.90, auto_classified

**Fixture 3 — Ambiguous Email (no Excel)**
- Sender: Procurement User
- Free-text only, partial account info
- Expected confidence: < 0.85, needs_review

---

## Key Rules

- **Never connect to real SAP** — sap_lookup table only
- **Never use real BumbleBee credentials** — fixtures only
- **Skybot is always mocked** — hardcoded success payload
- **Single shared login** — no auth in PoC v1
- **rks-api is untouched** — never modify existing G7 services
- **AI parsing must work on varied input** — not just fixture emails
- **Audit log must have real timestamps** — no fake data

---

## Success Criteria (Section 7 of POC Document)

1. 3/3 fixture emails correctly extracted — confirmed by G7 team pre-demo
2. Non-technical user completes full HITL flow in under 3 minutes
3. Audit table shows complete record with real timestamps for all demo requests
4. Skybot mock returns success and status updates to Completed in dashboard
5. BumbleBee stakeholders confirm demo mirrors their real daily workflow

---

*G7 Tech Services | March 2026 | Confidential — BumbleBee Foods PoC*