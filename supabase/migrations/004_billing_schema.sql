-- Migration: Create Billing Schema
-- Description: Adds tables for subscriptions, usage tracking, and Stripe events

-- =============================================================================
-- Table: eco_subscriptions
-- Purpose: Store user subscription information
-- =============================================================================

CREATE TABLE IF NOT EXISTS eco_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    eco_id TEXT NOT NULL REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'enterprise')),
    status TEXT NOT NULL CHECK (
      status IN (
        'active', 'canceled', 'past_due', 'trialing', 'incomplete',
        'incomplete_expired', 'unpaid'
      )
    ),

    -- Stripe references
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,

    -- Billing periods
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,

    -- Metadata
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Ensure one subscription per user
    CONSTRAINT unique_eco_id_subscription UNIQUE (eco_id)
);

COMMENT ON TABLE eco_subscriptions IS 'User subscription plans and Stripe billing information';
COMMENT ON COLUMN eco_subscriptions.plan IS 'Subscription tier: free, pro, or enterprise';
COMMENT ON COLUMN eco_subscriptions.status IS 'Subscription status synchronized with Stripe';
COMMENT ON COLUMN eco_subscriptions.cancel_at_period_end IS 'Whether subscription will be canceled at period end';

-- =============================================================================
-- Table: eco_usage_records
-- Purpose: Track API usage per billing period for overage billing
-- =============================================================================

CREATE TABLE IF NOT EXISTS eco_usage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    eco_id TEXT NOT NULL REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES eco_subscriptions(id) ON DELETE SET NULL,

    -- Usage metrics
    api_calls INTEGER NOT NULL DEFAULT 0,
    billing_period_start TIMESTAMPTZ NOT NULL,
    billing_period_end TIMESTAMPTZ NOT NULL,

    -- Overage calculation
    overage_calls INTEGER NOT NULL DEFAULT 0,
    overage_cost INTEGER NOT NULL DEFAULT 0, -- in cents ($0.001 per call)

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- One record per user per billing period
    CONSTRAINT unique_usage_period UNIQUE (eco_id, billing_period_start)
);

COMMENT ON TABLE eco_usage_records IS 'API usage tracking for billing periods and overage charges';
COMMENT ON COLUMN eco_usage_records.api_calls IS 'Total API calls made during the period';
COMMENT ON COLUMN eco_usage_records.overage_calls IS 'API calls beyond included quota';
COMMENT ON COLUMN eco_usage_records.overage_cost IS 'Cost in cents for overage usage ($0.001 per call)';

-- =============================================================================
-- Table: eco_stripe_events
-- Purpose: Log Stripe webhook events for idempotency and debugging
-- =============================================================================

CREATE TABLE IF NOT EXISTS eco_stripe_events (
    id TEXT PRIMARY KEY, -- Stripe event ID
    type TEXT NOT NULL,
    data JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE eco_stripe_events IS 'Stripe webhook event log for idempotency and audit trail';
COMMENT ON COLUMN eco_stripe_events.id IS 'Stripe event ID (evt_xxx)';
COMMENT ON COLUMN eco_stripe_events.processed IS 'Whether the event has been successfully processed';
COMMENT ON COLUMN eco_stripe_events.error IS 'Error message if processing failed';

-- =============================================================================
-- Indexes for Performance
-- =============================================================================

-- Subscriptions indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_eco_id ON eco_subscriptions(eco_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON eco_subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON eco_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON eco_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON eco_subscriptions(plan);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON eco_subscriptions(current_period_end);

-- Usage records indexes
CREATE INDEX IF NOT EXISTS idx_usage_eco_id ON eco_usage_records(eco_id);
CREATE INDEX IF NOT EXISTS idx_usage_subscription_id ON eco_usage_records(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_period ON eco_usage_records(billing_period_start, billing_period_end);
CREATE INDEX IF NOT EXISTS idx_usage_period_start ON eco_usage_records(billing_period_start DESC);

-- Stripe events indexes
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON eco_stripe_events(type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed ON eco_stripe_events(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_stripe_events_created_at ON eco_stripe_events(created_at DESC);

-- =============================================================================
-- Triggers for Auto-updating Timestamps
-- =============================================================================

-- Function to update updated_at column (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for eco_subscriptions
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON eco_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for eco_usage_records
CREATE TRIGGER update_usage_records_updated_at
    BEFORE UPDATE ON eco_usage_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Helper Functions
-- =============================================================================

-- Function to get current usage for a user
CREATE OR REPLACE FUNCTION get_current_usage(p_eco_id TEXT)
RETURNS TABLE (
    api_calls INTEGER,
    overage_calls INTEGER,
    overage_cost INTEGER,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ur.api_calls,
        ur.overage_calls,
        ur.overage_cost,
        ur.billing_period_start,
        ur.billing_period_end
    FROM eco_usage_records ur
    WHERE ur.eco_id = p_eco_id
      AND ur.billing_period_start <= NOW()
      AND ur.billing_period_end > NOW()
    ORDER BY ur.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_current_usage IS 'Get current billing period usage for a user';

-- =============================================================================
-- Initial Data / Seed
-- =============================================================================

-- Note: Free subscriptions are created on user registration
-- No seed data needed here

