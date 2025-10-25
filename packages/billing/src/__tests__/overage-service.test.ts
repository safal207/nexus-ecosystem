/**
 * @jest-environment node
 */

import { OverageService } from '../overage-service';
import Stripe from 'stripe';
import type { PrismaClient } from '@prisma/client';

// Mock Stripe
jest.mock('stripe');

// Mock Prisma
const mockPrisma = {
  eco_usage_records: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  eco_subscriptions: {
    findUnique: jest.fn(),
  },
} as unknown as PrismaClient;

// Mock Stripe instance
const mockStripe = {
  invoiceItems: {
    create: jest.fn(),
  },
} as unknown as Stripe;

describe('OverageService', () => {
  let overageService: OverageService;

  beforeEach(() => {
    jest.clearAllMocks();
    overageService = new OverageService(mockStripe, mockPrisma);
  });

  // ============================================================================
  // calculateOverage() Tests
  // ============================================================================

  describe('calculateOverage()', () => {
    test('should return overage details for Pro user with overage', async () => {
      // Arrange
      const ecoId = 'eco_usr_pro123';
      const periodStart = new Date('2025-10-01');

      const mockUsageRecord = {
        eco_id: ecoId,
        subscription_id: 'sub_123',
        api_calls: 105000,
        overage_calls: 5000,
        overage_cost: 500, // cents
        billing_period_start: periodStart,
        billing_period_end: new Date('2025-11-01'),
        subscription: {
          plan: 'pro',
          status: 'active',
        },
      };

      (mockPrisma.eco_usage_records.findFirst as jest.Mock).mockResolvedValue(
        mockUsageRecord
      );

      // Act
      const result = await overageService.calculateOverage(ecoId, periodStart);

      // Assert
      expect(result).toEqual({
        ecoId,
        subscriptionId: 'sub_123',
        overageCalls: 5000,
        overageCostCents: 500,
        billingPeriodStart: periodStart,
        billingPeriodEnd: new Date('2025-11-01'),
      });

      expect(mockPrisma.eco_usage_records.findFirst).toHaveBeenCalledWith({
        where: {
          eco_id: ecoId,
          billing_period_start: periodStart,
        },
        include: {
          subscription: true,
        },
      });
    });

    test('should return null if no usage record found', async () => {
      // Arrange
      const ecoId = 'eco_usr_nonexistent';
      const periodStart = new Date('2025-10-01');

      (mockPrisma.eco_usage_records.findFirst as jest.Mock).mockResolvedValue(
        null
      );

      // Act
      const result = await overageService.calculateOverage(ecoId, periodStart);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for Free plan user (not charged)', async () => {
      // Arrange
      const ecoId = 'eco_usr_free123';
      const periodStart = new Date('2025-10-01');

      const mockUsageRecord = {
        eco_id: ecoId,
        subscription_id: 'sub_free',
        api_calls: 1500,
        overage_calls: 500,
        overage_cost: 0,
        billing_period_start: periodStart,
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
      const result = await overageService.calculateOverage(ecoId, periodStart);

      // Assert
      expect(result).toBeNull(); // Free users not charged
    });

    test('should return null for Enterprise plan user (unlimited)', async () => {
      // Arrange
      const ecoId = 'eco_usr_enterprise123';
      const periodStart = new Date('2025-10-01');

      const mockUsageRecord = {
        eco_id: ecoId,
        subscription_id: 'sub_ent',
        api_calls: 500000,
        overage_calls: 0, // No overage for Enterprise
        overage_cost: 0,
        billing_period_start: periodStart,
        billing_period_end: new Date('2025-11-01'),
        subscription: {
          plan: 'enterprise',
          status: 'active',
        },
      };

      (mockPrisma.eco_usage_records.findFirst as jest.Mock).mockResolvedValue(
        mockUsageRecord
      );

      // Act
      const result = await overageService.calculateOverage(ecoId, periodStart);

      // Assert
      expect(result).toBeNull(); // Enterprise unlimited
    });

    test('should return null if no overage (Pro user under limit)', async () => {
      // Arrange
      const ecoId = 'eco_usr_pro_under';
      const periodStart = new Date('2025-10-01');

      const mockUsageRecord = {
        eco_id: ecoId,
        subscription_id: 'sub_pro',
        api_calls: 80000, // Under 100k limit
        overage_calls: 0,
        overage_cost: 0,
        billing_period_start: periodStart,
        billing_period_end: new Date('2025-11-01'),
        subscription: {
          plan: 'pro',
          status: 'active',
        },
      };

      (mockPrisma.eco_usage_records.findFirst as jest.Mock).mockResolvedValue(
        mockUsageRecord
      );

      // Act
      const result = await overageService.calculateOverage(ecoId, periodStart);

      // Assert
      expect(result).toBeNull(); // No overage
    });
  });

  // ============================================================================
  // chargeOverage() Tests
  // ============================================================================

  describe('chargeOverage()', () => {
    test('should create Stripe invoice item and update database', async () => {
      // Arrange
      const charge = {
        ecoId: 'eco_usr_pro123',
        subscriptionId: 'sub_123',
        overageCalls: 5000,
        overageCostCents: 500,
        billingPeriodStart: new Date('2025-10-01'),
        billingPeriodEnd: new Date('2025-11-01'),
      };

      const mockSubscription = {
        id: 'sub_123',
        stripe_subscription_id: 'sub_stripe_123',
        identity: {
          stripe_customer_id: 'cus_123',
        },
      };

      const mockInvoiceItem = {
        id: 'ii_123',
        amount: 500,
      };

      (mockPrisma.eco_subscriptions.findUnique as jest.Mock).mockResolvedValue(
        mockSubscription
      );

      (mockStripe.invoiceItems.create as jest.Mock).mockResolvedValue(
        mockInvoiceItem
      );

      (mockPrisma.eco_usage_records.update as jest.Mock).mockResolvedValue({});

      // Act
      const result = await overageService.chargeOverage(charge);

      // Assert
      expect(result).toBe('ii_123');

      // Verify Stripe invoice item created
      expect(mockStripe.invoiceItems.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        subscription: 'sub_stripe_123',
        amount: 500,
        currency: 'usd',
        description: 'API overage: 5,000 calls beyond 100k limit',
        metadata: {
          eco_id: 'eco_usr_pro123',
          overage_calls: '5000',
          billing_period_start: '2025-10-01T00:00:00.000Z',
          billing_period_end: '2025-11-01T00:00:00.000Z',
        },
      });

      // Verify database updated
      expect(mockPrisma.eco_usage_records.update).toHaveBeenCalledWith({
        where: {
          eco_id_billing_period_start: {
            eco_id: 'eco_usr_pro123',
            billing_period_start: charge.billingPeriodStart,
          },
        },
        data: {
          overage_invoiced: true,
          stripe_invoice_item_id: 'ii_123',
          updated_at: expect.any(Date),
        },
      });
    });

    test('should throw error if subscription not found', async () => {
      // Arrange
      const charge = {
        ecoId: 'eco_usr_pro123',
        subscriptionId: 'sub_nonexistent',
        overageCalls: 5000,
        overageCostCents: 500,
        billingPeriodStart: new Date('2025-10-01'),
        billingPeriodEnd: new Date('2025-11-01'),
      };

      (mockPrisma.eco_subscriptions.findUnique as jest.Mock).mockResolvedValue(
        null
      );

      // Act & Assert
      await expect(overageService.chargeOverage(charge)).rejects.toThrow(
        'No Stripe subscription found for subscription ID: sub_nonexistent'
      );
    });

    test('should throw error if no Stripe subscription ID', async () => {
      // Arrange
      const charge = {
        ecoId: 'eco_usr_pro123',
        subscriptionId: 'sub_123',
        overageCalls: 5000,
        overageCostCents: 500,
        billingPeriodStart: new Date('2025-10-01'),
        billingPeriodEnd: new Date('2025-11-01'),
      };

      const mockSubscription = {
        id: 'sub_123',
        stripe_subscription_id: null, // No Stripe subscription
        identity: {
          stripe_customer_id: 'cus_123',
        },
      };

      (mockPrisma.eco_subscriptions.findUnique as jest.Mock).mockResolvedValue(
        mockSubscription
      );

      // Act & Assert
      await expect(overageService.chargeOverage(charge)).rejects.toThrow(
        'No Stripe subscription found'
      );
    });

    test('should throw error if no Stripe customer ID', async () => {
      // Arrange
      const charge = {
        ecoId: 'eco_usr_pro123',
        subscriptionId: 'sub_123',
        overageCalls: 5000,
        overageCostCents: 500,
        billingPeriodStart: new Date('2025-10-01'),
        billingPeriodEnd: new Date('2025-11-01'),
      };

      const mockSubscription = {
        id: 'sub_123',
        stripe_subscription_id: 'sub_stripe_123',
        identity: {
          stripe_customer_id: null, // No customer ID
        },
      };

      (mockPrisma.eco_subscriptions.findUnique as jest.Mock).mockResolvedValue(
        mockSubscription
      );

      // Act & Assert
      await expect(overageService.chargeOverage(charge)).rejects.toThrow(
        'No Stripe customer ID found for eco_id: eco_usr_pro123'
      );
    });
  });

  // ============================================================================
  // processMonthlyOverage() Tests
  // ============================================================================

  describe('processMonthlyOverage()', () => {
    test('should process multiple Pro users with overage', async () => {
      // Arrange
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
            identity: {
              stripe_customer_id: 'cus_1',
            },
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
            identity: {
              stripe_customer_id: 'cus_2',
            },
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

      (mockPrisma.eco_usage_records.update as jest.Mock).mockResolvedValue({});

      // Act
      const result = await overageService.processMonthlyOverage();

      // Assert
      expect(result).toEqual({
        processed: 2,
        charged: 2,
        totalCents: 1500, // 500 + 1000
        errors: [],
      });

      expect(mockStripe.invoiceItems.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.eco_usage_records.update).toHaveBeenCalledTimes(2);
    });

    test('should skip already invoiced records (idempotency)', async () => {
      // Arrange
      const mockUsageRecords = [
        {
          eco_id: 'eco_usr_pro1',
          subscription_id: 'sub_1',
          api_calls: 105000,
          overage_calls: 5000,
          overage_cost: 500,
          billing_period_start: new Date('2025-10-01'),
          billing_period_end: new Date('2025-11-01'),
          overage_invoiced: true, // Already invoiced
          stripe_invoice_item_id: 'ii_existing',
          subscription: {
            plan: 'pro',
            status: 'active',
          },
        },
      ];

      (mockPrisma.eco_usage_records.findMany as jest.Mock).mockResolvedValue(
        mockUsageRecords
      );

      // Act
      const result = await overageService.processMonthlyOverage();

      // Assert
      expect(result).toEqual({
        processed: 0, // Query filters out already invoiced
        charged: 0,
        totalCents: 0,
        errors: [],
      });

      expect(mockStripe.invoiceItems.create).not.toHaveBeenCalled();
    });

    test('should handle errors for individual users without stopping batch', async () => {
      // Arrange
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
            identity: {
              stripe_customer_id: 'cus_1',
            },
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
            stripe_subscription_id: null, // Error: No Stripe subscription
            identity: {
              stripe_customer_id: 'cus_2',
            },
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
        id: 'ii_1',
      });

      (mockPrisma.eco_usage_records.update as jest.Mock).mockResolvedValue({});

      // Act
      const result = await overageService.processMonthlyOverage();

      // Assert
      expect(result.processed).toBe(2);
      expect(result.charged).toBe(1); // Only first user succeeded
      expect(result.totalCents).toBe(500);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        ecoId: 'eco_usr_pro2',
        error: expect.stringContaining('No Stripe subscription'),
      });

      // First user charged, second failed
      expect(mockStripe.invoiceItems.create).toHaveBeenCalledTimes(1);
    });

    test('should return empty results if no records with overage', async () => {
      // Arrange
      (mockPrisma.eco_usage_records.findMany as jest.Mock).mockResolvedValue(
        []
      );

      // Act
      const result = await overageService.processMonthlyOverage();

      // Assert
      expect(result).toEqual({
        processed: 0,
        charged: 0,
        totalCents: 0,
        errors: [],
      });

      expect(mockStripe.invoiceItems.create).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // getOverageSummary() Tests
  // ============================================================================

  describe('getOverageSummary()', () => {
    test('should return overage summary for user with overage', async () => {
      // Arrange
      const ecoId = 'eco_usr_pro123';

      const mockUsageRecord = {
        eco_id: ecoId,
        api_calls: 105000,
        overage_calls: 5000,
        overage_cost: 500, // cents
        overage_invoiced: false,
        billing_period_end: new Date('2025-11-01'),
        billing_period_start: new Date('2025-10-01'),
      };

      (mockPrisma.eco_usage_records.findFirst as jest.Mock).mockResolvedValue(
        mockUsageRecord
      );

      // Act
      const result = await overageService.getOverageSummary(ecoId);

      // Assert
      expect(result).toEqual({
        hasOverage: true,
        overageCalls: 5000,
        overageCostCents: 500,
        overageCostUsd: 5.0,
        invoiced: false,
        periodEnd: new Date('2025-11-01'),
      });
    });

    test('should return no overage for user under limit', async () => {
      // Arrange
      const ecoId = 'eco_usr_pro_under';

      const mockUsageRecord = {
        eco_id: ecoId,
        api_calls: 80000,
        overage_calls: 0,
        overage_cost: 0,
        overage_invoiced: false,
        billing_period_end: new Date('2025-11-01'),
        billing_period_start: new Date('2025-10-01'),
      };

      (mockPrisma.eco_usage_records.findFirst as jest.Mock).mockResolvedValue(
        mockUsageRecord
      );

      // Act
      const result = await overageService.getOverageSummary(ecoId);

      // Assert
      expect(result).toEqual({
        hasOverage: false,
        overageCalls: 0,
        overageCostCents: 0,
        overageCostUsd: 0,
        invoiced: false,
        periodEnd: new Date('2025-11-01'),
      });
    });

    test('should return default values if no usage record', async () => {
      // Arrange
      const ecoId = 'eco_usr_new';

      (mockPrisma.eco_usage_records.findFirst as jest.Mock).mockResolvedValue(
        null
      );

      // Act
      const result = await overageService.getOverageSummary(ecoId);

      // Assert
      expect(result).toEqual({
        hasOverage: false,
        overageCalls: 0,
        overageCostCents: 0,
        overageCostUsd: 0,
        invoiced: false,
        periodEnd: null,
      });
    });

    test('should show invoiced = true for already charged overage', async () => {
      // Arrange
      const ecoId = 'eco_usr_pro_invoiced';

      const mockUsageRecord = {
        eco_id: ecoId,
        api_calls: 105000,
        overage_calls: 5000,
        overage_cost: 500,
        overage_invoiced: true, // Already charged
        stripe_invoice_item_id: 'ii_123',
        billing_period_end: new Date('2025-11-01'),
        billing_period_start: new Date('2025-10-01'),
      };

      (mockPrisma.eco_usage_records.findFirst as jest.Mock).mockResolvedValue(
        mockUsageRecord
      );

      // Act
      const result = await overageService.getOverageSummary(ecoId);

      // Assert
      expect(result).toEqual({
        hasOverage: true,
        overageCalls: 5000,
        overageCostCents: 500,
        overageCostUsd: 5.0,
        invoiced: true,
        periodEnd: new Date('2025-11-01'),
      });
    });
  });
});
