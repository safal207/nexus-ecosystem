/**
 * @jest-environment node
 */

import { UsageTracker } from '@nexus/usage';
import { OverageService } from '@repo/billing';
import type { IUsageRepository } from '@nexus/usage';
import type { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

// Mock dependencies
const createMockRepository = (): jest.Mocked<IUsageRepository> => ({
  batchInsert: jest.fn().mockResolvedValue(undefined),
  getCurrentUsage: jest.fn(),
  hasExceededLimit: jest.fn(),
  getHistory: jest.fn(),
  getEndpointStats: jest.fn(),
});

const createMockPrisma = (): jest.Mocked<PrismaClient> => ({
  eco_usage_records: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  eco_subscriptions: {
    findUnique: jest.fn(),
  },
  eco_api_usage: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
} as any);

const createMockStripe = (): jest.Mocked<Stripe> => ({
  invoiceItems: {
    create: jest.fn(),
  },
} as any);

describe('Usage Analytics Integration Tests', () => {
  // ============================================================================
  // End-to-End: API Request → Tracking → Database
  // ============================================================================

  describe('E2E: API Request to Database', () => {
    test('should track API request and insert into database', async () => {
      // Arrange
      const mockRepository = createMockRepository();
      const tracker = new UsageTracker(mockRepository);

      const apiRequest = {
        eco_id: 'eco_usr_123',
        endpoint: '/api/test',
        method: 'GET',
        timestamp: new Date(),
        response_time_ms: 150,
        status_code: 200,
      };

      // Act
      await tracker.track(apiRequest);
      await tracker.flush();

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          eco_id: 'eco_usr_123',
          endpoint: '/api/test',
          method: 'GET',
          status_code: 200,
        }),
      ]);

      await tracker.shutdown();
    });

    test('should track multiple concurrent requests', async () => {
      // Arrange
      const mockRepository = createMockRepository();
      const tracker = new UsageTracker(mockRepository);

      const requests = Array.from({ length: 50 }, (_, i) => ({
        eco_id: `eco_usr_${i}`,
        endpoint: '/api/test',
        method: 'GET',
        timestamp: new Date(),
        response_time_ms: 100 + i,
        status_code: 200,
      }));

      // Act - Track all concurrently
      await Promise.all(requests.map((req) => tracker.track(req)));
      await tracker.flush();

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);
      const insertedRecords = (mockRepository.batchInsert as jest.Mock).mock
        .calls[0][0];
      expect(insertedRecords).toHaveLength(50);

      await tracker.shutdown();
    });

    test('should handle tracking with API key ID', async () => {
      // Arrange
      const mockRepository = createMockRepository();
      const tracker = new UsageTracker(mockRepository);

      const apiKeyRequest = {
        eco_id: 'eco_usr_123',
        endpoint: '/api/secure',
        method: 'POST',
        timestamp: new Date(),
        response_time_ms: 200,
        status_code: 201,
        api_key_id: 'eco_api_key123',
      };

      // Act
      await tracker.track(apiKeyRequest);
      await tracker.flush();

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          api_key_id: 'eco_api_key123',
        }),
      ]);

      await tracker.shutdown();
    });
  });

  // ============================================================================
  // E2E: Rate Limiting Flow
  // ============================================================================

  describe('E2E: Rate Limiting', () => {
    test('should allow requests under limit', async () => {
      // Arrange
      const mockRepository = createMockRepository();
      const tracker = new UsageTracker(mockRepository);

      mockRepository.getCurrentUsage.mockResolvedValue({
        apiCalls: 50000,
        limit: 100000,
        overageCalls: 0,
        periodStart: new Date('2025-10-01'),
        periodEnd: new Date('2025-11-01'),
      });

      mockRepository.hasExceededLimit.mockResolvedValue(false);

      // Act
      const exceeded = await tracker.hasExceededLimit('eco_usr_pro');
      const usage = await tracker.getCurrentUsage('eco_usr_pro');

      // Assert
      expect(exceeded).toBe(false);
      expect(usage.apiCalls).toBe(50000);
      expect(usage.limit).toBe(100000);

      await tracker.shutdown();
    });

    test('should detect when limit is exceeded (Free plan)', async () => {
      // Arrange
      const mockRepository = createMockRepository();
      const tracker = new UsageTracker(mockRepository);

      mockRepository.getCurrentUsage.mockResolvedValue({
        apiCalls: 1001,
        limit: 1000,
        overageCalls: 1,
        periodStart: new Date('2025-10-01'),
        periodEnd: new Date('2025-11-01'),
      });

      mockRepository.hasExceededLimit.mockResolvedValue(true);

      // Act
      const exceeded = await tracker.hasExceededLimit('eco_usr_free');
      const usage = await tracker.getCurrentUsage('eco_usr_free');

      // Assert
      expect(exceeded).toBe(true);
      expect(usage.apiCalls).toBe(1001);
      expect(usage.overageCalls).toBe(1);

      await tracker.shutdown();
    });

    test('should allow overage for Pro plan', async () => {
      // Arrange
      const mockRepository = createMockRepository();
      const tracker = new UsageTracker(mockRepository);

      mockRepository.getCurrentUsage.mockResolvedValue({
        apiCalls: 105000,
        limit: 100000,
        overageCalls: 5000,
        periodStart: new Date('2025-10-01'),
        periodEnd: new Date('2025-11-01'),
      });

      mockRepository.hasExceededLimit.mockResolvedValue(true);

      // Act
      const usage = await tracker.getCurrentUsage('eco_usr_pro');

      // Assert
      expect(usage.overageCalls).toBe(5000);
      // Pro plan would still allow request (not blocked)

      await tracker.shutdown();
    });
  });

  // ============================================================================
  // E2E: Overage Calculation → Billing
  // ============================================================================

  describe('E2E: Overage to Billing', () => {
    test('should calculate overage and create Stripe invoice', async () => {
      // Arrange
      const mockPrisma = createMockPrisma();
      const mockStripe = createMockStripe();
      const overageService = new OverageService(mockStripe, mockPrisma);

      const mockUsageRecord = {
        eco_id: 'eco_usr_pro',
        subscription_id: 'sub_123',
        api_calls: 105000,
        overage_calls: 5000,
        overage_cost: 500,
        billing_period_start: new Date('2025-10-01'),
        billing_period_end: new Date('2025-11-01'),
        subscription: {
          plan: 'pro',
          status: 'active',
          id: 'sub_123',
          stripe_subscription_id: 'sub_stripe_123',
          identity: {
            stripe_customer_id: 'cus_123',
          },
        },
      };

      const mockSubscription = mockUsageRecord.subscription;

      (mockPrisma.eco_usage_records.findFirst as jest.Mock).mockResolvedValue(
        mockUsageRecord
      );
      (mockPrisma.eco_subscriptions.findUnique as jest.Mock).mockResolvedValue(
        mockSubscription
      );
      (mockStripe.invoiceItems.create as jest.Mock).mockResolvedValue({
        id: 'ii_123',
      });

      // Act - Calculate overage
      const charge = await overageService.calculateOverage(
        'eco_usr_pro',
        new Date('2025-10-01')
      );

      expect(charge).not.toBeNull();
      expect(charge!.overageCalls).toBe(5000);
      expect(charge!.overageCostCents).toBe(500);

      // Act - Charge overage
      const invoiceItemId = await overageService.chargeOverage(charge!);

      // Assert
      expect(invoiceItemId).toBe('ii_123');
      expect(mockStripe.invoiceItems.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_123',
          amount: 500,
          description: expect.stringContaining('5,000 calls'),
        })
      );
    });

    test('should skip Free plan users in overage billing', async () => {
      // Arrange
      const mockPrisma = createMockPrisma();
      const mockStripe = createMockStripe();
      const overageService = new OverageService(mockStripe, mockPrisma);

      const mockUsageRecord = {
        eco_id: 'eco_usr_free',
        subscription_id: 'sub_free',
        api_calls: 1500,
        overage_calls: 500,
        overage_cost: 0,
        billing_period_start: new Date('2025-10-01'),
        billing_period_end: new Date('2025-11-01'),
        subscription: {
          plan: 'free',
          status: 'active',
        },
      };

      (mockPrisma.eco_usage_records.findFirst as jest.Mock).mockResolvedValue(
        mockUsageRecord
      );

      // Act
      const charge = await overageService.calculateOverage(
        'eco_usr_free',
        new Date('2025-10-01')
      );

      // Assert - Free users not charged
      expect(charge).toBeNull();
      expect(mockStripe.invoiceItems.create).not.toHaveBeenCalled();
    });

    test('should process batch overage for multiple Pro users', async () => {
      // Arrange
      const mockPrisma = createMockPrisma();
      const mockStripe = createMockStripe();
      const overageService = new OverageService(mockStripe, mockPrisma);

      const mockUsageRecords = [
        {
          eco_id: 'eco_usr_pro1',
          subscription_id: 'sub_1',
          api_calls: 105000,
          overage_calls: 5000,
          overage_cost: 500,
          billing_period_start: new Date('2025-10-01'),
          billing_period_end: new Date('2025-11-01'),
          overage_invoiced: false,
          subscription: {
            plan: 'pro',
            status: 'active',
            id: 'sub_1',
            stripe_subscription_id: 'sub_stripe_1',
            identity: { stripe_customer_id: 'cus_1' },
          },
        },
        {
          eco_id: 'eco_usr_pro2',
          subscription_id: 'sub_2',
          api_calls: 110000,
          overage_calls: 10000,
          overage_cost: 1000,
          billing_period_start: new Date('2025-10-01'),
          billing_period_end: new Date('2025-11-01'),
          overage_invoiced: false,
          subscription: {
            plan: 'pro',
            status: 'active',
            id: 'sub_2',
            stripe_subscription_id: 'sub_stripe_2',
            identity: { stripe_customer_id: 'cus_2' },
          },
        },
      ];

      (mockPrisma.eco_usage_records.findMany as jest.Mock).mockResolvedValue(
        mockUsageRecords
      );

      (mockPrisma.eco_subscriptions.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockUsageRecords[0].subscription)
        .mockResolvedValueOnce(mockUsageRecords[1].subscription);

      (mockStripe.invoiceItems.create as jest.Mock)
        .mockResolvedValueOnce({ id: 'ii_1' })
        .mockResolvedValueOnce({ id: 'ii_2' });

      // Act
      const results = await overageService.processMonthlyOverage();

      // Assert
      expect(results.processed).toBe(2);
      expect(results.charged).toBe(2);
      expect(results.totalCents).toBe(1500); // 500 + 1000
      expect(mockStripe.invoiceItems.create).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================================
  // E2E: Complete User Journey
  // ============================================================================

  describe('E2E: Complete User Journey', () => {
    test('Pro user: signup → usage → overage → billing', async () => {
      // Step 1: User signs up (Pro plan)
      const ecoId = 'eco_usr_journey_pro';
      const subscriptionId = 'sub_journey';

      // Step 2: User makes API requests (tracked)
      const mockRepository = createMockRepository();
      const tracker = new UsageTracker(mockRepository);

      // Make 105,000 API calls (5k over limit)
      const requests = Array.from({ length: 105 }, (_, i) => ({
        eco_id: ecoId,
        endpoint: '/api/data',
        method: 'GET',
        timestamp: new Date(),
        response_time_ms: 150,
        status_code: 200,
      }));

      for (const req of requests) {
        await tracker.track(req);
      }

      // Step 3: Usage tracked in database
      await tracker.flush();
      expect(mockRepository.batchInsert).toHaveBeenCalled();

      // Step 4: End of billing period - check overage
      const mockPrisma = createMockPrisma();
      const mockStripe = createMockStripe();
      const overageService = new OverageService(mockStripe, mockPrisma);

      const mockUsageRecord = {
        eco_id: ecoId,
        subscription_id: subscriptionId,
        api_calls: 105000,
        overage_calls: 5000,
        overage_cost: 500,
        billing_period_start: new Date('2025-10-01'),
        billing_period_end: new Date('2025-11-01'),
        subscription: {
          plan: 'pro',
          status: 'active',
          id: subscriptionId,
          stripe_subscription_id: 'sub_stripe_journey',
          identity: { stripe_customer_id: 'cus_journey' },
        },
      };

      (mockPrisma.eco_usage_records.findFirst as jest.Mock).mockResolvedValue(
        mockUsageRecord
      );
      (mockPrisma.eco_subscriptions.findUnique as jest.Mock).mockResolvedValue(
        mockUsageRecord.subscription
      );
      (mockStripe.invoiceItems.create as jest.Mock).mockResolvedValue({
        id: 'ii_journey',
      });

      const charge = await overageService.calculateOverage(
        ecoId,
        new Date('2025-10-01')
      );

      expect(charge).not.toBeNull();
      expect(charge!.overageCalls).toBe(5000);

      // Step 5: Charge overage
      const invoiceItemId = await overageService.chargeOverage(charge!);

      expect(invoiceItemId).toBe('ii_journey');
      expect(mockStripe.invoiceItems.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 500, // $5.00
        })
      );

      await tracker.shutdown();
    });

    test('Free user: signup → usage → limit reached → blocked', async () => {
      // Step 1: User signs up (Free plan)
      const ecoId = 'eco_usr_journey_free';

      // Step 2: User makes API requests
      const mockRepository = createMockRepository();
      const tracker = new UsageTracker(mockRepository);

      // Make 1000 API calls (at limit)
      for (let i = 0; i < 1000; i++) {
        await tracker.track({
          eco_id: ecoId,
          endpoint: '/api/free',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      await tracker.flush();

      // Step 3: Check if limit exceeded
      mockRepository.hasExceededLimit.mockResolvedValue(false); // At limit, not over
      mockRepository.getCurrentUsage.mockResolvedValue({
        apiCalls: 1000,
        limit: 1000,
        overageCalls: 0,
        periodStart: new Date('2025-10-01'),
        periodEnd: new Date('2025-11-01'),
      });

      let exceeded = await tracker.hasExceededLimit(ecoId);
      expect(exceeded).toBe(false); // Still allowed

      // Step 4: Try 1001st request
      mockRepository.hasExceededLimit.mockResolvedValue(true); // Now exceeded
      mockRepository.getCurrentUsage.mockResolvedValue({
        apiCalls: 1001,
        limit: 1000,
        overageCalls: 1,
        periodStart: new Date('2025-10-01'),
        periodEnd: new Date('2025-11-01'),
      });

      exceeded = await tracker.hasExceededLimit(ecoId);
      expect(exceeded).toBe(true); // Blocked!

      // Step 5: No overage billing for Free users
      const mockPrisma = createMockPrisma();
      const mockStripe = createMockStripe();
      const overageService = new OverageService(mockStripe, mockPrisma);

      (mockPrisma.eco_usage_records.findFirst as jest.Mock).mockResolvedValue({
        eco_id: ecoId,
        subscription: { plan: 'free' },
      });

      const charge = await overageService.calculateOverage(
        ecoId,
        new Date('2025-10-01')
      );

      expect(charge).toBeNull(); // Free users not charged

      await tracker.shutdown();
    });

    test('Enterprise user: signup → unlimited usage → no overage', async () => {
      // Step 1: Enterprise user makes massive usage
      const ecoId = 'eco_usr_journey_ent';
      const mockRepository = createMockRepository();
      const tracker = new UsageTracker(mockRepository);

      // Make 500,000 API calls (way over Pro limit)
      for (let i = 0; i < 500; i++) {
        await tracker.track({
          eco_id: ecoId,
          endpoint: '/api/enterprise',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 80,
          status_code: 200,
        });
      }

      await tracker.flush();

      // Step 2: Check usage (no limit)
      mockRepository.hasExceededLimit.mockResolvedValue(false); // Never exceeded
      mockRepository.getCurrentUsage.mockResolvedValue({
        apiCalls: 500000,
        limit: -1, // Unlimited
        overageCalls: 0,
        periodStart: new Date('2025-10-01'),
        periodEnd: new Date('2025-11-01'),
      });

      const exceeded = await tracker.hasExceededLimit(ecoId);
      expect(exceeded).toBe(false); // Never blocked

      // Step 3: No overage billing for Enterprise
      const mockPrisma = createMockPrisma();
      const mockStripe = createMockStripe();
      const overageService = new OverageService(mockStripe, mockPrisma);

      (mockPrisma.eco_usage_records.findFirst as jest.Mock).mockResolvedValue({
        eco_id: ecoId,
        api_calls: 500000,
        overage_calls: 0,
        subscription: { plan: 'enterprise' },
      });

      const charge = await overageService.calculateOverage(
        ecoId,
        new Date('2025-10-01')
      );

      expect(charge).toBeNull(); // No charge for Enterprise

      await tracker.shutdown();
    });
  });

  // ============================================================================
  // E2E: Error Scenarios
  // ============================================================================

  describe('E2E: Error Scenarios', () => {
    test('should continue tracking if database insert fails', async () => {
      // Arrange
      const mockRepository = createMockRepository();
      mockRepository.batchInsert.mockRejectedValueOnce(
        new Error('Database error')
      );

      const tracker = new UsageTracker(mockRepository);

      // Act - First batch fails
      for (let i = 0; i < 100; i++) {
        await tracker.track({
          eco_id: `eco_usr_${i}`,
          endpoint: '/api/test',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      // First batch should have failed
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);

      // Second batch should work
      mockRepository.batchInsert.mockResolvedValueOnce(undefined);

      await tracker.track({
        eco_id: 'eco_usr_after_error',
        endpoint: '/api/test',
        method: 'GET',
        timestamp: new Date(),
        response_time_ms: 100,
        status_code: 200,
      });

      await tracker.flush();

      // Assert - Tracker still functional
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(2);

      await tracker.shutdown();
    });

    test('should handle Stripe errors gracefully in batch overage', async () => {
      // Arrange
      const mockPrisma = createMockPrisma();
      const mockStripe = createMockStripe();
      const overageService = new OverageService(mockStripe, mockPrisma);

      const mockUsageRecords = [
        {
          eco_id: 'eco_usr_success',
          subscription_id: 'sub_success',
          overage_calls: 5000,
          overage_cost: 500,
          billing_period_start: new Date('2025-10-01'),
          billing_period_end: new Date('2025-11-01'),
          subscription: {
            plan: 'pro',
            status: 'active',
            id: 'sub_success',
            stripe_subscription_id: 'sub_stripe_success',
            identity: { stripe_customer_id: 'cus_success' },
          },
        },
        {
          eco_id: 'eco_usr_fail',
          subscription_id: 'sub_fail',
          overage_calls: 10000,
          overage_cost: 1000,
          billing_period_start: new Date('2025-10-01'),
          billing_period_end: new Date('2025-11-01'),
          subscription: {
            plan: 'pro',
            status: 'active',
            id: 'sub_fail',
            stripe_subscription_id: null, // Will fail
            identity: { stripe_customer_id: 'cus_fail' },
          },
        },
      ];

      (mockPrisma.eco_usage_records.findMany as jest.Mock).mockResolvedValue(
        mockUsageRecords
      );

      (mockPrisma.eco_subscriptions.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockUsageRecords[0].subscription)
        .mockResolvedValueOnce(mockUsageRecords[1].subscription);

      (mockStripe.invoiceItems.create as jest.Mock).mockResolvedValueOnce({
        id: 'ii_success',
      });

      // Act
      const results = await overageService.processMonthlyOverage();

      // Assert - First succeeded, second failed, batch continued
      expect(results.processed).toBe(2);
      expect(results.charged).toBe(1);
      expect(results.errors).toHaveLength(1);
      expect(results.errors[0].ecoId).toBe('eco_usr_fail');
    });
  });

  // ============================================================================
  // Performance Integration Tests
  // ============================================================================

  describe('Performance Integration', () => {
    test('should handle high-throughput tracking (1000 requests)', async () => {
      // Arrange
      const mockRepository = createMockRepository();
      const tracker = new UsageTracker(mockRepository);

      // Act - Track 1000 requests
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        tracker.track({
          eco_id: `eco_usr_${i % 100}`, // 100 users
          endpoint: '/api/perf',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      await tracker.flush();
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(1000); // Should complete in < 1 second
      expect(mockRepository.batchInsert).toHaveBeenCalled();

      await tracker.shutdown();
    });

    test('should process large overage batch efficiently', async () => {
      // Arrange
      const mockPrisma = createMockPrisma();
      const mockStripe = createMockStripe();
      const overageService = new OverageService(mockStripe, mockPrisma);

      // 100 Pro users with overage
      const mockUsageRecords = Array.from({ length: 100 }, (_, i) => ({
        eco_id: `eco_usr_${i}`,
        subscription_id: `sub_${i}`,
        overage_calls: 5000,
        overage_cost: 500,
        billing_period_start: new Date('2025-10-01'),
        billing_period_end: new Date('2025-11-01'),
        overage_invoiced: false,
        subscription: {
          plan: 'pro',
          status: 'active',
          id: `sub_${i}`,
          stripe_subscription_id: `sub_stripe_${i}`,
          identity: { stripe_customer_id: `cus_${i}` },
        },
      }));

      (mockPrisma.eco_usage_records.findMany as jest.Mock).mockResolvedValue(
        mockUsageRecords
      );

      (mockPrisma.eco_subscriptions.findUnique as jest.Mock).mockImplementation(
        async ({ where }: any) => {
          const sub = mockUsageRecords.find((r) => r.subscription_id === where.id);
          return sub?.subscription;
        }
      );

      (mockStripe.invoiceItems.create as jest.Mock).mockImplementation(
        async () => ({ id: `ii_${Date.now()}` })
      );

      // Act
      const startTime = Date.now();
      const results = await overageService.processMonthlyOverage();
      const duration = Date.now() - startTime;

      // Assert
      expect(results.charged).toBe(100);
      expect(results.totalCents).toBe(50000); // 100 × 500
      // Performance acceptable for batch job (< 30 seconds for 100 users)
      expect(duration).toBeLessThan(30000);
    });
  });
});
