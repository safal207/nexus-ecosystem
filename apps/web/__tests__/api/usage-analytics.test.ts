/**
 * @jest-environment node
 */

import { GET as getCurrentUsage } from '@/app/api/usage/current/route';
import { GET as getUsageHistory } from '@/app/api/usage/history/route';
import { GET as getEndpointStats } from '@/app/api/usage/endpoints/route';
import { GET as getOverageSummary } from '@/app/api/usage/overage/route';
import { NextRequest } from 'next/server';
import { requireAuth } from '@/app/api/usage/_lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createOverageService } from '@repo/billing';

// Mock dependencies
jest.mock('@/app/api/usage/_lib/auth');
jest.mock('@/lib/supabase/admin');
jest.mock('@repo/billing');

const mockRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockGetSupabaseAdmin = getSupabaseAdmin as jest.MockedFunction<
  typeof getSupabaseAdmin
>;
const mockCreateOverageService = createOverageService as jest.MockedFunction<
  typeof createOverageService
>;

describe('Usage Analytics API Tests', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(),
    };

    mockGetSupabaseAdmin.mockReturnValue(mockSupabase);
  });

  // ============================================================================
  // GET /api/usage/current - Current Period Usage
  // ============================================================================

  describe('GET /api/usage/current', () => {
    test('should return current usage for authenticated user', async () => {
      // Arrange
      const ecoId = 'eco_usr_123';
      mockRequireAuth.mockResolvedValue({ ecoId, email: 'test@example.com' });

      const mockUsageData = {
        eco_id: ecoId,
        api_calls: 5000,
        overage_calls: 0,
        billing_period_start: '2025-10-01T00:00:00Z',
        billing_period_end: '2025-11-01T00:00:00Z',
        subscription: {
          plan: 'pro',
        },
      };

      mockSupabase.single.mockResolvedValue({
        data: mockUsageData,
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage/current');

      // Act
      const response = await getCurrentUsage(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual({
        api_calls: 5000,
        limit: 100000, // Pro plan
        remaining: 95000,
        overage_calls: 0,
        usage_percentage: 5.0,
        period_start: '2025-10-01T00:00:00Z',
        period_end: '2025-11-01T00:00:00Z',
        plan: 'pro',
      });
    });

    test('should return 401 if not authenticated', async () => {
      // Arrange
      mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

      const request = new NextRequest('http://localhost:3000/api/usage/current');

      // Act
      const response = await getCurrentUsage(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    test('should return 404 if no usage record found', async () => {
      // Arrange
      const ecoId = 'eco_usr_new';
      mockRequireAuth.mockResolvedValue({ ecoId, email: 'new@example.com' });

      mockSupabase.single.mockResolvedValue({
        data: null,
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage/current');

      // Act
      const response = await getCurrentUsage(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'No usage record found' });
    });

    test('should calculate usage percentage correctly', async () => {
      // Arrange
      const testCases = [
        { api_calls: 0, expected: 0.0 },
        { api_calls: 50000, expected: 50.0 },
        { api_calls: 100000, expected: 100.0 },
        { api_calls: 105000, expected: 105.0 }, // Over limit
      ];

      for (const { api_calls, expected } of testCases) {
        mockRequireAuth.mockResolvedValue({
          ecoId: 'eco_usr_test',
          email: 'test@example.com',
        });

        mockSupabase.single.mockResolvedValue({
          data: {
            eco_id: 'eco_usr_test',
            api_calls,
            overage_calls: Math.max(0, api_calls - 100000),
            billing_period_start: '2025-10-01T00:00:00Z',
            billing_period_end: '2025-11-01T00:00:00Z',
            subscription: { plan: 'pro' },
          },
          error: null,
        });

        const request = new NextRequest('http://localhost:3000/api/usage/current');

        // Act
        const response = await getCurrentUsage(request);
        const data = await response.json();

        // Assert
        expect(data.usage_percentage).toBe(expected);
      }
    });

    test('should handle Free plan limits', async () => {
      // Arrange
      mockRequireAuth.mockResolvedValue({
        ecoId: 'eco_usr_free',
        email: 'free@example.com',
      });

      mockSupabase.single.mockResolvedValue({
        data: {
          eco_id: 'eco_usr_free',
          api_calls: 800,
          overage_calls: 0,
          billing_period_start: '2025-10-01T00:00:00Z',
          billing_period_end: '2025-11-01T00:00:00Z',
          subscription: { plan: 'free' },
        },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage/current');

      // Act
      const response = await getCurrentUsage(request);
      const data = await response.json();

      // Assert
      expect(data.limit).toBe(1000); // Free plan limit
      expect(data.remaining).toBe(200);
      expect(data.usage_percentage).toBe(80.0);
    });

    test('should handle Enterprise unlimited plan', async () => {
      // Arrange
      mockRequireAuth.mockResolvedValue({
        ecoId: 'eco_usr_ent',
        email: 'enterprise@example.com',
      });

      mockSupabase.single.mockResolvedValue({
        data: {
          eco_id: 'eco_usr_ent',
          api_calls: 500000,
          overage_calls: 0,
          billing_period_start: '2025-10-01T00:00:00Z',
          billing_period_end: '2025-11-01T00:00:00Z',
          subscription: { plan: 'enterprise' },
        },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage/current');

      // Act
      const response = await getCurrentUsage(request);
      const data = await response.json();

      // Assert
      expect(data.limit).toBe(-1); // Unlimited
      expect(data.remaining).toBe(-1);
      expect(data.usage_percentage).toBe(0); // N/A for unlimited
    });
  });

  // ============================================================================
  // GET /api/usage/history - Historical Usage
  // ============================================================================

  describe('GET /api/usage/history', () => {
    test('should return usage history for default 30 days', async () => {
      // Arrange
      const ecoId = 'eco_usr_123';
      mockRequireAuth.mockResolvedValue({ ecoId, email: 'test@example.com' });

      const mockHistoryData = [
        {
          date: '2025-10-15',
          total_calls: 1000,
          successful_calls: 950,
          failed_calls: 50,
          avg_response_time_ms: 150,
        },
        {
          date: '2025-10-14',
          total_calls: 1200,
          successful_calls: 1150,
          failed_calls: 50,
          avg_response_time_ms: 180,
        },
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockHistoryData,
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage/history');

      // Act
      const response = await getUsageHistory(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.history).toEqual(mockHistoryData);
      expect(data.period_days).toBe(30);
    });

    test('should accept custom days parameter', async () => {
      // Arrange
      mockRequireAuth.mockResolvedValue({
        ecoId: 'eco_usr_123',
        email: 'test@example.com',
      });

      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/usage/history?days=7'
      );

      // Act
      const response = await getUsageHistory(request);
      const data = await response.json();

      // Assert
      expect(data.period_days).toBe(7);
    });

    test('should limit days parameter to 365', async () => {
      // Arrange
      mockRequireAuth.mockResolvedValue({
        ecoId: 'eco_usr_123',
        email: 'test@example.com',
      });

      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/usage/history?days=500'
      );

      // Act
      const response = await getUsageHistory(request);
      const data = await response.json();

      // Assert
      expect(data.period_days).toBe(365); // Capped at 365
    });

    test('should return 401 if not authenticated', async () => {
      // Arrange
      mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

      const request = new NextRequest('http://localhost:3000/api/usage/history');

      // Act
      const response = await getUsageHistory(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    test('should return empty array if no history', async () => {
      // Arrange
      mockRequireAuth.mockResolvedValue({
        ecoId: 'eco_usr_new',
        email: 'new@example.com',
      });

      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage/history');

      // Act
      const response = await getUsageHistory(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.history).toEqual([]);
    });
  });

  // ============================================================================
  // GET /api/usage/endpoints - Endpoint Statistics
  // ============================================================================

  describe('GET /api/usage/endpoints', () => {
    test('should return endpoint statistics for default 7 days', async () => {
      // Arrange
      const ecoId = 'eco_usr_123';
      mockRequireAuth.mockResolvedValue({ ecoId, email: 'test@example.com' });

      const mockEndpointData = [
        {
          endpoint: '/api/test',
          method: 'GET',
          total_calls: 5000,
          avg_response_time_ms: 150,
          success_rate: 0.95,
        },
        {
          endpoint: '/api/users',
          method: 'POST',
          total_calls: 1000,
          avg_response_time_ms: 200,
          success_rate: 0.98,
        },
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockEndpointData,
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage/endpoints');

      // Act
      const response = await getEndpointStats(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.endpoints).toEqual(mockEndpointData);
      expect(data.period_days).toBe(7);
    });

    test('should accept custom days parameter', async () => {
      // Arrange
      mockRequireAuth.mockResolvedValue({
        ecoId: 'eco_usr_123',
        email: 'test@example.com',
      });

      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/usage/endpoints?days=30'
      );

      // Act
      const response = await getEndpointStats(request);
      const data = await response.json();

      // Assert
      expect(data.period_days).toBe(30);
    });

    test('should return 401 if not authenticated', async () => {
      // Arrange
      mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

      const request = new NextRequest('http://localhost:3000/api/usage/endpoints');

      // Act
      const response = await getEndpointStats(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    test('should return empty array if no endpoint data', async () => {
      // Arrange
      mockRequireAuth.mockResolvedValue({
        ecoId: 'eco_usr_new',
        email: 'new@example.com',
      });

      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage/endpoints');

      // Act
      const response = await getEndpointStats(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.endpoints).toEqual([]);
    });
  });

  // ============================================================================
  // GET /api/usage/overage - Overage Summary
  // ============================================================================

  describe('GET /api/usage/overage', () => {
    let mockOverageService: any;

    beforeEach(() => {
      mockOverageService = {
        getOverageSummary: jest.fn(),
      };
      mockCreateOverageService.mockReturnValue(mockOverageService);
    });

    test('should return overage summary for user with overage', async () => {
      // Arrange
      const ecoId = 'eco_usr_pro';
      mockRequireAuth.mockResolvedValue({ ecoId, email: 'pro@example.com' });

      mockOverageService.getOverageSummary.mockResolvedValue({
        hasOverage: true,
        overageCalls: 5000,
        overageCostUsd: 5.0,
        invoiced: false,
        periodEnd: new Date('2025-11-01'),
      });

      const request = new NextRequest('http://localhost:3000/api/usage/overage');

      // Act
      const response = await getOverageSummary(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual({
        has_overage: true,
        overage_calls: 5000,
        overage_cost_usd: 5.0,
        invoiced: false,
        period_end: expect.any(String),
        message: expect.stringContaining('You will be charged $5.00'),
      });
    });

    test('should return no overage for user under limit', async () => {
      // Arrange
      const ecoId = 'eco_usr_under';
      mockRequireAuth.mockResolvedValue({ ecoId, email: 'under@example.com' });

      mockOverageService.getOverageSummary.mockResolvedValue({
        hasOverage: false,
        overageCalls: 0,
        overageCostUsd: 0,
        invoiced: false,
        periodEnd: new Date('2025-11-01'),
      });

      const request = new NextRequest('http://localhost:3000/api/usage/overage');

      // Act
      const response = await getOverageSummary(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual({
        has_overage: false,
        overage_calls: 0,
        overage_cost_usd: 0,
        invoiced: false,
        period_end: expect.any(String),
        message: 'No overage this period.',
      });
    });

    test('should show different message for invoiced overage', async () => {
      // Arrange
      const ecoId = 'eco_usr_invoiced';
      mockRequireAuth.mockResolvedValue({
        ecoId,
        email: 'invoiced@example.com',
      });

      mockOverageService.getOverageSummary.mockResolvedValue({
        hasOverage: true,
        overageCalls: 5000,
        overageCostUsd: 5.0,
        invoiced: true,
        periodEnd: new Date('2025-11-01'),
      });

      const request = new NextRequest('http://localhost:3000/api/usage/overage');

      // Act
      const response = await getOverageSummary(request);
      const data = await response.json();

      // Assert
      expect(data.invoiced).toBe(true);
      expect(data.message).toContain('You have been charged $5.00');
    });

    test('should return 401 if not authenticated', async () => {
      // Arrange
      mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

      const request = new NextRequest('http://localhost:3000/api/usage/overage');

      // Act
      const response = await getOverageSummary(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    test('should handle null period_end gracefully', async () => {
      // Arrange
      const ecoId = 'eco_usr_new';
      mockRequireAuth.mockResolvedValue({ ecoId, email: 'new@example.com' });

      mockOverageService.getOverageSummary.mockResolvedValue({
        hasOverage: false,
        overageCalls: 0,
        overageCostUsd: 0,
        invoiced: false,
        periodEnd: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage/overage');

      // Act
      const response = await getOverageSummary(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.period_end).toBeNull();
    });
  });

  // ============================================================================
  // Error Handling - All Endpoints
  // ============================================================================

  describe('Error Handling - All Endpoints', () => {
    test('GET /api/usage/current should handle database errors', async () => {
      // Arrange
      mockRequireAuth.mockResolvedValue({
        ecoId: 'eco_usr_123',
        email: 'test@example.com',
      });

      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      });

      const request = new NextRequest('http://localhost:3000/api/usage/current');

      // Act
      const response = await getCurrentUsage(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to fetch usage data',
        details: expect.any(String),
      });
    });

    test('GET /api/usage/history should handle database errors', async () => {
      // Arrange
      mockRequireAuth.mockResolvedValue({
        ecoId: 'eco_usr_123',
        email: 'test@example.com',
      });

      mockSupabase.select.mockResolvedValue({
        data: null,
        error: { message: 'Query timeout' },
      });

      const request = new NextRequest('http://localhost:3000/api/usage/history');

      // Act
      const response = await getUsageHistory(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to fetch usage history',
        details: expect.any(String),
      });
    });

    test('GET /api/usage/endpoints should handle database errors', async () => {
      // Arrange
      mockRequireAuth.mockResolvedValue({
        ecoId: 'eco_usr_123',
        email: 'test@example.com',
      });

      mockSupabase.select.mockResolvedValue({
        data: null,
        error: { message: 'Connection lost' },
      });

      const request = new NextRequest('http://localhost:3000/api/usage/endpoints');

      // Act
      const response = await getEndpointStats(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to fetch endpoint statistics',
        details: expect.any(String),
      });
    });

    test('GET /api/usage/overage should handle service errors', async () => {
      // Arrange
      mockRequireAuth.mockResolvedValue({
        ecoId: 'eco_usr_123',
        email: 'test@example.com',
      });

      const mockOverageService = {
        getOverageSummary: jest
          .fn()
          .mockRejectedValue(new Error('Service unavailable')),
      };
      mockCreateOverageService.mockReturnValue(mockOverageService);

      const request = new NextRequest('http://localhost:3000/api/usage/overage');

      // Act
      const response = await getOverageSummary(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to fetch overage summary',
        details: 'Service unavailable',
      });
    });
  });
});
