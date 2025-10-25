-- Migration: Create API keys table
-- Description: Adds tables for managing API keys in the Nexus ecosystem

-- Create the eco_api_keys table
CREATE TABLE eco_api_keys (
    id TEXT PRIMARY KEY,
    eco_id TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    scopes TEXT[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    test_mode BOOLEAN DEFAULT FALSE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- Create the eco_api_usage table for rate limiting
CREATE TABLE eco_api_usage (
    id BIGSERIAL PRIMARY KEY,
    key_id TEXT NOT NULL REFERENCES eco_api_keys(id) ON DELETE CASCADE,
    ts TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    count INTEGER NOT NULL DEFAULT 1
);

-- Create indexes for performance
CREATE INDEX idx_eco_api_keys_eco_id ON eco_api_keys(eco_id);
CREATE INDEX idx_eco_api_keys_status ON eco_api_keys(status);
CREATE INDEX idx_eco_api_keys_last_used_at ON eco_api_keys(last_used_at);
CREATE INDEX idx_eco_api_usage_key_id ON eco_api_usage(key_id);
CREATE INDEX idx_eco_api_usage_ts ON eco_api_usage(ts);