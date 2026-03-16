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