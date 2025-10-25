# 🚀 Codex - Phase 2: Stripe Integration & Billing System

**Дата выдачи**: 2025-10-10
**Приоритет**: HIGH
**Estimated Duration**: 16-20 часов
**Цель**: Production-ready система биллинга с Stripe

---

## 🎯 Обзор задачи

Привет, Codex! Отличная работа в Phase 1 - 100% выполнение, zero blockers! 🏆

Теперь переходим к монетизации экосистемы. Нужно интегрировать Stripe для подписок и usage-based billing.

**Контекст**:
- У нас есть EcoID для каждого пользователя
- API Keys с rate limiting работают
- Нужна система подписок: Free, Pro, Enterprise
- Usage-based billing: $0.001 за API call сверх квоты

**Бизнес-метрики**:
- Target MRR через 6 месяцев: $5,000
- Target MRR через 12 месяцев: $50,000
- Target ARR через 12 месяцев: $600,000

---

## 📋 Задачи (Tasks 2.1 - 2.5)

### ✅ Предварительная подготовка

1. **Stripe Account Setup**
   - Создать Stripe account (если нет)
   - Получить API keys (test mode)
   - Настроить webhook endpoint

2. **Environment Variables**
   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

---

### Task 2.1: Stripe Product & Price Setup (2-3 часа)

**Цель**: Создать продукты и тарифы в Stripe

**Deliverables**:

1. **Создать Stripe Products через Dashboard или API**:

```typescript
// scripts/setup-stripe-products.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

async function setupProducts() {
  // FREE Plan (no payment, just record in DB)
  // We'll create this as a record in our DB, not in Stripe

  // PRO Plan
  const proPlan = await stripe.products.create({
    name: 'Nexus Pro',
    description: 'Professional plan with 100,000 API calls/month',
    metadata: {
      plan_code: 'pro',
      api_calls_included: '100000',
      eco_tier: 'pro'
    }
  });

  const proPrice = await stripe.prices.create({
    product: proPlan.id,
    unit_amount: 2900, // $29.00
    currency: 'usd',
    recurring: {
      interval: 'month',
    },
    metadata: {
      plan_code: 'pro'
    }
  });

  // ENTERPRISE Plan
  const enterprisePlan = await stripe.products.create({
    name: 'Nexus Enterprise',
    description: 'Enterprise plan with unlimited API calls',
    metadata: {
      plan_code: 'enterprise',
      api_calls_included: 'unlimited',
      eco_tier: 'enterprise'
    }
  });

  const enterprisePrice = await stripe.prices.create({
    product: enterprisePlan.id,
    unit_amount: 29900, // $299.00
    currency: 'usd',
    recurring: {
      interval: 'month',
    },
    metadata: {
      plan_code: 'enterprise'
    }
  });

  console.log('Products created:');
  console.log('Pro:', { productId: proPlan.id, priceId: proPrice.id });
  console.log('Enterprise:', { productId: enterprisePlan.id, priceId: enterprisePrice.id });

  // Сохранить эти ID в .env.local
}

setupProducts();
```

2. **Обновить .env.local**:
   ```
   STRIPE_PRICE_PRO=price_xxx
   STRIPE_PRICE_ENTERPRISE=price_xxx
   ```

3. **Создать типы**:

```typescript
// packages/billing/src/types.ts

export type SubscriptionPlan = 'free' | 'pro' | 'enterprise';

export interface PlanFeatures {
  name: string;
  price: number; // in cents
  apiCallsIncluded: number; // -1 for unlimited
  features: string[];
  stripePriceId?: string; // undefined for free plan
}

export const PLANS: Record<SubscriptionPlan, PlanFeatures> = {
  free: {
    name: 'Free',
    price: 0,
    apiCallsIncluded: 1000,
    features: [
      '1,000 API calls/month',
      'Basic support',
      'Community access',
      'Test mode only'
    ]
  },
  pro: {
    name: 'Pro',
    price: 2900,
    apiCallsIncluded: 100000,
    stripePriceId: process.env.STRIPE_PRICE_PRO!,
    features: [
      '100,000 API calls/month',
      'Priority support',
      'Live mode access',
      'Advanced analytics',
      'Custom webhooks'
    ]
  },
  enterprise: {
    name: 'Enterprise',
    price: 29900,
    apiCallsIncluded: -1, // unlimited
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE!,
    features: [
      'Unlimited API calls',
      '24/7 dedicated support',
      'SLA guarantee',
      'Custom integrations',
      'White-label options',
      'Advanced security'
    ]
  }
};

export interface Subscription {
  id: string;
  eco_id: string;
  plan: SubscriptionPlan;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface UsageRecord {
  id: string;
  eco_id: string;
  subscription_id: string;
  api_calls: number;
  billing_period_start: string;
  billing_period_end: string;
  overage_calls: number; // calls beyond included amount
  overage_cost: number; // in cents
  created_at: string;
}
```

**Success Criteria**:
- ✅ 2 продукта созданы в Stripe
- ✅ Price IDs сохранены в .env
- ✅ Типы определены в TypeScript
- ✅ PLANS константа экспортирована

---

### Task 2.2: Database Schema for Billing (1-2 часа)

**Цель**: Создать таблицы для подписок и usage tracking

**Deliverables**:

```sql
-- supabase/migrations/004_billing_schema.sql

-- Subscriptions table
CREATE TABLE eco_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eco_id TEXT NOT NULL REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'enterprise')),
    status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete')),

    -- Stripe references
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,

    -- Billing periods
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

    -- Ensure one active subscription per user
    CONSTRAINT unique_active_subscription UNIQUE (eco_id)
);

-- Usage tracking table
CREATE TABLE eco_usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eco_id TEXT NOT NULL REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES eco_subscriptions(id) ON DELETE SET NULL,

    -- Usage metrics
    api_calls INTEGER NOT NULL DEFAULT 0,
    billing_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    billing_period_end TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Overage calculation
    overage_calls INTEGER NOT NULL DEFAULT 0,
    overage_cost INTEGER NOT NULL DEFAULT 0, -- in cents

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

    -- One record per user per billing period
    CONSTRAINT unique_usage_period UNIQUE (eco_id, billing_period_start)
);

-- Stripe events log (for webhook idempotency)
CREATE TABLE eco_stripe_events (
    id TEXT PRIMARY KEY, -- Stripe event ID
    type TEXT NOT NULL,
    data JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_subscriptions_eco_id ON eco_subscriptions(eco_id);
CREATE INDEX idx_subscriptions_stripe_customer ON eco_subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON eco_subscriptions(status);
CREATE INDEX idx_usage_eco_id ON eco_usage_records(eco_id);
CREATE INDEX idx_usage_period ON eco_usage_records(billing_period_start, billing_period_end);
CREATE INDEX idx_stripe_events_type ON eco_stripe_events(type);
CREATE INDEX idx_stripe_events_processed ON eco_stripe_events(processed);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON eco_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usage_records_updated_at
    BEFORE UPDATE ON eco_usage_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

**Success Criteria**:
- ✅ Миграция создана
- ✅ Таблицы созданы в Supabase
- ✅ Индексы оптимизированы
- ✅ Constraints работают

---

### Task 2.3: Subscription Service (4-5 часов)

**Цель**: Создать сервис для управления подписками

**Deliverables**:

```typescript
// packages/billing/src/subscription-service.ts

import Stripe from 'stripe';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Subscription, SubscriptionPlan, PLANS } from './types';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

export class SubscriptionService {
  private sb: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.sb = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Create a free subscription for a new user
   */
  async createFreeSubscription(ecoId: string): Promise<Subscription> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const { data, error } = await this.sb
      .from('eco_subscriptions')
      .insert({
        eco_id: ecoId,
        plan: 'free',
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Subscription;
  }

  /**
   * Get or create Stripe customer for an EcoID
   */
  async getOrCreateStripeCustomer(ecoId: string, email: string): Promise<string> {
    // Check if customer already exists
    const { data: existing } = await this.sb
      .from('eco_subscriptions')
      .select('stripe_customer_id')
      .eq('eco_id', ecoId)
      .single();

    if (existing?.stripe_customer_id) {
      return existing.stripe_customer_id;
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email,
      metadata: { eco_id: ecoId },
    });

    // Update subscription with customer ID
    await this.sb
      .from('eco_subscriptions')
      .update({ stripe_customer_id: customer.id })
      .eq('eco_id', ecoId);

    return customer.id;
  }

  /**
   * Create Stripe checkout session for upgrading to paid plan
   */
  async createCheckoutSession(
    ecoId: string,
    email: string,
    plan: 'pro' | 'enterprise',
    successUrl: string,
    cancelUrl: string
  ): Promise<{ sessionId: string; url: string }> {
    const customerId = await this.getOrCreateStripeCustomer(ecoId, email);
    const planConfig = PLANS[plan];

    if (!planConfig.stripePriceId) {
      throw new Error(`No Stripe price ID for plan: ${plan}`);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: planConfig.stripePriceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        eco_id: ecoId,
        plan: plan,
      },
      subscription_data: {
        metadata: {
          eco_id: ecoId,
          plan: plan,
        },
      },
    });

    return {
      sessionId: session.id,
      url: session.url!,
    };
  }

  /**
   * Get current subscription for a user
   */
  async getSubscription(ecoId: string): Promise<Subscription | null> {
    const { data, error } = await this.sb
      .from('eco_subscriptions')
      .select('*')
      .eq('eco_id', ecoId)
      .single();

    if (error || !data) return null;
    return data as Subscription;
  }

  /**
   * Update subscription after Stripe webhook
   */
  async updateSubscription(
    ecoId: string,
    updates: {
      plan?: SubscriptionPlan;
      status?: Subscription['status'];
      stripe_subscription_id?: string;
      current_period_start?: string;
      current_period_end?: string;
      cancel_at_period_end?: boolean;
    }
  ): Promise<void> {
    const { error } = await this.sb
      .from('eco_subscriptions')
      .update(updates)
      .eq('eco_id', ecoId);

    if (error) throw error;
  }

  /**
   * Cancel subscription at period end
   */
  async cancelSubscription(ecoId: string): Promise<void> {
    const subscription = await this.getSubscription(ecoId);
    if (!subscription) throw new Error('Subscription not found');

    if (subscription.stripe_subscription_id) {
      // Cancel in Stripe
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    }

    // Update our DB
    await this.updateSubscription(ecoId, {
      cancel_at_period_end: true,
    });
  }

  /**
   * Reactivate a canceled subscription
   */
  async reactivateSubscription(ecoId: string): Promise<void> {
    const subscription = await this.getSubscription(ecoId);
    if (!subscription) throw new Error('Subscription not found');

    if (subscription.stripe_subscription_id) {
      // Reactivate in Stripe
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: false,
      });
    }

    // Update our DB
    await this.updateSubscription(ecoId, {
      cancel_at_period_end: false,
    });
  }

  /**
   * Check if user has access based on their plan
   */
  async hasAccess(ecoId: string, requiredPlan: SubscriptionPlan): Promise<boolean> {
    const subscription = await this.getSubscription(ecoId);
    if (!subscription || subscription.status !== 'active') return false;

    const planHierarchy: SubscriptionPlan[] = ['free', 'pro', 'enterprise'];
    const userPlanIndex = planHierarchy.indexOf(subscription.plan);
    const requiredPlanIndex = planHierarchy.indexOf(requiredPlan);

    return userPlanIndex >= requiredPlanIndex;
  }
}
```

**Success Criteria**:
- ✅ SubscriptionService class создан
- ✅ Все методы реализованы
- ✅ Stripe интеграция работает
- ✅ DB операции оптимизированы

---

### Task 2.4: Stripe Webhooks (4-5 часов)

**Цель**: Обработка Stripe events через webhooks

**Deliverables**:

```typescript
// apps/web/app/api/webhooks/stripe/route.ts

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { SubscriptionService } from '../../../../../packages/billing/src/subscription-service';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

const subscriptionService = new SubscriptionService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Log Stripe event for idempotency
 */
async function logStripeEvent(event: Stripe.Event): Promise<boolean> {
  const { data: existing } = await supabase
    .from('eco_stripe_events')
    .select('id')
    .eq('id', event.id)
    .single();

  if (existing) {
    console.log(`Event ${event.id} already processed`);
    return false; // Already processed
  }

  await supabase.from('eco_stripe_events').insert({
    id: event.id,
    type: event.type,
    data: event.data,
    processed: false,
  });

  return true; // New event
}

/**
 * Mark event as processed
 */
async function markEventProcessed(eventId: string): Promise<void> {
  await supabase
    .from('eco_stripe_events')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq('id', eventId);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Check for duplicate events (idempotency)
    const isNewEvent = await logStripeEvent(event);
    if (!isNewEvent) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    console.log(`Processing Stripe event: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const ecoId = session.metadata?.eco_id;
        const plan = session.metadata?.plan as 'pro' | 'enterprise';

        if (!ecoId || !plan) {
          console.error('Missing metadata in checkout session');
          break;
        }

        // Get subscription ID from session
        const subscriptionId = session.subscription as string;

        await subscriptionService.updateSubscription(ecoId, {
          plan,
          status: 'active',
          stripe_subscription_id: subscriptionId,
        });

        console.log(`Subscription activated for ${ecoId}: ${plan}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const ecoId = subscription.metadata?.eco_id;

        if (!ecoId) {
          console.error('Missing eco_id in subscription metadata');
          break;
        }

        const periodStart = new Date(subscription.current_period_start * 1000).toISOString();
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        await subscriptionService.updateSubscription(ecoId, {
          status: subscription.status as any,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          cancel_at_period_end: subscription.cancel_at_period_end,
        });

        console.log(`Subscription updated for ${ecoId}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const ecoId = subscription.metadata?.eco_id;

        if (!ecoId) {
          console.error('Missing eco_id in subscription metadata');
          break;
        }

        // Downgrade to free plan
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        await subscriptionService.updateSubscription(ecoId, {
          plan: 'free',
          status: 'active',
          stripe_subscription_id: undefined,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
        });

        console.log(`Subscription downgraded to free for ${ecoId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Get eco_id from customer
        const { data: sub } = await supabase
          .from('eco_subscriptions')
          .select('eco_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (sub) {
          await subscriptionService.updateSubscription(sub.eco_id, {
            status: 'past_due',
          });
          console.log(`Payment failed for ${sub.eco_id}`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { data: sub } = await supabase
          .from('eco_subscriptions')
          .select('eco_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (sub) {
          await subscriptionService.updateSubscription(sub.eco_id, {
            status: 'active',
          });
          console.log(`Payment succeeded for ${sub.eco_id}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    await markEventProcessed(event.id);

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error.message },
      { status: 500 }
    );
  }
}
```

**Webhook Setup**:
1. В Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-domain.com/api/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`
4. Copy webhook secret → добавить в .env как `STRIPE_WEBHOOK_SECRET`

**Success Criteria**:
- ✅ Webhook endpoint создан
- ✅ Signature verification работает
- ✅ Все events обрабатываются
- ✅ Idempotency реализована
- ✅ Webhook зарегистрирован в Stripe

---

### Task 2.5: Subscription Management Endpoints (3-4 часа)

**Цель**: API endpoints для управления подписками

**Deliverables**:

```typescript
// apps/web/app/api/subscriptions/current/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '../../../../../packages/auth/src/middleware';
import { SubscriptionService } from '../../../../../packages/billing/src/subscription-service';

const subscriptionService = new SubscriptionService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const auth = verifyJWT(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subscription = await subscriptionService.getSubscription(auth.user.ecoId);
    if (!subscription) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }

    return NextResponse.json({ subscription });
  } catch (error: any) {
    console.error('Get subscription error:', error);
    return NextResponse.json({ error: 'Failed to get subscription' }, { status: 500 });
  }
}
```

```typescript
// apps/web/app/api/subscriptions/checkout/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '../../../../../packages/auth/src/middleware';
import { SubscriptionService } from '../../../../../packages/billing/src/subscription-service';

const subscriptionService = new SubscriptionService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const auth = verifyJWT(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { plan } = await req.json();

    if (!plan || !['pro', 'enterprise'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const origin = req.headers.get('origin') || 'http://localhost:3000';
    const successUrl = `${origin}/dashboard/billing?success=true`;
    const cancelUrl = `${origin}/dashboard/billing?canceled=true`;

    const session = await subscriptionService.createCheckoutSession(
      auth.user.ecoId,
      auth.user.email,
      plan as 'pro' | 'enterprise',
      successUrl,
      cancelUrl
    );

    return NextResponse.json({
      sessionId: session.sessionId,
      url: session.url,
    });
  } catch (error: any) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
```

```typescript
// apps/web/app/api/subscriptions/cancel/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '../../../../../packages/auth/src/middleware';
import { SubscriptionService } from '../../../../../packages/billing/src/subscription-service';

const subscriptionService = new SubscriptionService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const auth = verifyJWT(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await subscriptionService.cancelSubscription(auth.user.ecoId);

    return NextResponse.json({
      message: 'Subscription will be canceled at the end of the billing period',
    });
  } catch (error: any) {
    console.error('Cancel subscription error:', error);
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 });
  }
}
```

```typescript
// apps/web/app/api/subscriptions/reactivate/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '../../../../../packages/auth/src/middleware';
import { SubscriptionService } from '../../../../../packages/billing/src/subscription-service';

const subscriptionService = new SubscriptionService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const auth = verifyJWT(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await subscriptionService.reactivateSubscription(auth.user.ecoId);

    return NextResponse.json({
      message: 'Subscription reactivated',
    });
  } catch (error: any) {
    console.error('Reactivate subscription error:', error);
    return NextResponse.json({ error: 'Failed to reactivate subscription' }, { status: 500 });
  }
}
```

**API Endpoints Summary**:
- `GET /api/subscriptions/current` - Get current subscription
- `POST /api/subscriptions/checkout` - Create Stripe checkout session
- `POST /api/subscriptions/cancel` - Cancel subscription (at period end)
- `POST /api/subscriptions/reactivate` - Reactivate canceled subscription

**Success Criteria**:
- ✅ Все 4 endpoint'а созданы
- ✅ JWT authentication работает
- ✅ Stripe integration работает
- ✅ Error handling реализован

---

## 🧪 Testing Tasks (for Grok)

### Task T2.1: Subscription Tests (4-5 часов)

```typescript
// packages/billing/__tests__/subscription-service.test.ts

describe('SubscriptionService', () => {
  describe('createFreeSubscription', () => {
    test('should create free subscription with 1 month period');
    test('should set status to active');
    test('should not create Stripe customer');
  });

  describe('createCheckoutSession', () => {
    test('should create Stripe customer if not exists');
    test('should create checkout session with correct price');
    test('should include eco_id in metadata');
  });

  describe('cancelSubscription', () => {
    test('should set cancel_at_period_end to true');
    test('should cancel in Stripe');
  });
});
```

### Task T2.2: Webhook Tests (3-4 часа)

```typescript
// apps/web/__tests__/integration/stripe-webhooks.test.ts

describe('Stripe Webhooks', () => {
  test('should verify webhook signature');
  test('should reject invalid signature');
  test('should handle checkout.session.completed');
  test('should handle subscription.updated');
  test('should handle subscription.deleted');
  test('should handle invoice.payment_failed');
  test('should implement idempotency');
});
```

---

## 📊 Success Criteria (Phase 2)

- ✅ Stripe products & prices созданы
- ✅ Database schema для billing
- ✅ SubscriptionService реализован
- ✅ Webhooks работают
- ✅ API endpoints созданы
- ✅ Tests написаны (>85% coverage)
- ✅ Документация обновлена

---

## 📚 Documentation Updates

Создать/обновить документы:

1. **STRIPE_INTEGRATION.md**
   - Архитектура billing системы
   - Webhook flow diagram
   - Testing guide

2. **API_DOCUMENTATION.md**
   - Все subscription endpoints с примерами
   - Error codes
   - Rate limits

3. **DEPLOYMENT_GUIDE.md**
   - Environment variables
   - Stripe webhook setup
   - Production checklist

---

## 🚀 Next Steps After Completion

1. **Deploy to staging**
2. **Test with real Stripe test cards**
3. **Security audit**
4. **Load testing**
5. **Production deployment**

---

## 💡 Tips & Best Practices

1. **Stripe API Keys**:
   - Use test keys during development
   - Never commit keys to git
   - Use separate keys for staging/production

2. **Webhooks**:
   - Always verify signatures
   - Implement idempotency
   - Log all events
   - Return 200 quickly (process async if needed)

3. **Subscriptions**:
   - Handle all Stripe statuses: active, past_due, canceled, etc.
   - Test payment failures
   - Test subscription cancellation/reactivation

4. **Testing**:
   - Use Stripe test cards: `4242 4242 4242 4242`
   - Test webhook locally with Stripe CLI
   - Mock Stripe API in unit tests

5. **Security**:
   - Validate all inputs
   - Check user owns subscription before modifications
   - Rate limit sensitive endpoints

---

## 🔗 Useful Resources

- [Stripe API Docs](https://stripe.com/docs/api)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe Test Cards](https://stripe.com/docs/testing)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

---

## 📞 Questions?

If you have questions or encounter blockers:
1. Check Stripe documentation
2. Review error logs in Stripe Dashboard
3. Use Stripe CLI for local webhook testing
4. Escalate to Claude/Alexey if needed

---

**Let's build the billing system and move towards that $50M goal!** 🚀💰

Good luck, Codex! You've got this! 🏆
