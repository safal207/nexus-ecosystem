import { Subscription, UsageRecord, StripeEvent } from '../types';

export const testEcoIds = {
  user1: 'eco_usr_a1b2c3d4e5f6g7h8i9j0k1',
  user2: 'eco_usr_b2c3d4e5f6g7h8i9j0k1l2',
  user3: 'eco_usr_c3d4e5f6g7h8i9j0k1l2m3',
};

export const mockSubscriptions = {
  free: {
    id: 'sub_free_123',
    eco_id: testEcoIds.user1,
    plan: 'free' as const,
    status: 'active' as const,
    current_period_start: '2024-01-01T00:00:00Z',
    current_period_end: '2024-02-01T00:00:00Z',
    cancel_at_period_end: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  pro: {
    id: 'sub_pro_456',
    eco_id: testEcoIds.user2,
    plan: 'pro' as const,
    status: 'active' as const,
    stripe_customer_id: 'cus_mock_123',
    stripe_subscription_id: 'sub_mock_456',
    current_period_start: '2024-01-01T00:00:00Z',
    current_period_end: '2024-02-01T00:00:00Z',
    cancel_at_period_end: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  canceled: {
    id: 'sub_canceled_789',
    eco_id: testEcoIds.user3,
    plan: 'pro' as const,
    status: 'canceled' as const,
    stripe_customer_id: 'cus_mock_789',
    stripe_subscription_id: 'sub_mock_789',
    current_period_start: '2024-01-01T00:00:00Z',
    current_period_end: '2024-02-01T00:00:00Z',
    cancel_at_period_end: true,
    canceled_at: '2024-01-15T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
};

export const mockStripeCustomers = {
  customer1: {
    id: 'cus_mock_123',
    email: 'user1@example.com',
    metadata: { eco_id: testEcoIds.user1 },
  },
  customer2: {
    id: 'cus_mock_456',
    email: 'user2@example.com',
    metadata: { eco_id: testEcoIds.user2 },
  },
};

export const mockStripeSubscriptions = {
  active: {
    id: 'sub_mock_456',
    customer: 'cus_mock_123',
    status: 'active',
    current_period_start: 1704067200, // 2024-01-01
    current_period_end: 1706745600, // 2024-02-01
    cancel_at_period_end: false,
    items: {
      data: [{
        price: { id: 'price_pro_mock' }
      }]
    }
  },
  canceled: {
    id: 'sub_mock_789',
    customer: 'cus_mock_789',
    status: 'canceled',
    current_period_start: 1704067200,
    current_period_end: 1706745600,
    cancel_at_period_end: true,
    canceled_at: 1705276800, // 2024-01-15
    items: {
      data: [{
        price: { id: 'price_pro_mock' }
      }]
    }
  },
};

export const mockCheckoutSession = {
  id: 'cs_test_123',
  url: 'https://checkout.stripe.com/pay/cs_test_123',
  customer: 'cus_mock_123',
  payment_status: 'unpaid',
  metadata: { eco_id: testEcoIds.user1 },
};

export const mockUsageRecords = {
  withinLimit: {
    id: 'usage_123',
    eco_id: testEcoIds.user1,
    subscription_id: 'sub_free_123',
    api_calls: 500,
    billing_period_start: '2024-01-01T00:00:00Z',
    billing_period_end: '2024-02-01T00:00:00Z',
    overage_calls: 0,
    overage_cost: 0,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
  overLimit: {
    id: 'usage_456',
    eco_id: testEcoIds.user2,
    subscription_id: 'sub_pro_456',
    api_calls: 150000,
    billing_period_start: '2024-01-01T00:00:00Z',
    billing_period_end: '2024-02-01T00:00:00Z',
    overage_calls: 50000,
    overage_cost: 1450, // $14.50 in cents
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
};

export const mockStripeEvents = {
  checkoutCompleted: {
    id: 'evt_checkout_completed',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        customer: 'cus_mock_123',
        payment_status: 'paid',
        metadata: { eco_id: testEcoIds.user1 },
      }
    },
    processed: false,
    created_at: '2024-01-01T00:00:00Z',
  },
  subscriptionUpdated: {
    id: 'evt_subscription_updated',
    type: 'customer.subscription.updated',
    data: {
      object: mockStripeSubscriptions.active
    },
    processed: false,
    created_at: '2024-01-01T00:00:00Z',
  },
  invoicePaymentFailed: {
    id: 'evt_payment_failed',
    type: 'invoice.payment_failed',
    data: {
      object: {
        customer: 'cus_mock_123',
        subscription: 'sub_mock_456',
        amount_due: 2900, // $29.00
      }
    },
    processed: false,
    created_at: '2024-01-01T00:00:00Z',
  },
};

export const mockWebhookPayloads = {
  checkoutSessionCompleted: {
    id: 'cs_test_123',
    object: 'checkout.session',
    payment_status: 'paid',
    customer: 'cus_mock_123',
    metadata: { eco_id: testEcoIds.user1 },
  },
  customerSubscriptionUpdated: {
    id: 'sub_mock_456',
    object: 'subscription',
    customer: 'cus_mock_123',
    status: 'active',
    current_period_start: 1704067200,
    current_period_end: 1706745600,
    cancel_at_period_end: false,
  },
  invoicePaymentFailed: {
    id: 'in_test_123',
    object: 'invoice',
    customer: 'cus_mock_123',
    subscription: 'sub_mock_456',
    amount_due: 2900,
    status: 'open',
  },
};
