-- 003_api_usage_indexes.sql
-- Add composite index for optimizing API usage queries by key_id and timestamp

-- Create composite index on eco_api_usage table for key_id and timestamp DESC
-- This will optimize queries that filter by key_id and order by timestamp (descending)
CREATE INDEX IF NOT EXISTS idx_api_usage_key_timestamp 
ON eco_api_usage (key_id, timestamp DESC);

-- Optional: Also create a simpler index on just key_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_api_usage_key_id 
ON eco_api_usage (key_id);