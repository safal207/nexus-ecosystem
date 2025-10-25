import { POST } from '../../app/api/webhooks/stripe/route';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';

// Mock environment variables
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test_service_key';

// Test fixtures
const testEcoId = 'eco_usr_test123abc456def789';
const testCustomerId = 'cus_test_123';
const testSubscriptionId = 'sub_test_456';

// Mock Stripe client
jest.mock('stripe', () => {
  const mockStripe = {
    webhooks: {
      constructEvent: jest.fn(),
    },
    subscriptions: {
      retrieve: jest.fn(),
    },
  };
  return jest.fn(() => mockStripe);
});

// Mock Supabase
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

// Mock SubscriptionService
jest.mock('../../../../../../packages/billing/src/subscription-service', () => ({
  SubscriptionService: jest.fn().mockImplementation(() => ({
    updateSubscription: jest.fn().mockResolvedValue({ id: 'sub_1', plan: 'pro' }),
  })),
}));

describe('Stripe Webhooks', () => {
  let mockStripe: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const Str = require('stripe');
    mockStripe = new Str();
  });

  describe('Signature Verification', () => {
    test('should verify valid webhook signature', async () => {
      const event = {
        id: 'evt_test_123',
        type: 'customer.created',
        data: { object: { id: 'cus_test' } },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      // Mock event logging
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: null });
      mockSupabaseClient.insert.mockResolvedValueOnce({ data: { id: event.id }, error: null });
      mockSupabaseClient.update.mockResolvedValueOnce({ data: {}, error: null });

      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 't=123,v1=signature',
        },
      });

      const response = await POST(req);
      expect(response.status).toBe(200);
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalled();
    });

    test('should reject invalid signature', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify({ id: 'evt_test' }),
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
      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify({ id: 'evt_test' }),
      });

      const response = await POST(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('Missing signature');
    });
  });

  describe('checkout.session.completed', () => {
    test('should activate subscription after checkout', async () => {
      const event = {
        id: 'evt_checkout_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            subscription: testSubscriptionId,
            metadata: {
              eco_id: testEcoId,
              plan: 'pro',
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(event);
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: testSubscriptionId,
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      });

      // Mock event logging
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: null });
      mockSupabaseClient.insert.mockResolvedValueOnce({ data: { id: event.id }, error: null });
      mockSupabaseClient.update.mockResolvedValueOnce({ data: {}, error: null });

      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 't=123,v1=sig',
        },
      });

      const response = await POST(req);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.received).toBe(true);
      expect(data.processed).toBe(true);
    });

    test('should handle missing eco_id in metadata', async () => {
      const event = {
        id: 'evt_checkout_no_eco',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            subscription: testSubscriptionId,
            metadata: {
              plan: 'pro',
              // eco_id missing
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      // Mock event logging
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: null });
      mockSupabaseClient.insert.mockResolvedValueOnce({ data: { id: event.id }, error: null });
      mockSupabaseClient.update.mockResolvedValueOnce({ data: {}, error: null });

      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 't=123,v1=sig',
        },
      });

      const response = await POST(req);
      expect(response.status).toBe(500);
    });
  });

  describe('customer.subscription.updated', () => {
    test('should update subscription status', async () => {
      const event = {
        id: 'evt_sub_updated_123',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: testSubscriptionId,
            status: 'active',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            cancel_at_period_end: false,
            metadata: {
              eco_id: testEcoId,
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      // Mock event logging
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: null });
      mockSupabaseClient.insert.mockResolvedValueOnce({ data: { id: event.id }, error: null });
      mockSupabaseClient.update.mockResolvedValueOnce({ data: {}, error: null });

      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 't=123,v1=sig',
        },
      });

      const response = await POST(req);
      expect(response.status).toBe(200);
    });
  });

  describe('customer.subscription.deleted', () => {
    test('should downgrade to free plan', async () => {
      const event = {
        id: 'evt_sub_deleted_123',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: testSubscriptionId,
            ended_at: Math.floor(Date.now() / 1000),
            metadata: {
              eco_id: testEcoId,
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      // Mock event logging
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: null });
      mockSupabaseClient.insert.mockResolvedValueOnce({ data: { id: event.id }, error: null });
      mockSupabaseClient.update.mockResolvedValueOnce({ data: {}, error: null });

      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 't=123,v1=sig',
        },
      });

      const response = await POST(req);
      expect(response.status).toBe(200);
    });
  });

  describe('invoice.payment_failed', () => {
    test('should mark subscription as past_due', async () => {
      const event = {
        id: 'evt_payment_failed_123',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test_123',
            customer: testCustomerId,
            attempt_count: 1,
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      // Mock event logging
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: { eco_id: testEcoId }, error: null });

      mockSupabaseClient.insert.mockResolvedValueOnce({ data: { id: event.id }, error: null });
      mockSupabaseClient.update.mockResolvedValueOnce({ data: {}, error: null });

      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 't=123,v1=sig',
        },
      });

      const response = await POST(req);
      expect(response.status).toBe(200);
    });
  });

  describe('invoice.payment_succeeded', () => {
    test('should reactivate subscription if past_due', async () => {
      const event = {
        id: 'evt_payment_succeeded_123',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test_123',
            customer: testCustomerId,
            status: 'paid',
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      // Mock event logging
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: { eco_id: testEcoId, status: 'past_due' }, error: null });

      mockSupabaseClient.insert.mockResolvedValueOnce({ data: { id: event.id }, error: null });
      mockSupabaseClient.update.mockResolvedValueOnce({ data: {}, error: null });

      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 't=123,v1=sig',
        },
      });

      const response = await POST(req);
      expect(response.status).toBe(200);
    });
  });

  describe('Idempotency', () => {
    test('should handle duplicate events', async () => {
      const event = {
        id: 'evt_duplicate_123',
        type: 'customer.created',
        data: { object: { id: 'cus_test' } },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      // First request - event is new
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: null });
      mockSupabaseClient.insert.mockResolvedValueOnce({ data: { id: event.id }, error: null });
      mockSupabaseClient.update.mockResolvedValueOnce({ data: {}, error: null });

      const req1 = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 't=123,v1=sig',
        },
      });

      const response1 = await POST(req1);
      expect(response1.status).toBe(200);

      // Second request - event already exists
      mockStripe.webhooks.constructEvent.mockReturnValue(event);
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: event.id, processed: true },
        error: null
      });

      const req2 = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 't=123,v1=sig',
        },
      });

      const response2 = await POST(req2);
      expect(response2.status).toBe(200);

      const data2 = await response2.json();
      expect(data2.duplicate).toBe(true);
    });

    test('should log all events in eco_stripe_events', async () => {
      const event = {
        id: 'evt_log_test_123',
        type: 'customer.created',
        data: { object: { id: 'cus_test' } },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      // Mock event logging
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: null });
      mockSupabaseClient.insert.mockResolvedValueOnce({ data: { id: event.id }, error: null });
      mockSupabaseClient.update.mockResolvedValueOnce({ data: {}, error: null });

      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 't=123,v1=sig',
        },
      });

      await POST(req);

      // Verify event was logged
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('eco_stripe_events');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should return 500 on processing error', async () => {
      const event = {
        id: 'evt_error_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            subscription: null, // Invalid - no subscription
            metadata: {
              eco_id: testEcoId,
              plan: 'pro',
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      // Mock event logging
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: null });
      mockSupabaseClient.insert.mockResolvedValueOnce({ data: { id: event.id }, error: null });
      mockSupabaseClient.update.mockResolvedValueOnce({ data: {}, error: null });

      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 't=123,v1=sig',
        },
      });

      const response = await POST(req);
      expect(response.status).toBe(500);
    });
  });
});
