-- Bumblebee PoC — Migration 001
-- Safe to run against existing rks-postgres instance.
-- Uses IF NOT EXISTS and ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    request_type VARCHAR(100),
    vendor_number VARCHAR(50),
    vendor_name VARCHAR(255),
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

CREATE TABLE IF NOT EXISTS request_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
    account_id VARCHAR(50),
    field_name VARCHAR(100),
    current_value VARCHAR(255),
    proposed_value VARCHAR(255),
    approval_status VARCHAR(50) DEFAULT 'pending',
    reviewer_comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_lookup (
    vendor_number VARCHAR(50) PRIMARY KEY,
    vendor_name VARCHAR(255) NOT NULL,
    acct_group VARCHAR(100),
    company_code VARCHAR(50),
    street_address VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    zip VARCHAR(20),
    country VARCHAR(50),
    ein VARCHAR(50),
    payment_terms VARCHAR(50),
    payment_method VARCHAR(50),
    bank_key VARCHAR(50),
    bank_acct_number VARCHAR(50),
    bank_acct_holder VARCHAR(255),
    bank_name VARCHAR(255)
);

-- vendor_lookup is intentionally empty at startup.
-- New vendors are inserted here when a new_vendor request is completed via Skybot.

CREATE TABLE IF NOT EXISTS sap_lookup (
    account_id VARCHAR(50) PRIMARY KEY,
    account_name VARCHAR(255) NOT NULL,
    current_csr VARCHAR(255),
    current_partner VARCHAR(255),
    region VARCHAR(100),
    segment VARCHAR(100)
);

INSERT INTO sap_lookup VALUES
('100123', 'Walmart Inc.',          '[CSR_A]', 'North America Sales', 'US-South',     'Retail'),
('100456', 'Kroger Co.',            '[CSR_A]', 'North America Sales', 'US-Midwest',   'Retail'),
('100789', 'Target Corporation',    '[CSR_A]', 'North America Sales', 'US-Central',   'Retail'),
('100234', 'Costco Wholesale',      '[CSR_D]', 'North America Sales', 'US-West',      'Wholesale'),
('100567', 'Safeway Inc.',          '[CSR_D]', 'North America Sales', 'US-West',      'Retail'),
('100890', 'Publix Super Markets',  '[CSR_C]', 'North America Sales', 'US-Southeast', 'Retail'),
('100345', 'H-E-B Grocery',        '[CSR_C]', 'North America Sales', 'US-South',     'Retail'),
('100678', 'Meijer Inc.',           '[CSR_B]', 'North America Sales', 'US-Midwest',   'Retail'),
('100901', 'Hy-Vee Inc.',          '[CSR_B]', 'North America Sales', 'US-Midwest',   'Retail'),
('100112', 'Winn-Dixie Stores',    '[CSR_E]', 'North America Sales', 'US-Southeast', 'Retail'),
('100223', 'Giant Food Stores',    '[CSR_E]', 'North America Sales', 'US-East',      'Retail'),
('100334', 'Stop & Shop',          '[CSR_F]', 'North America Sales', 'US-Northeast', 'Retail'),
('100445', 'Harris Teeter',        '[CSR_F]', 'North America Sales', 'US-East',      'Retail')
ON CONFLICT (account_id) DO NOTHING;