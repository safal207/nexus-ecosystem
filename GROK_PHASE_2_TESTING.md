# 🧪 Grok - Phase 2: Billing System Testing

**Дата выдачи**: 2025-10-10
**Приоритет**: HIGH
**Estimated Duration**: 8-10 часов
**Цель**: Comprehensive testing билинговой системы

---

## 🎯 Обзор задачи

Привет, Grok! Отличная работа в Phase 1 - comprehensive test suite для auth системы! 🏆

Теперь нужно протестировать новую billing систему. Codex завершил все 5 задач Phase 2:
- ✅ Stripe Products Setup
- ✅ Database Schema (3 tables, 15 indexes)
- ✅ SubscriptionService (10 methods)
- ✅ Stripe Webhooks (5 events)
- ✅ API Endpoints (4 endpoints)

**Твоя миссия**: Убедиться, что всё работает корректно и безопасно!

---

## 📋 Задачи (Tasks T2.1 - T2.3)

### Task T2.1: SubscriptionService Unit Tests (4-5 часов)

**Цель**: Протестировать бизнес-логику SubscriptionService

**Test File**: `packages/billing/src/__tests__/subscription-service.test.ts`

#### Setup

```typescript
import { SubscriptionService } from '../subscription-service';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Mock Supabase
jest.mock('@supabase/supabase-js');

// Mock Stripe
jest.mock('stripe');

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let mockSupabase: any;
  let mockStripe: any;

  beforeEach(() => {
    // Setup mocks
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    mockStripe = {
      customers: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
      checkout: {
        sessions: {
          create: jest.fn(),
        },
      },
      subscriptions: {
        retrieve: jest.fn(),
        update: jest.fn(),
      },
    };

    // Mock Stripe constructor
    (Stripe as any).mockImplementation(() => mockStripe);

    // Mock env vars
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.SUPABASE_URL = 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'mock_key';

    service = new SubscriptionService(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Tests below...
});
```

#### Test Cases

**1. createFreeSubscription**

```typescript
describe('createFreeSubscription', () => {
  test('should create free subscription with 1 month period', async () => {
    const ecoId = 'eco_usr_test123';
    const mockSubscription = {
      id: 'uuid-1',
      eco_id: ecoId,
      plan: 'free',
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    mockSupabase.single.mockResolvedValue({ data: mockSubscription, error: null });

    const result = await service.createFreeSubscription(ecoId);

    expect(result).toEqual(mockSubscription);
    expect(mockSupabase.from).toHaveBeenCalledWith('eco_subscriptions');
    expect(mockSupabase.insert).toHaveBeenCalled();
  });

  test('should set status to active', async () => {
    const ecoId = 'eco_usr_test123';
    mockSupabase.single.mockResolvedValue({
      data: { status: 'active' },
      error: null,
    });

    const result = await service.createFreeSubscription(ecoId);

    expect(result.status).toBe('active');
  });

  test('should throw error on database failure', async () => {
    const ecoId = 'eco_usr_test123';
    mockSupabase.single.mockResolvedValue({
      data: null,
      error: { message: 'Database error' },
    });

    await expect(service.createFreeSubscription(ecoId)).rejects.toThrow();
  });
});
```

**2. getOrCreateStripeCustomer**

```typescript
describe('getOrCreateStripeCustomer', () => {
  test('should return existing customer ID if already exists', async () => {
    const ecoId = 'eco_usr_test123';
    const customerId = 'cus_mock123';

    mockSupabase.single.mockResolvedValue({
      data: { stripe_customer_id: customerId },
      error: null,
    });

    mockStripe.customers.retrieve.mockResolvedValue({ id: customerId });

    const result = await service.getOrCreateStripeCustomer(ecoId, 'test@example.com');

    expect(result).toBe(customerId);
    expect(mockStripe.customers.create).not.toHaveBeenCalled();
  });

  test('should create new customer if not exists', async () => {
    const ecoId = 'eco_usr_test123';
    const email = 'test@example.com';
    const newCustomerId = 'cus_new123';

    mockSupabase.single.mockResolvedValue({ data: null, error: null });
    mockStripe.customers.create.mockResolvedValue({ id: newCustomerId });

    const result = await service.getOrCreateStripeCustomer(ecoId, email);

    expect(result).toBe(newCustomerId);
    expect(mockStripe.customers.create).toHaveBeenCalledWith({
      email,
      metadata: { eco_id: ecoId },
    });
    expect(mockSupabase.update).toHaveBeenCalled();
  });

  test('should handle Stripe customer not found and create new one', async () => {
    const ecoId = 'eco_usr_test123';
    const oldCustomerId = 'cus_deleted123';
    const newCustomerId = 'cus_new123';

    mockSupabase.single.mockResolvedValue({
      data: { stripe_customer_id: oldCustomerId },
      error: null,
    });

    mockStripe.customers.retrieve.mockRejectedValue(
      new Error('Customer not found')
    );
    mockStripe.customers.create.mockResolvedValue({ id: newCustomerId });

    const result = await service.getOrCreateStripeCustomer(ecoId, 'test@example.com');

    expect(result).toBe(newCustomerId);
    expect(mockStripe.customers.create).toHaveBeenCalled();
  });
});
```

**3. createCheckoutSession**

```typescript
describe('createCheckoutSession', () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_PRO = 'price_pro_test';
    process.env.STRIPE_PRICE_ENTERPRISE = 'price_ent_test';
  });

  test('should create checkout session with correct price for pro plan', async () => {
    const ecoId = 'eco_usr_test123';
    const email = 'test@example.com';
    const customerId = 'cus_test123';
    const sessionId = 'cs_test123';
    const sessionUrl = 'https://checkout.stripe.com/test';

    // Mock existing subscription check
    mockSupabase.single.mockResolvedValueOnce({
      data: { stripe_customer_id: customerId },
      error: null,
    });

    mockStripe.customers.retrieve.mockResolvedValue({ id: customerId });

    // Mock get subscription (no existing pro subscription)
    mockSupabase.single.mockResolvedValueOnce({
      data: { plan: 'free' },
      error: null,
    });

    mockStripe.checkout.sessions.create.mockResolvedValue({
      id: sessionId,
      url: sessionUrl,
    });

    const result = await service.createCheckoutSession(
      ecoId,
      email,
      'pro',
      'https://app.com/success',
      'https://app.com/cancel'
    );

    expect(result).toEqual({ sessionId, url: sessionUrl });
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: customerId,
        line_items: [{ price: 'price_pro_test', quantity: 1 }],
        metadata: expect.objectContaining({ eco_id: ecoId, plan: 'pro' }),
      })
    );
  });

  test('should throw if plan invalid', async () => {
    await expect(
      service.createCheckoutSession(
        'eco_usr_test123',
        'test@example.com',
        'invalid' as any,
        'https://app.com/success',
        'https://app.com/cancel'
      )
    ).rejects.toThrow('Invalid plan');
  });

  test('should throw if price ID not configured', async () => {
    delete process.env.STRIPE_PRICE_PRO;

    await expect(
      service.createCheckoutSession(
        'eco_usr_test123',
        'test@example.com',
        'pro',
        'https://app.com/success',
        'https://app.com/cancel'
      )
    ).rejects.toThrow();
  });

  test('should throw if user already has active subscription to same plan', async () => {
    const ecoId = 'eco_usr_test123';
    const customerId = 'cus_test123';

    mockSupabase.single.mockResolvedValueOnce({
      data: { stripe_customer_id: customerId },
      error: null,
    });

    mockStripe.customers.retrieve.mockResolvedValue({ id: customerId });

    // User already has active pro subscription
    mockSupabase.single.mockResolvedValueOnce({
      data: { plan: 'pro', status: 'active' },
      error: null,
    });

    await expect(
      service.createCheckoutSession(
        ecoId,
        'test@example.com',
        'pro',
        'https://app.com/success',
        'https://app.com/cancel'
      )
    ).rejects.toThrow('already has an active pro subscription');
  });
});
```

**4. cancelSubscription**

```typescript
describe('cancelSubscription', () => {
  test('should set cancel_at_period_end to true', async () => {
    const ecoId = 'eco_usr_test123';
    const subscriptionId = 'sub_test123';

    mockSupabase.single
      .mockResolvedValueOnce({
        data: {
          plan: 'pro',
          stripe_subscription_id: subscriptionId,
          cancel_at_period_end: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { cancel_at_period_end: true },
        error: null,
      });

    mockStripe.subscriptions.update.mockResolvedValue({ cancel_at_period_end: true });

    const result = await service.cancelSubscription(ecoId);

    expect(result.cancel_at_period_end).toBe(true);
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
      subscriptionId,
      { cancel_at_period_end: true }
    );
  });

  test('should throw if trying to cancel free plan', async () => {
    const ecoId = 'eco_usr_test123';

    mockSupabase.single.mockResolvedValue({
      data: { plan: 'free' },
      error: null,
    });

    await expect(service.cancelSubscription(ecoId)).rejects.toThrow(
      'Cannot cancel free plan'
    );
  });

  test('should return current state if already canceled', async () => {
    const ecoId = 'eco_usr_test123';

    mockSupabase.single.mockResolvedValue({
      data: {
        plan: 'pro',
        cancel_at_period_end: true,
      },
      error: null,
    });

    const result = await service.cancelSubscription(ecoId);

    expect(result.cancel_at_period_end).toBe(true);
    expect(mockStripe.subscriptions.update).not.toHaveBeenCalled();
  });
});
```

**5. reactivateSubscription**

```typescript
describe('reactivateSubscription', () => {
  test('should reactivate canceled subscription', async () => {
    const ecoId = 'eco_usr_test123';
    const subscriptionId = 'sub_test123';
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

    mockSupabase.single
      .mockResolvedValueOnce({
        data: {
          plan: 'pro',
          stripe_subscription_id: subscriptionId,
          cancel_at_period_end: true,
          current_period_end: futureDate,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { cancel_at_period_end: false },
        error: null,
      });

    mockStripe.subscriptions.update.mockResolvedValue({ cancel_at_period_end: false });

    const result = await service.reactivateSubscription(ecoId);

    expect(result.cancel_at_period_end).toBe(false);
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
      subscriptionId,
      { cancel_at_period_end: false }
    );
  });

  test('should throw if period has ended', async () => {
    const ecoId = 'eco_usr_test123';
    const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

    mockSupabase.single.mockResolvedValue({
      data: {
        plan: 'pro',
        cancel_at_period_end: true,
        current_period_end: pastDate,
      },
      error: null,
    });

    await expect(service.reactivateSubscription(ecoId)).rejects.toThrow(
      'period has ended'
    );
  });

  test('should return current state if not canceled', async () => {
    const ecoId = 'eco_usr_test123';

    mockSupabase.single.mockResolvedValue({
      data: {
        plan: 'pro',
        cancel_at_period_end: false,
      },
      error: null,
    });

    const result = await service.reactivateSubscription(ecoId);

    expect(result.cancel_at_period_end).toBe(false);
    expect(mockStripe.subscriptions.update).not.toHaveBeenCalled();
  });
});
```

**6. hasAccess**

```typescript
describe('hasAccess', () => {
  test('should grant access if user plan >= required plan', async () => {
    const ecoId = 'eco_usr_test123';

    // User has pro plan
    mockSupabase.single.mockResolvedValue({
      data: { plan: 'pro', status: 'active' },
      error: null,
    });

    // Check if has access to free features
    const hasFreeAccess = await service.hasAccess(ecoId, 'free');
    expect(hasFreeAccess).toBe(true);

    // Check if has access to pro features
    const hasProAccess = await service.hasAccess(ecoId, 'pro');
    expect(hasProAccess).toBe(true);

    // Check if has access to enterprise features
    const hasEnterpriseAccess = await service.hasAccess(ecoId, 'enterprise');
    expect(hasEnterpriseAccess).toBe(false);
  });

  test('should deny access if user plan < required plan', async () => {
    const ecoId = 'eco_usr_test123';

    // User has free plan
    mockSupabase.single.mockResolvedValue({
      data: { plan: 'free', status: 'active' },
      error: null,
    });

    // Check if has access to pro features
    const hasProAccess = await service.hasAccess(ecoId, 'pro');
    expect(hasProAccess).toBe(false);
  });

  test('should deny access if subscription not active', async () => {
    const ecoId = 'eco_usr_test123';

    mockSupabase.single.mockResolvedValue({
      data: { plan: 'pro', status: 'past_due' },
      error: null,
    });

    const hasAccess = await service.hasAccess(ecoId, 'pro');
    expect(hasAccess).toBe(false);
  });

  test('should allow access for trialing status', async () => {
    const ecoId = 'eco_usr_test123';

    mockSupabase.single.mockResolvedValue({
      data: { plan: 'pro', status: 'trialing' },
      error: null,
    });

    const hasAccess = await service.hasAccess(ecoId, 'pro');
    expect(hasAccess).toBe(true);
  });
});
```

**7. syncFromStripe**

```typescript
describe('syncFromStripe', () => {
  test('should sync subscription status from Stripe', async () => {
    const ecoId = 'eco_usr_test123';
    const subscriptionId = 'sub_test123';

    mockSupabase.single
      .mockResolvedValueOnce({
        data: {
          stripe_subscription_id: subscriptionId,
          status: 'active',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { status: 'past_due' },
        error: null,
      });

    mockStripe.subscriptions.retrieve.mockResolvedValue({
      id: subscriptionId,
      status: 'past_due',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      cancel_at_period_end: false,
    });

    const result = await service.syncFromStripe(ecoId);

    expect(result.status).toBe('past_due');
    expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith(subscriptionId);
  });

  test('should throw if no Stripe subscription', async () => {
    const ecoId = 'eco_usr_test123';

    mockSupabase.single.mockResolvedValue({
      data: { stripe_subscription_id: null },
      error: null,
    });

    await expect(service.syncFromStripe(ecoId)).rejects.toThrow(
      'No Stripe subscription to sync'
    );
  });
});
```

**Success Criteria**:
- ✅ All 7 method groups tested
- ✅ Happy paths covered
- ✅ Error cases handled
- ✅ Edge cases tested
- ✅ Mocks properly configured
- ✅ Coverage >85%

---

### Task T2.2: Webhook Integration Tests (3-4 часа)

**Цель**: Протестировать Stripe webhook endpoint

**Test File**: `apps/web/__tests__/integration/stripe-webhooks.test.ts`

#### Setup

```typescript
import { POST } from '../../../app/api/webhooks/stripe/route';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Create a valid Stripe webhook event with signature
 */
function createWebhookEvent(
  type: string,
  data: any
): { body: string; signature: string } {
  const event = {
    id: `evt_test_${Date.now()}`,
    object: 'event',
    api_version: '2024-11-20.acacia',
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object: data },
  };

  const body = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: webhookSecret,
  });

  return { body, signature };
}

describe('Stripe Webhooks', () => {
  // Tests below...
});
```

#### Test Cases

**1. Signature Verification**

```typescript
describe('Signature Verification', () => {
  test('should verify valid webhook signature', async () => {
    const { body, signature } = createWebhookEvent('customer.created', {
      id: 'cus_test123',
    });

    const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
      },
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
  });

  test('should reject invalid signature', async () => {
    const { body } = createWebhookEvent('customer.created', {
      id: 'cus_test123',
    });

    const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': 'invalid_signature',
      },
    });

    const response = await POST(req);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('Invalid signature');
  });

  test('should reject missing signature', async () => {
    const { body } = createWebhookEvent('customer.created', {
      id: 'cus_test123',
    });

    const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body,
    });

    const response = await POST(req);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('Missing signature');
  });
});
```

**2. Event Handlers**

```typescript
describe('checkout.session.completed', () => {
  test('should activate subscription after checkout', async () => {
    const ecoId = 'eco_usr_test123';
    const checkoutSession = {
      id: 'cs_test123',
      object: 'checkout.session',
      subscription: 'sub_test123',
      metadata: {
        eco_id: ecoId,
        plan: 'pro',
      },
    };

    const { body, signature } = createWebhookEvent(
      'checkout.session.completed',
      checkoutSession
    );

    const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
      },
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.received).toBe(true);
    expect(data.processed).toBe(true);

    // Verify subscription was updated in database
    // (This requires database access in integration tests)
  });

  test('should handle missing eco_id in metadata', async () => {
    const checkoutSession = {
      id: 'cs_test123',
      subscription: 'sub_test123',
      metadata: {
        plan: 'pro',
        // eco_id missing
      },
    };

    const { body, signature } = createWebhookEvent(
      'checkout.session.completed',
      checkoutSession
    );

    const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
      },
    });

    const response = await POST(req);
    expect(response.status).toBe(500);
  });
});

describe('customer.subscription.updated', () => {
  test('should update subscription status', async () => {
    const ecoId = 'eco_usr_test123';
    const subscription = {
      id: 'sub_test123',
      object: 'subscription',
      status: 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      cancel_at_period_end: false,
      metadata: {
        eco_id: ecoId,
        plan: 'pro',
      },
    };

    const { body, signature } = createWebhookEvent(
      'customer.subscription.updated',
      subscription
    );

    const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
      },
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
  });
});

describe('customer.subscription.deleted', () => {
  test('should downgrade to free plan', async () => {
    const ecoId = 'eco_usr_test123';
    const subscription = {
      id: 'sub_test123',
      object: 'subscription',
      ended_at: Math.floor(Date.now() / 1000),
      metadata: {
        eco_id: ecoId,
      },
    };

    const { body, signature } = createWebhookEvent(
      'customer.subscription.deleted',
      subscription
    );

    const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
      },
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    // Verify user was downgraded to free in database
  });
});

describe('invoice.payment_failed', () => {
  test('should mark subscription as past_due', async () => {
    const customerId = 'cus_test123';
    const invoice = {
      id: 'in_test123',
      object: 'invoice',
      customer: customerId,
      attempt_count: 1,
    };

    const { body, signature } = createWebhookEvent(
      'invoice.payment_failed',
      invoice
    );

    const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
      },
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
  });
});

describe('invoice.payment_succeeded', () => {
  test('should reactivate subscription if past_due', async () => {
    const customerId = 'cus_test123';
    const invoice = {
      id: 'in_test123',
      object: 'invoice',
      customer: customerId,
      status: 'paid',
    };

    const { body, signature } = createWebhookEvent(
      'invoice.payment_succeeded',
      invoice
    );

    const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
      },
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
  });
});
```

**3. Idempotency**

```typescript
describe('Idempotency', () => {
  test('should handle duplicate events', async () => {
    const { body, signature } = createWebhookEvent('customer.created', {
      id: 'cus_test123',
    });

    const req1 = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
      },
    });

    // First request
    const response1 = await POST(req1);
    expect(response1.status).toBe(200);

    // Second request with same event (duplicate)
    const req2 = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
      },
    });

    const response2 = await POST(req2);
    expect(response2.status).toBe(200);

    const data2 = await response2.json();
    expect(data2.duplicate).toBe(true);
  });

  test('should log all events in eco_stripe_events', async () => {
    const { body, signature } = createWebhookEvent('customer.created', {
      id: 'cus_test123',
    });

    const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
      },
    });

    await POST(req);

    // Verify event was logged in database
    // SELECT * FROM eco_stripe_events WHERE id = 'evt_...'
  });
});
```

**Success Criteria**:
- ✅ Signature verification tested
- ✅ All 5 event handlers tested
- ✅ Idempotency verified
- ✅ Error cases covered
- ✅ Database integration verified

---

### Task T2.3: API Endpoint Tests (2-3 часа)

**Цель**: Протестировать subscription API endpoints

**Test File**: `apps/web/__tests__/api/subscriptions.test.ts`

#### Test Cases

**1. GET /api/subscriptions/current**

```typescript
import { GET } from '../../app/api/subscriptions/current/route';
import { NextRequest } from 'next/server';

describe('GET /api/subscriptions/current', () => {
  test('should return subscription for authenticated user', async () => {
    const token = 'valid_jwt_token'; // Mock JWT

    const req = new NextRequest('http://localhost:3000/api/subscriptions/current', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const response = await GET(req);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.subscription).toBeDefined();
    expect(data.plan).toBeDefined();
    expect(data.plan.name).toBeDefined();
    expect(data.plan.price).toBeGreaterThanOrEqual(0);
  });

  test('should return 401 for unauthenticated request', async () => {
    const req = new NextRequest('http://localhost:3000/api/subscriptions/current');

    const response = await GET(req);
    expect(response.status).toBe(401);
  });

  test('should return 404 if no subscription', async () => {
    // Mock user with no subscription
    const token = 'valid_jwt_token_no_subscription';

    const req = new NextRequest('http://localhost:3000/api/subscriptions/current', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const response = await GET(req);
    expect(response.status).toBe(404);
  });
});
```

**2. POST /api/subscriptions/checkout**

```typescript
import { POST as CheckoutPOST } from '../../app/api/subscriptions/checkout/route';

describe('POST /api/subscriptions/checkout', () => {
  test('should create checkout session for pro plan', async () => {
    const token = 'valid_jwt_token';

    const req = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ plan: 'pro' }),
    });

    const response = await CheckoutPOST(req);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.sessionId).toBeDefined();
    expect(data.url).toMatch(/^https:\/\/checkout\.stripe\.com/);
  });

  test('should return 400 for invalid plan', async () => {
    const token = 'valid_jwt_token';

    const req = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ plan: 'invalid' }),
    });

    const response = await CheckoutPOST(req);
    expect(response.status).toBe(400);
  });

  test('should return 409 if already subscribed to plan', async () => {
    const token = 'valid_jwt_token_with_pro_subscription';

    const req = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ plan: 'pro' }),
    });

    const response = await CheckoutPOST(req);
    expect(response.status).toBe(409);
  });
});
```

**3. POST /api/subscriptions/cancel**

```typescript
import { POST as CancelPOST } from '../../app/api/subscriptions/cancel/route';

describe('POST /api/subscriptions/cancel', () => {
  test('should cancel active subscription', async () => {
    const token = 'valid_jwt_token_with_pro_subscription';

    const req = new NextRequest('http://localhost:3000/api/subscriptions/cancel', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const response = await CancelPOST(req);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.message).toContain('canceled at the end of the billing period');
    expect(data.subscription.cancel_at_period_end).toBe(true);
  });

  test('should return 400 for free plan', async () => {
    const token = 'valid_jwt_token_with_free_subscription';

    const req = new NextRequest('http://localhost:3000/api/subscriptions/cancel', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const response = await CancelPOST(req);
    expect(response.status).toBe(400);
  });

  test('should be idempotent if already canceled', async () => {
    const token = 'valid_jwt_token_with_canceled_subscription';

    const req = new NextRequest('http://localhost:3000/api/subscriptions/cancel', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const response = await CancelPOST(req);
    expect(response.status).toBe(200);
  });
});
```

**4. POST /api/subscriptions/reactivate**

```typescript
import { POST as ReactivatePOST } from '../../app/api/subscriptions/reactivate/route';

describe('POST /api/subscriptions/reactivate', () => {
  test('should reactivate canceled subscription', async () => {
    const token = 'valid_jwt_token_with_canceled_subscription';

    const req = new NextRequest('http://localhost:3000/api/subscriptions/reactivate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const response = await ReactivatePOST(req);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.message).toContain('reactivated');
    expect(data.subscription.cancel_at_period_end).toBe(false);
  });

  test('should return 400 if period ended', async () => {
    const token = 'valid_jwt_token_with_expired_subscription';

    const req = new NextRequest('http://localhost:3000/api/subscriptions/reactivate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const response = await ReactivatePOST(req);
    expect(response.status).toBe(400);
  });

  test('should be idempotent if not canceled', async () => {
    const token = 'valid_jwt_token_with_active_subscription';

    const req = new NextRequest('http://localhost:3000/api/subscriptions/reactivate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const response = await ReactivatePOST(req);
    expect(response.status).toBe(200);
  });
});
```

**Success Criteria**:
- ✅ All 4 endpoints tested
- ✅ Authentication verified
- ✅ Error codes correct
- ✅ Idempotency tested
- ✅ Integration with SubscriptionService

---

## 🧪 Testing Environment Setup

### Prerequisites

```bash
# Install dependencies
npm install --save-dev jest @types/jest ts-jest supertest @types/supertest

# Stripe CLI for webhook testing
brew install stripe/stripe-cli/stripe  # macOS
# or download from https://github.com/stripe/stripe-cli/releases
```

### Environment Variables

```bash
# .env.test
SUPABASE_URL=https://test.supabase.co
SUPABASE_SERVICE_KEY=test_key
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_test_xxx
STRIPE_PRICE_PRO=price_test_pro
STRIPE_PRICE_ENTERPRISE=price_test_ent
JWT_SECRET=test_secret
JWT_REFRESH_SECRET=test_refresh_secret
```

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages', '<rootDir>/apps'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.test.ts',
    '!**/node_modules/**',
    '!**/.next/**',
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
};
```

---

## 📊 Success Criteria

### Coverage Targets

| Component | Target | Priority |
|-----------|--------|----------|
| SubscriptionService | >90% | High |
| Webhook Handler | >85% | High |
| API Endpoints | >85% | High |
| Overall | >85% | High |

### Test Metrics

- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Code coverage >85%
- ✅ Zero critical bugs
- ✅ All error cases covered
- ✅ Idempotency verified
- ✅ Security tests pass

---

## 🚀 Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Suite

```bash
# SubscriptionService tests
npm test packages/billing/src/__tests__/subscription-service.test.ts

# Webhook tests
npm test apps/web/__tests__/integration/stripe-webhooks.test.ts

# API endpoint tests
npm test apps/web/__tests__/api/subscriptions.test.ts
```

### Coverage Report

```bash
npm test -- --coverage
```

### Watch Mode

```bash
npm test -- --watch
```

---

## 📝 Test Report Template

После завершения создай отчёт: `TEST_REPORT_PHASE_2.md`

```markdown
# Phase 2 Testing Report

**Tester**: Grok
**Date**: 2025-10-10
**Duration**: X hours

## Summary

- Total Tests: X
- Passed: X
- Failed: X
- Code Coverage: X%

## Results by Component

### SubscriptionService
- Tests: X
- Coverage: X%
- Status: ✅/❌

### Webhooks
- Tests: X
- Coverage: X%
- Status: ✅/❌

### API Endpoints
- Tests: X
- Coverage: X%
- Status: ✅/❌

## Issues Found

1. [Bug description]
   - Severity: High/Medium/Low
   - Location: file:line
   - Status: Open/Fixed

## Recommendations

1. [Improvement suggestion]

## Conclusion

Overall Phase 2 quality: Excellent/Good/Needs Work
```

---

## 💡 Tips & Best Practices

1. **Mock External Services**: Mock Stripe API and Supabase для unit tests
2. **Test Idempotency**: Критично для webhooks
3. **Test Error Cases**: Не только happy path
4. **Use Real Stripe Test Mode**: Для integration tests
5. **Check Database State**: После каждого webhook event
6. **Test Signature Verification**: Security critical
7. **Performance**: Webhooks должны быть <5s

---

## 📞 Questions?

If you have questions or encounter issues:
1. Check `docs/STRIPE_WEBHOOKS.md` для webhook testing
2. Review `PHASE_2_COMPLETE.md` для context
3. Use Stripe CLI для local webhook testing
4. Escalate to Codex/Claude если needed

---

**Let's ensure Phase 2 is bulletproof!** 🔒🧪

Good luck, Grok! You've got this! 🏆

---

*"Test everything, break nothing."* - QA Mantra
