import { SubscriptionService } from '../subscription-service';
import {
  testEcoIds,
  mockSubscriptions,
  mockStripeCustomers,
  mockStripeSubscriptions,
  mockCheckoutSession,
} from './fixtures';

// Mock Supabase and Stripe
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
};

const mockStripeClient = {
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
    cancel: jest.fn(),
  },
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripeClient);
});

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SubscriptionService('test-url', 'test-key');
  });

  test('should construct with valid credentials', () => {
    expect(service).toBeDefined();
  });

  test('should throw error with invalid credentials', () => {
    expect(() => new SubscriptionService('', '')).toThrow('Supabase URL and key are required');
  });

  describe('createFreeSubscription', () => {
    test('should create free subscription with 1 month period', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.free,
        error: null
      });

      const result = await service.createFreeSubscription(testEcoIds.user1);

      expect(result).toEqual(mockSubscriptions.free);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('eco_subscriptions');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        eco_id: testEcoIds.user1,
        plan: 'free',
        status: 'active',
        current_period_start: expect.any(String),
        current_period_end: expect.any(String),
        cancel_at_period_end: false,
      });
    });

    test('should set status to active', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.free,
        error: null
      });

      await service.createFreeSubscription(testEcoIds.user1);

      const insertCall = mockSupabaseClient.insert.mock.calls[0][0];
      expect(insertCall.status).toBe('active');
    });

    test('should set 1 month period end', async () => {
      const beforeCall = new Date();
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.free,
        error: null
      });

      await service.createFreeSubscription(testEcoIds.user1);

      const afterCall = new Date();
      const insertCall = mockSupabaseClient.insert.mock.calls[0][0];

      const startDate = new Date(insertCall.current_period_start);
      const endDate = new Date(insertCall.current_period_end);

      expect(startDate.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(startDate.getTime()).toBeLessThanOrEqual(afterCall.getTime());

      // Should be approximately 1 month later
      const monthDiff = endDate.getTime() - startDate.getTime();
      const oneMonthMs = 30 * 24 * 60 * 60 * 1000; // Approximate
      expect(monthDiff).toBeGreaterThan(28 * 24 * 60 * 60 * 1000); // At least 28 days
      expect(monthDiff).toBeLessThan(32 * 24 * 60 * 60 * 1000); // At most 32 days
    });

    test('should throw error on database failure', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' }
      });

      await expect(service.createFreeSubscription(testEcoIds.user1))
        .rejects.toThrow('Failed to create free subscription: Database error');
    });
  });

  describe('getOrCreateStripeCustomer', () => {
    test('should return existing customer ID if already exists', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { stripe_customer_id: 'cus_existing_123' },
        error: null
      });

      mockStripeClient.customers.retrieve.mockResolvedValueOnce({
        id: 'cus_existing_123'
      });

      const result = await service.getOrCreateStripeCustomer(testEcoIds.user1, 'user@example.com');

      expect(result).toBe('cus_existing_123');
      expect(mockStripeClient.customers.create).not.toHaveBeenCalled();
    });

    test('should create new customer if not exists', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null
      });

      mockStripeClient.customers.create.mockResolvedValueOnce(mockStripeCustomers.customer1);

      const result = await service.getOrCreateStripeCustomer(testEcoIds.user1, 'user@example.com');

      expect(result).toBe('cus_mock_123');
      expect(mockStripeClient.customers.create).toHaveBeenCalledWith({
        email: 'user@example.com',
        metadata: { eco_id: testEcoIds.user1 }
      });
    });

    test('should recreate customer if Stripe customer not found', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { stripe_customer_id: 'cus_deleted_123' },
        error: null
      });

      mockStripeClient.customers.retrieve.mockRejectedValueOnce(new Error('Customer not found'));
      mockStripeClient.customers.create.mockResolvedValueOnce(mockStripeCustomers.customer1);

      const result = await service.getOrCreateStripeCustomer(testEcoIds.user1, 'user@example.com');

      expect(result).toBe('cus_mock_123');
      expect(mockStripeClient.customers.create).toHaveBeenCalledWith({
        email: 'user@example.com',
        metadata: { eco_id: testEcoIds.user1 }
      });
    });
  });

  describe('createCheckoutSession', () => {
    test('should create checkout session with correct price', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { stripe_customer_id: 'cus_mock_123' },
        error: null
      });

      mockStripeClient.checkout.sessions.create.mockResolvedValueOnce(mockCheckoutSession);

      const result = await service.createCheckoutSession(testEcoIds.user1, 'pro');

      expect(result).toBe('https://checkout.stripe.com/pay/cs_test_123');
      expect(mockStripeClient.checkout.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_mock_123',
        payment_method_types: ['card'],
        line_items: [{
          price: 'price_pro_mock',
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: expect.stringContaining('/success'),
        cancel_url: expect.stringContaining('/cancel'),
        metadata: { eco_id: testEcoIds.user1 },
      });
    });

    test('should include eco_id in metadata', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { stripe_customer_id: 'cus_mock_123' },
        error: null
      });

      mockStripeClient.checkout.sessions.create.mockResolvedValueOnce(mockCheckoutSession);

      await service.createCheckoutSession(testEcoIds.user1, 'pro');

      const createCall = mockStripeClient.checkout.sessions.create.mock.calls[0][0];
      expect(createCall.metadata.eco_id).toBe(testEcoIds.user1);
    });

    test('should throw if plan invalid', async () => {
      await expect(service.createCheckoutSession(testEcoIds.user1, 'invalid' as any))
        .rejects.toThrow('Invalid plan');
    });

    test('should throw if price ID not configured', async () => {
      // Free plan has no price ID
      await expect(service.createCheckoutSession(testEcoIds.user1, 'free'))
        .rejects.toThrow('Stripe price id is not configured for plan \'free\'');
    });

    test('should throw if user already has active subscription to same plan', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { stripe_customer_id: 'cus_mock_123' },
        error: null
      });

      // Mock existing active subscription
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.pro,
        error: null
      });

      await expect(service.createCheckoutSession(testEcoIds.user2, 'pro'))
        .rejects.toThrow('User already has an active subscription to this plan');
    });
  });

  describe('getSubscription', () => {
    test('should return subscription if exists', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.free,
        error: null
      });

      const result = await service.getSubscription(testEcoIds.user1);

      expect(result).toEqual(mockSubscriptions.free);
    });

    test('should return null if no subscription', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' }
      });

      const result = await service.getSubscription(testEcoIds.user1);

      expect(result).toBeNull();
    });
  });

  describe('cancelSubscription', () => {
    test('should set cancel_at_period_end to true', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.pro,
        error: null
      });

      mockStripeClient.subscriptions.cancel.mockResolvedValueOnce({
        ...mockStripeSubscriptions.active,
        cancel_at_period_end: true
      });

      const result = await service.cancelSubscription(testEcoIds.user2);

      expect(result.cancel_at_period_end).toBe(true);
      expect(mockStripeClient.subscriptions.cancel).toHaveBeenCalledWith('sub_mock_456');
    });

    test('should throw if trying to cancel free plan', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.free,
        error: null
      });

      await expect(service.cancelSubscription(testEcoIds.user1))
        .rejects.toThrow('Cannot cancel free plan subscription');
    });

    test('should return current state if already canceled', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.canceled,
        error: null
      });

      const result = await service.cancelSubscription(testEcoIds.user3);

      expect(result).toEqual(mockSubscriptions.canceled);
      expect(mockStripeClient.subscriptions.cancel).not.toHaveBeenCalled();
    });
  });

  describe('reactivateSubscription', () => {
    test('should reactivate canceled subscription', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.canceled,
        error: null
      });

      mockStripeClient.subscriptions.update.mockResolvedValueOnce({
        ...mockStripeSubscriptions.canceled,
        cancel_at_period_end: false
      });

      const result = await service.reactivateSubscription(testEcoIds.user3);

      expect(result.cancel_at_period_end).toBe(false);
      expect(mockStripeClient.subscriptions.update).toHaveBeenCalledWith('sub_mock_789', {
        cancel_at_period_end: false
      });
    });

    test('should throw if subscription not found', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' }
      });

      await expect(service.reactivateSubscription(testEcoIds.user1))
        .rejects.toThrow('Subscription not found');
    });

    test('should return current state if not canceled', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.pro,
        error: null
      });

      const result = await service.reactivateSubscription(testEcoIds.user2);

      expect(result).toEqual(mockSubscriptions.pro);
      expect(mockStripeClient.subscriptions.update).not.toHaveBeenCalled();
    });
  });

  describe('hasAccess', () => {
    test('should grant access if user plan >= required plan', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.pro,
        error: null
      });

      const result = await service.hasAccess(testEcoIds.user2, 'free');
      expect(result).toBe(true);
    });

    test('should deny access if user plan < required plan', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.free,
        error: null
      });

      const result = await service.hasAccess(testEcoIds.user1, 'pro');
      expect(result).toBe(false);
    });

    test('should deny access if subscription not active', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.canceled,
        error: null
      });

      const result = await service.hasAccess(testEcoIds.user3, 'free');
      expect(result).toBe(false);
    });

    test('should deny access if no subscription', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' }
      });

      const result = await service.hasAccess(testEcoIds.user1, 'free');
      expect(result).toBe(false);
    });
  });

  describe('getSubscriptionWithPlan', () => {
    test('should return subscription with plan details', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.pro,
        error: null
      });

      const result = await service.getSubscriptionWithPlan(testEcoIds.user2);

      expect(result.subscription).toEqual(mockSubscriptions.pro);
      expect(result.plan).toBeDefined();
      expect(result.plan.code).toBe('pro');
    });

    test('should throw if subscription not found', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' }
      });

      await expect(service.getSubscriptionWithPlan(testEcoIds.user1))
        .rejects.toThrow('Subscription not found');
    });
  });

  describe('updateSubscription', () => {
    test('should update subscription status', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.pro,
        error: null
      });

      const updates = { status: 'past_due' as const };
      const result = await service.updateSubscription(testEcoIds.user2, updates);

      expect(result.status).toBe('past_due');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('eco_subscriptions');
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(updates);
    });
  });

  describe('syncFromStripe', () => {
    test('should sync subscription data from Stripe', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockSubscriptions.pro,
        error: null
      });

      mockStripeClient.subscriptions.retrieve.mockResolvedValueOnce(mockStripeSubscriptions.active);

      const result = await service.syncFromStripe(testEcoIds.user2);

      expect(result.stripe_subscription_id).toBe('sub_mock_456');
      expect(mockStripeClient.subscriptions.retrieve).toHaveBeenCalledWith('sub_mock_456');
    });

    test('should throw if subscription not found', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' }
      });

      await expect(service.syncFromStripe(testEcoIds.user1))
        .rejects.toThrow('Subscription not found');
    });
  });
});

