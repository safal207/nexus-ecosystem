# Billing Schema Migration (004)

## Tables Created

1. **eco_subscriptions** — User subscription management
2. **eco_usage_records** — API usage tracking per billing period
3. **eco_stripe_events** — Webhook event log for idempotency

## How to Apply

```
# Local development (reset DB and apply all migrations)
npx supabase db reset

# Or apply specific migrations
npx supabase migration up
```

## Verification

```
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'eco_%';

-- Check indexes
SELECT indexname, tablename FROM pg_indexes
WHERE tablename IN ('eco_subscriptions', 'eco_usage_records', 'eco_stripe_events');
```

## Notes
- Timestamps auto-updated via `update_updated_at_column()` triggers
- `get_current_usage(p_eco_id)` helper returns current period usage if exists
