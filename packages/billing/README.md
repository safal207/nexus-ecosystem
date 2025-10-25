# @nexus/billing

Types and helpers for Stripe billing integration in the Nexus Ecosystem.

## Plans

Defined in `src/types.ts`:
- `PLANS.free` — 1,000 API calls/month, no Stripe price
- `PLANS.pro` — 100,000 API calls/month, $29/mo (requires `STRIPE_PRICE_PRO`)
- `PLANS.enterprise` — Unlimited usage, $299/mo (requires `STRIPE_PRICE_ENTERPRISE`)

Environment variables:
```
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
```

Use `validatePlans()` to ensure price IDs are configured; use `requirePriceId(plan)` to assert at runtime.

## Setup Stripe Products/Prices

Run the setup script to create products and prices in your Stripe test account:

```
# 1) Set STRIPE_SECRET_KEY in .env.local (test mode key)
# 2) Run the script
npm run setup:stripe
# 3) Copy printed price IDs to .env.local as STRIPE_PRICE_PRO / STRIPE_PRICE_ENTERPRISE
```

The script is located at `scripts/setup-stripe-products.ts` and can be re-run safely — it will reuse existing prices based on `lookup_key`.

## Development

```
# Build this package (types only)
npm --prefix packages/billing run build
```

## SubscriptionService

Service class for managing user subscriptions and Stripe integration.

### Usage

```ts
import { SubscriptionService } from '@nexus/billing';

const svc = new SubscriptionService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Create free subscription for new user
const sub = await svc.createFreeSubscription('eco_usr_xxx');

// Create checkout session for upgrade
const session = await svc.createCheckoutSession(
  'eco_usr_xxx',
  'user@example.com',
  'pro',
  'https://app.example.com/billing/success',
  'https://app.example.com/billing/cancel'
);

// Check access
const hasAccess = await svc.hasAccess('eco_usr_xxx', 'pro');
```

### Methods

- `createFreeSubscription(ecoId)` — Create free plan subscription
- `getOrCreateStripeCustomer(ecoId, email)` — Get/create Stripe customer
- `createCheckoutSession(...)` — Create Stripe checkout session for upgrade
- `getSubscription(ecoId)` — Get current subscription
- `updateSubscription(ecoId, updates)` — Update subscription fields
- `cancelSubscription(ecoId)` — Cancel at period end
- `reactivateSubscription(ecoId)` — Reactivate canceled subscription
- `hasAccess(ecoId, requiredPlan)` — Check plan access
- `getSubscriptionWithPlan(ecoId)` — Subscription with plan details
- `syncFromStripe(ecoId)` — Manual sync from Stripe
