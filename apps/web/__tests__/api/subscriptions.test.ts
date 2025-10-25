import { GET as CurrentGET } from '../../app/api/subscriptions/current/route';
import { POST as CheckoutPOST } from '../../app/api/subscriptions/checkout/route';
import { POST as CancelPOST } from '../../app/api/subscriptions/cancel/route';
import { POST as ReactivatePOST } from '../../app/api/subscriptions/reactivate/route';
import { NextRequest } from 'next/server';

// Mock environment variables
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test_service_key';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
process.env.STRIPE_PRICE_PRO = 'price_pro_test';
process.env.STRIPE_PRICE_ENTERPRISE = 'price_ent_test';
process.env.JWT_SECRET = 'test_jwt_secret';

// Test fixtures
const testEcoId = 'eco_usr_test123abc456def789';
const testEmail = 'test@example.com';

// Mock JWT verification
jest.mock('../../../../packages/auth/src/middleware', () => ({
  verifyJWT: jest.fn((req) => {
    const auth = req.headers.get('authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return { success: false, user: null };
    }
    const token = auth.replace('Bearer ', '');
    if (token === 'valid_token') {
      return {
        success: true,
        user: {
          ecoId: testEcoId,
          email: testEmail,
        },
      };
    }
    return { success: false, user: null };
  }),
}));

// Mock SubscriptionService
const mockSubscriptionService = {
  getSubscriptionWithPlan: jest.fn(),
  createCheckoutSession: jest.fn(),
  cancelSubscription: jest.fn(),
  reactivateSubscription: jest.fn(),
};

jest.mock('../../../../packages/billing/src/subscription-service', () => ({
  SubscriptionService: jest.fn().mockImplementation(() => mockSubscriptionService),
}));

describe('Subscription API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/subscriptions/current', () => {
    test('should return subscription for authenticated user', async () => {
      const mockSubscription = {
        id: 'sub_1',
        eco_id: testEcoId,
        plan: 'pro',
        status: 'active',
        current_period_start: '2025-01-01T00:00:00Z',
        current_period_end: '2025-02-01T00:00:00Z',
        cancel_at_period_end: false,
        canceled_at: null,
        trial_start: null,
        trial_end: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const mockPlanDetails = {
        name: 'Pro',
        price: 2900,
        apiCallsIncluded: 100000,
        features: ['100,000 API calls/month', 'Priority support'],
      };

      mockSubscriptionService.getSubscriptionWithPlan.mockResolvedValue({
        subscription: mockSubscription,
        planDetails: mockPlanDetails,
      });

      const req = new NextRequest('http://localhost:3000/api/subscriptions/current', {
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const response = await CurrentGET(req);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.subscription).toBeDefined();
      expect(data.subscription.plan).toBe('pro');
      expect(data.plan).toBeDefined();
      expect(data.plan.name).toBe('Pro');
      expect(data.plan.price).toBe(2900);
    });

    test('should return 401 for unauthenticated request', async () => {
      const req = new NextRequest('http://localhost:3000/api/subscriptions/current');

      const response = await CurrentGET(req);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toContain('Unauthorized');
    });

    test('should return 404 if no subscription found', async () => {
      mockSubscriptionService.getSubscriptionWithPlan.mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/subscriptions/current', {
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const response = await CurrentGET(req);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toContain('No subscription found');
    });

    test('should return 500 on service error', async () => {
      mockSubscriptionService.getSubscriptionWithPlan.mockRejectedValue(
        new Error('Database error')
      );

      const req = new NextRequest('http://localhost:3000/api/subscriptions/current', {
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const response = await CurrentGET(req);
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.error).toContain('Failed to get subscription');
    });
  });

  describe('POST /api/subscriptions/checkout', () => {
    test('should create checkout session for pro plan', async () => {
      mockSubscriptionService.createCheckoutSession.mockResolvedValue({
        sessionId: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123',
      });

      const req = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: 'pro' }),
      });

      const response = await CheckoutPOST(req);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.sessionId).toBeDefined();
      expect(data.url).toMatch(/^https:\/\/checkout\.stripe\.com/);

      expect(mockSubscriptionService.createCheckoutSession).toHaveBeenCalledWith(
        testEcoId,
        testEmail,
        'pro',
        expect.stringContaining('/success'),
        expect.stringContaining('/cancel')
      );
    });

    test('should create checkout session for enterprise plan', async () => {
      mockSubscriptionService.createCheckoutSession.mockResolvedValue({
        sessionId: 'cs_test_456',
        url: 'https://checkout.stripe.com/pay/cs_test_456',
      });

      const req = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: 'enterprise' }),
      });

      const response = await CheckoutPOST(req);
      expect(response.status).toBe(200);
    });

    test('should return 400 for invalid plan', async () => {
      const req = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: 'invalid_plan' }),
      });

      const response = await CheckoutPOST(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('Invalid plan');
    });

    test('should return 401 for unauthenticated request', async () => {
      const req = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: 'pro' }),
      });

      const response = await CheckoutPOST(req);
      expect(response.status).toBe(401);
    });

    test('should return 409 if already subscribed to plan', async () => {
      mockSubscriptionService.createCheckoutSession.mockRejectedValue(
        new Error('User already has an active pro subscription')
      );

      const req = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: 'pro' }),
      });

      const response = await CheckoutPOST(req);
      expect(response.status).toBe(409);

      const data = await response.json();
      expect(data.error).toContain('already has an active');
    });

    test('should return 503 if billing not configured', async () => {
      mockSubscriptionService.createCheckoutSession.mockRejectedValue(
        new Error('STRIPE_SECRET_KEY not configured')
      );

      const req = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: 'pro' }),
      });

      const response = await CheckoutPOST(req);
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.error).toContain('Billing system not configured');
    });
  });

  describe('POST /api/subscriptions/cancel', () => {
    test('should cancel active subscription', async () => {
      const mockCanceledSub = {
        id: 'sub_1',
        plan: 'pro',
        status: 'active',
        cancel_at_period_end: true,
        canceled_at: '2025-01-15T12:00:00Z',
        current_period_end: '2025-02-01T00:00:00Z',
      };

      mockSubscriptionService.cancelSubscription.mockResolvedValue(mockCanceledSub);

      const req = new NextRequest('http://localhost:3000/api/subscriptions/cancel', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const response = await CancelPOST(req);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.message).toContain('canceled at the end of the billing period');
      expect(data.subscription.cancel_at_period_end).toBe(true);
    });

    test('should return 401 for unauthenticated request', async () => {
      const req = new NextRequest('http://localhost:3000/api/subscriptions/cancel', {
        method: 'POST',
      });

      const response = await CancelPOST(req);
      expect(response.status).toBe(401);
    });

    test('should return 404 if no active subscription', async () => {
      mockSubscriptionService.cancelSubscription.mockRejectedValue(
        new Error('No subscription found for user')
      );

      const req = new NextRequest('http://localhost:3000/api/subscriptions/cancel', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const response = await CancelPOST(req);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toContain('No active subscription to cancel');
    });

    test('should return 400 for free plan', async () => {
      mockSubscriptionService.cancelSubscription.mockRejectedValue(
        new Error('Cannot cancel free plan')
      );

      const req = new NextRequest('http://localhost:3000/api/subscriptions/cancel', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const response = await CancelPOST(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('Free plan cannot be canceled');
    });

    test('should be idempotent if already canceled', async () => {
      const mockAlreadyCanceled = {
        id: 'sub_1',
        plan: 'pro',
        status: 'active',
        cancel_at_period_end: true,
        canceled_at: '2025-01-15T12:00:00Z',
        current_period_end: '2025-02-01T00:00:00Z',
      };

      mockSubscriptionService.cancelSubscription.mockResolvedValue(mockAlreadyCanceled);

      const req = new NextRequest('http://localhost:3000/api/subscriptions/cancel', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const response = await CancelPOST(req);
      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/subscriptions/reactivate', () => {
    test('should reactivate canceled subscription', async () => {
      const mockReactivatedSub = {
        id: 'sub_1',
        plan: 'pro',
        status: 'active',
        cancel_at_period_end: false,
        current_period_end: '2025-02-01T00:00:00Z',
      };

      mockSubscriptionService.reactivateSubscription.mockResolvedValue(mockReactivatedSub);

      const req = new NextRequest('http://localhost:3000/api/subscriptions/reactivate', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const response = await ReactivatePOST(req);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.message).toContain('reactivated');
      expect(data.subscription.cancel_at_period_end).toBe(false);
    });

    test('should return 401 for unauthenticated request', async () => {
      const req = new NextRequest('http://localhost:3000/api/subscriptions/reactivate', {
        method: 'POST',
      });

      const response = await ReactivatePOST(req);
      expect(response.status).toBe(401);
    });

    test('should return 404 if no subscription', async () => {
      mockSubscriptionService.reactivateSubscription.mockRejectedValue(
        new Error('No subscription found for user')
      );

      const req = new NextRequest('http://localhost:3000/api/subscriptions/reactivate', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const response = await ReactivatePOST(req);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toContain('No subscription to reactivate');
    });

    test('should return 400 if period ended', async () => {
      mockSubscriptionService.reactivateSubscription.mockRejectedValue(
        new Error('Subscription period has ended')
      );

      const req = new NextRequest('http://localhost:3000/api/subscriptions/reactivate', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const response = await ReactivatePOST(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('period has ended');
    });

    test('should be idempotent if not canceled', async () => {
      const mockActiveSub = {
        id: 'sub_1',
        plan: 'pro',
        status: 'active',
        cancel_at_period_end: false,
        current_period_end: '2025-02-01T00:00:00Z',
      };

      mockSubscriptionService.reactivateSubscription.mockResolvedValue(mockActiveSub);

      const req = new NextRequest('http://localhost:3000/api/subscriptions/reactivate', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const response = await ReactivatePOST(req);
      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON in request body', async () => {
      const req = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: '{invalid json}',
      });

      const response = await CheckoutPOST(req);
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should handle missing plan in checkout request', async () => {
      const req = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const response = await CheckoutPOST(req);
      expect(response.status).toBe(400);
    });
  });

  describe('Integration', () => {
    test('should call SubscriptionService with correct parameters', async () => {
      mockSubscriptionService.createCheckoutSession.mockResolvedValue({
        sessionId: 'cs_test',
        url: 'https://checkout.stripe.com/pay/cs_test',
      });

      const req = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ plan: 'pro' }),
      });

      await CheckoutPOST(req);

      expect(mockSubscriptionService.createCheckoutSession).toHaveBeenCalledWith(
        testEcoId,
        testEmail,
        'pro',
        expect.stringContaining('success'),
        expect.stringContaining('cancel')
      );
    });
  });
});
