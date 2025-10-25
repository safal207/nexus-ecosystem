-- Migration: Usage Tracking Analytics
-- Description: Adds detailed API usage logging and daily aggregation for usage analytics

-- ============================================================================
-- Table: eco_api_usage
-- Purpose: Store raw API call metadata for analytics and debugging
-- ============================================================================

CREATE TABLE IF NOT EXISTS eco_api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eco_id TEXT NOT NULL REFERENCES eco_identities(eco_id) ON DELETE CASCADE,

    -- Request details
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Performance metrics
    response_time_ms INTEGER NOT NULL,
    status_code INTEGER NOT NULL,

    -- API key tracking (if request used API key)
    api_key_id TEXT REFERENCES eco_api_keys(id) ON DELETE SET NULL,

    -- Metadata
    user_agent TEXT,
    ip_address INET,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE eco_api_usage IS 'Raw API usage log for analytics and debugging';
COMMENT ON COLUMN eco_api_usage.response_time_ms IS 'Request latency in milliseconds';
COMMENT ON COLUMN eco_api_usage.status_code IS 'HTTP response status code';

CREATE INDEX IF NOT EXISTS idx_api_usage_eco_id_timestamp
    ON eco_api_usage (eco_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp
    ON eco_api_usage (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint
    ON eco_api_usage (endpoint);
CREATE INDEX IF NOT EXISTS idx_api_usage_status
    ON eco_api_usage (status_code);

-- ============================================================================
-- Function: increment_api_calls
-- Purpose: Increment usage counters for the current billing period
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_api_calls(
    p_eco_id TEXT,
    p_increment INTEGER
) RETURNS VOID AS $$
DECLARE
    v_subscription eco_subscriptions%ROWTYPE;
    v_usage_record eco_usage_records%ROWTYPE;
    v_plan_limit INTEGER;
    v_new_total INTEGER;
    v_overage_calls INTEGER := 0;
    v_overage_cost INTEGER := 0;
BEGIN
    IF p_increment IS NULL OR p_increment <= 0 THEN
        RAISE EXCEPTION 'p_increment must be a positive integer';
    END IF;

    -- Fetch current subscription (latest period)
    SELECT *
    INTO v_subscription
    FROM eco_subscriptions
    WHERE eco_id = p_eco_id
    ORDER BY current_period_start DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No subscription found for eco_id: %', p_eco_id;
    END IF;

    v_plan_limit := CASE v_subscription.plan
        WHEN 'free' THEN 1000
        WHEN 'pro' THEN 100000
        WHEN 'enterprise' THEN -1 -- unlimited
        ELSE -1
    END;

    -- Load existing usage record if it exists
    SELECT *
    INTO v_usage_record
    FROM eco_usage_records
    WHERE eco_id = p_eco_id
      AND billing_period_start = v_subscription.current_period_start
    LIMIT 1;

    IF v_usage_record.id IS NULL THEN
        v_new_total := p_increment;
    ELSE
        v_new_total := v_usage_record.api_calls + p_increment;
    END IF;

    IF v_plan_limit <> -1 THEN
        v_overage_calls := GREATEST(v_new_total - v_plan_limit, 0);
        -- Store overage cost in cents (0.001 USD per call => 0.1 cents)
        v_overage_cost := ROUND(v_overage_calls * 0.1)::INTEGER;
    END IF;

    IF v_usage_record.id IS NULL THEN
        INSERT INTO eco_usage_records (
            eco_id,
            subscription_id,
            api_calls,
            billing_period_start,
            billing_period_end,
            overage_calls,
            overage_cost
        ) VALUES (
            p_eco_id,
            v_subscription.id,
            v_new_total,
            v_subscription.current_period_start,
            v_subscription.current_period_end,
            v_overage_calls,
            v_overage_cost
        );
    ELSE
        UPDATE eco_usage_records
        SET
            subscription_id = COALESCE(v_usage_record.subscription_id, v_subscription.id),
            api_calls = v_new_total,
            overage_calls = v_overage_calls,
            overage_cost = v_overage_cost,
            updated_at = NOW()
        WHERE id = v_usage_record.id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Table: eco_usage_daily
-- Purpose: Store aggregated daily usage metrics for analytics dashboards
-- ============================================================================

CREATE TABLE IF NOT EXISTS eco_usage_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eco_id TEXT NOT NULL REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Aggregated metrics
    total_calls INTEGER NOT NULL DEFAULT 0,
    successful_calls INTEGER NOT NULL DEFAULT 0,
    failed_calls INTEGER NOT NULL DEFAULT 0,
    avg_response_time_ms INTEGER NOT NULL DEFAULT 0,

    -- Top endpoints snapshot
    top_endpoints JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_usage_daily UNIQUE (eco_id, date)
);

COMMENT ON TABLE eco_usage_daily IS 'Daily aggregated API usage metrics per user';
COMMENT ON COLUMN eco_usage_daily.top_endpoints IS 'JSON array of top endpoints with usage stats';

CREATE INDEX IF NOT EXISTS idx_usage_daily_eco_id_date
    ON eco_usage_daily (eco_id, date DESC);

-- ============================================================================
-- Function: aggregate_daily_usage
-- Purpose: Populate eco_usage_daily with aggregated metrics for a given date
-- ============================================================================

CREATE OR REPLACE FUNCTION aggregate_daily_usage(p_date DATE) RETURNS VOID AS $$
BEGIN
    IF p_date IS NULL THEN
        RAISE EXCEPTION 'p_date cannot be null';
    END IF;

    WITH usage_source AS (
        SELECT
            eco_id,
            endpoint,
            method,
            status_code,
            response_time_ms
        FROM eco_api_usage
        WHERE timestamp::DATE = p_date
    ),
    base_stats AS (
        SELECT
            eco_id,
            COUNT(*) AS total_calls,
            COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 299) AS successful_calls,
            COUNT(*) FILTER (WHERE status_code >= 400) AS failed_calls,
            COALESCE(AVG(response_time_ms), 0)::INTEGER AS avg_response_time_ms
        FROM usage_source
        GROUP BY eco_id
    ),
    endpoint_ranked AS (
        SELECT
            eco_id,
            endpoint,
            method,
            COUNT(*) AS call_count,
            COALESCE(AVG(response_time_ms), 0)::INTEGER AS avg_endpoint_response_ms,
            ROW_NUMBER() OVER (
                PARTITION BY eco_id
                ORDER BY COUNT(*) DESC, endpoint
            ) AS rn
        FROM usage_source
        GROUP BY eco_id, endpoint, method
    ),
    endpoint_json AS (
        SELECT
            eco_id,
            jsonb_agg(
                jsonb_build_object(
                    'endpoint', endpoint,
                    'method', method,
                    'count', call_count,
                    'avg_response_time_ms', avg_endpoint_response_ms
                )
                ORDER BY call_count DESC, endpoint
            ) AS top_endpoints
        FROM endpoint_ranked
        WHERE rn <= 10
        GROUP BY eco_id
    )
    INSERT INTO eco_usage_daily (
        eco_id,
        date,
        total_calls,
        successful_calls,
        failed_calls,
        avg_response_time_ms,
        top_endpoints
    )
    SELECT
        bs.eco_id,
        p_date,
        bs.total_calls,
        bs.successful_calls,
        bs.failed_calls,
        bs.avg_response_time_ms,
        COALESCE(ej.top_endpoints, '[]'::JSONB)
    FROM base_stats bs
    LEFT JOIN endpoint_json ej ON ej.eco_id = bs.eco_id
    ON CONFLICT (eco_id, date)
    DO UPDATE SET
        total_calls = EXCLUDED.total_calls,
        successful_calls = EXCLUDED.successful_calls,
        failed_calls = EXCLUDED.failed_calls,
        avg_response_time_ms = EXCLUDED.avg_response_time_ms,
        top_endpoints = EXCLUDED.top_endpoints;
END;
$$ LANGUAGE plpgsql;
