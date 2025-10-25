-- Nexus Ecosystem API Keys Migration
-- Create tables for API key management

-- Create the eco_api_keys table
CREATE TABLE IF NOT EXISTS eco_api_keys (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    environment VARCHAR(10) NOT NULL DEFAULT 'live' CHECK (environment IN ('test', 'live')),
    rate_limit INTEGER NOT NULL DEFAULT 1000,
    scopes TEXT[] DEFAULT '{}',
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_eco_api_keys_user_id ON eco_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_eco_api_keys_revoked ON eco_api_keys(revoked);
CREATE INDEX IF NOT EXISTS idx_eco_api_keys_created_at ON eco_api_keys(created_at);

-- Create the eco_api_usage table for tracking rate limits and usage
CREATE TABLE IF NOT EXISTS eco_api_usage (
    id SERIAL PRIMARY KEY,
    key_id VARCHAR(64) NOT NULL,
    request_path VARCHAR(500),
    request_method VARCHAR(10),
    response_status INTEGER,
    request_size INTEGER,
    response_size INTEGER,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (key_id) REFERENCES eco_api_keys(id) ON DELETE CASCADE
);

-- Create indexes for the usage table
CREATE INDEX IF NOT EXISTS idx_eco_api_usage_key_id ON eco_api_usage(key_id);
CREATE INDEX IF NOT EXISTS idx_eco_api_usage_timestamp ON eco_api_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_eco_api_usage_key_timestamp ON eco_api_usage(key_id, timestamp);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update the updated_at column
CREATE TRIGGER update_eco_api_keys_updated_at 
    BEFORE UPDATE ON eco_api_keys 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();