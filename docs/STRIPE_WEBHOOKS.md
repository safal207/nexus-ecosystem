# Stripe Webhooks Setup & Testing

## Production Setup

### 1. Register Webhook in Stripe Dashboard

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. Enter endpoint URL: `https://your-domain.com/api/webhooks/stripe`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`
5. Copy the webhook signing secret
6. Add to `.env.local`: `STRIPE_WEBHOOK_SECRET=whsec_...`

### 2. Verify Webhook

```
# Test with Stripe CLI
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
```

## Local Development Testing

### Install Stripe CLI

- macOS: `brew install stripe/stripe-cli/stripe`
- Windows (scoop):
  - `scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git`
  - `scoop install stripe`
- Or download from https://github.com/stripe/stripe-cli/releases

### Forward Webhooks to Local Server

```
# Login to Stripe
stripe login

# Forward webhooks to localhost:3000
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Copy the webhook signing secret from output
# Add to .env.local: STRIPE_WEBHOOK_SECRET=whsec_...
```

### Trigger Test Events

```
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
stripe trigger invoice.payment_succeeded
```

### Watch Logs

```
npm run dev
# Look for [Webhook] logs in terminal
```

## Event Handlers

| Event                         | Handler                   | Description                                   |
|------------------------------|---------------------------|-----------------------------------------------|
| checkout.session.completed    | handleCheckoutCompleted   | User completed payment, activate subscription |
| customer.subscription.updated | handleSubscriptionUpdated | Subscription status/period changed            |
| customer.subscription.deleted | handleSubscriptionDeleted | Subscription ended, downgrade to free         |
| invoice.payment_failed        | handlePaymentFailed       | Payment failed, mark as past_due              |
| invoice.payment_succeeded     | handlePaymentSucceeded    | Payment succeeded, reactivate if needed       |

## Idempotency

All webhook events are logged in `eco_stripe_events`:
- Duplicate events are detected and skipped
- Processing errors are logged
- Events can be replayed from the database

## Debugging

```
-- Recent events
SELECT id, type, processed, error, created_at
FROM eco_stripe_events
ORDER BY created_at DESC
LIMIT 20;

-- Failed events
SELECT id, type, error, created_at
FROM eco_stripe_events
WHERE processed = true AND error IS NOT NULL;

-- Unprocessed events (stuck)
SELECT id, type, created_at
FROM eco_stripe_events
WHERE processed = false
AND created_at < NOW() - INTERVAL '1 hour';
```

### Retry Failed Webhook

1. Find event in Stripe Dashboard → Developers → Events
2. Click "Resend webhook"
3. Check logs

### Manual Sync from Stripe

If webhook failed and subscription is out of sync:

```
await subscriptionService.syncFromStripe('eco_usr_xxx');
```

## Security

- Signature verification prevents unauthorized requests
- Idempotency prevents duplicate processing
- Error logging for audit trail
- Metadata validation (eco_id required)
- Status validation before updates

## Monitoring

Key metrics to track:
- Webhook delivery success rate
- Processing latency
- Failed events count
- Retry attempts

## Common Issues

### Webhook Signature Verification Fails

- Ensure STRIPE_WEBHOOK_SECRET is correct
- Ensure raw body is used (not parsed JSON)
- Verify webhook endpoint URL matches Stripe dashboard

### Event Already Processed

- Stripe may retry webhooks — idempotency check will skip duplicates

### Missing eco_id in Metadata

- Ensure eco_id is added as metadata when creating checkout session
- Verify metadata is preserved in subscription

### Webhook Timeout

- Keep handlers fast (<5s)
- Offload heavy work to background jobs
- Return 200 quickly to Stripe
