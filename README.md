# BumbleBee Master Data Automation — PoC

**G7 Tech Services | March 2026 | Confidential — BumbleBee Foods**

AI Agent that automates the Partner Function Change Request and Vendor Setup/Change workflows.
Reads incoming emails + Excel attachments, extracts structured data via Claude, presents to a human reviewer (HITL), and simulates a write-back to SAP via Skybot mock.


## Project Structure

```
poc-bumblebee/
├── backend/
│   ├── main.py              # FastAPI app + lifespan + DB retry loop
│   ├── agent.py             # Two-step Claude pipeline (extract + validate)
│   ├── models.py            # SQLAlchemy models (requests, request_items, request_attachments, sap_lookup, vendor_lookup)
│   ├── schemas.py           # Pydantic response schemas
│   ├── database.py          # DB connection + session
│   ├── seed.py              # sap_lookup seed data (13 accounts)
│   ├── routes/
│   │   ├── ingest.py        # POST /api/ingest — saves attachment to disk as v1
│   │   ├── requests.py      # Request CRUD + approve/deny/flag + attachments + reprocess
│   │   ├── audit.py         # GET /api/audit
│   │   └── skybot.py        # Skybot mock (new_vendor + change_existing)
│   ├── requirements.txt
│   └── Dockerfile
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx        # Request list
│   │   │   ├── SubmitEmail.tsx      # Email + attachment submission form
│   │   │   ├── ParsingResult.tsx    # AI extraction result
│   │   │   ├── HITLReview.tsx       # Delta review + attachments + reprocess
│   │   │   └── AuditDashboard.tsx   # Audit log with filters
│   │   ├── lib/api.ts               # All API calls
│   │   └── components/
│   └── Dockerfile
├── fixtures/
│   ├── fixture_1_new_vendor/        # New vendor setup via SAP form
│   ├── fixture_2_change_vendor/     # Update existing vendor fields
│   ├── fixture_3_ambiguous_form/    # Incomplete vendor form — needs_review
│   ├── fixture_1_bulk_reassignment/ # CSR: 3 accounts reassigned
│   ├── fixture_2_single_update/     # CSR: 1 account update
│   └── fixture_3_ambiguous/         # CSR: vague email, no attachment — needs_review
├── docker-compose.yml       # Production — G7 VM (errekaese_app-network)
├── docker-compose.dev.yml   # Local dev stack
└── README.md
```

---

## Local Development Setup

### Prerequisites
- Docker + Docker Compose
- Anthropic API key

### 1. Environment

Create a `.env` file in the `poc/` root:

```env
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://bumblebee:bumblebee@db:5432/bumblebee_poc
VITE_API_URL=http://localhost:8001
```

### 2. Start the stack

```bash
docker compose -f docker-compose.dev.yml up --build
```

Backend auto-creates all tables and seeds `sap_lookup` on first startup. No manual migration needed.

### 3. Verify

```bash
curl http://localhost:8001/health
# → {"status":"ok"}
```

Frontend: `http://localhost:3000`

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/ingest` | Email + Excel → AI agent → store to DB |
| GET | `/api/requests` | List all requests |
| GET | `/api/requests/:id` | Single request with line items |
| POST | `/api/requests/:id/approve` | Approve all items |
| POST | `/api/requests/:id/deny` | Deny request |
| POST | `/api/requests/:id/flag` | Flag for manual review |
| PATCH | `/api/requests/:id/items/:item_id` | Approve/deny individual line item |
| GET | `/api/requests/:id/attachments` | List all attachment versions |
| GET | `/api/requests/:id/attachments/:att_id/download` | Download a specific attachment version |
| POST | `/api/requests/:id/attachments` | Upload a new attachment version |
| POST | `/api/requests/:id/reprocess` | Re-run AI with updated attachment + reviewer comment |
| GET | `/api/audit` | Full audit log (filterable by status + date) |
| POST | `/api/skybot/execute` | Skybot mock → hardcoded SAP success |

---

## AI Agent Pipeline

```
POST /api/ingest
    └── parse_excel()          # Auto-detects format: SAP vendor form OR CSR table
    └── run_agent()            # Two-step Claude pipeline
        ├── Step 1: Extract    # Claude reads email + Excel → structured JSON
        └── Step 2: Validate   # Strip/clean fields, classify confidence
    └── Store to DB
        ├── requests           # One row per email
        ├── request_items      # One row per extracted change
        └── request_attachments # v1 file saved to /app/uploads/{id}/
```

**Confidence threshold:**
- `>= 0.85` → `auto_classified` (proceed to HITL review)
- `< 0.85` → `needs_review` (re-process panel shown in HITL screen)

### Re-process Flow
```
User downloads attachment → edits in Excel → re-uploads with mandatory comment
    └── POST /api/requests/:id/reprocess
        └── Saves new file as v2, v3... in request_attachments
        └── Injects reviewer comment into AI prompt
        └── Re-runs extraction → resets request to pending_review
```

---

## Demo Scenarios

Three scenarios are built into the **Submit Email** page. Click **Load Scenario** on any card to auto-populate the form (sender, subject, email body, and Excel attachment) — then click **Process Email** to run it.

### Scenario 1 — New Vendor Setup
- **What it shows:** AI reads a SAP Vendor Setup form and extracts all vendor fields (name, address, EIN, banking details). Skybot assigns a new vendor number (e.g. `V-003001`) and writes it to `vendor_lookup`.
- **Expected result:** Confidence ~95% | `auto_classified` | Multiple fields extracted
- **Fixture:** `scenario_3_new_vendor.xlsx`
- **Flow:** Load → Submit → Send for Review → Approve All → Submit to SAP (Skybot)

### Scenario 2 — Update Existing Vendor
- **What it shows:** A follow-up to Scenario 1. The same vendor needs a bank update. AI shows current vs proposed values side by side. Reviewer approves only the changed fields.
- **Prerequisite:** Run Scenario 1 first (vendor must exist in `vendor_lookup`)
- **Expected result:** Confidence ~90% | `auto_classified` | Changed fields extracted
- **Fixture:** `scenario_4_update_vendor.xlsx`
- **Flow:** Load → Submit → Send for Review → review delta → Approve All → Submit to SAP (Skybot)

### Scenario 3 — Ambiguous Vendor Form (Needs Review → Reprocess)
- **What it shows:** An incomplete form causes the AI to flag the request as `needs_review`. The reviewer uploads the completed form, adds a comment, and re-runs the AI — which now extracts a full result. Demonstrates the human-in-the-loop safety net.
- **Expected result (first submit):** Confidence < 85% | `needs_review` | Incomplete extraction
- **Expected result (after reprocess):** Confidence ~90%+ | All fields extracted | Ready for approval
- **Fixture:** `scenario_6_incomplete.xlsx` (first submit) → `scenario_6_complete.xlsx` (reprocess upload)
- **Flow:** Load → Submit → Send for Review → scroll to Re-process panel → upload complete form + add comment → Re-process with AI → Approve All → Submit to SAP (Skybot)

---

## Supported Workflows

### 1. New Vendor Setup
- Attachment: SAP Vendor Setup/Change form (col B = label, col C = value)
- `request_type`: `new_vendor`
- Skybot assigns mock vendor number (V-003001+) and writes to `vendor_lookup`

### 2. Change Existing Vendor
- Same SAP form, Type = CHANGE EXISTING
- `request_type`: `change_existing`
- Current values enriched from `vendor_lookup`
- Skybot applies approved changes to `vendor_lookup`

## Database

Five tables on `rks-postgres`:

| Table | Purpose |
|---|---|
| `requests` | One row per incoming email |
| `request_items` | One row per extracted field change |
| `request_attachments` | Versioned file uploads per request |
| `sap_lookup` | 13 hardcoded SAP accounts (replaces live SAP query) |
| `vendor_lookup` | Vendors created/updated by Skybot mock |

**Reset requests only (keeps SAP seed data):**
```sql
TRUNCATE request_items, request_attachments, requests RESTART IDENTITY CASCADE;
```


## Deployment — G7 VM (Portainer)

Stack deployed via Portainer using GitHub repo.

**Environment variables required:**
```env
DATABASE_URL=postgresql://admin:<password>@rks-postgres:5432/bumblebee_poc
ANTHROPIC_API_KEY=sk-ant-...
VITE_API_URL=http://149.50.148.201:8001
```

**Ports required open on VM firewall:**
- `8001/tcp` — backend API
- `3000/tcp` — frontend

**To redeploy after code changes:**
Portainer → Stack → Editor → Update the stack

---

## Key Constraints

- No real SAP connection — `sap_lookup` and `vendor_lookup` tables only
- No real BumbleBee credentials — fixtures only
- Skybot is always mocked — hardcoded success payload
- No auth in PoC v1 — single shared session
- `rks-api` is untouched — never modify existing G7 services
