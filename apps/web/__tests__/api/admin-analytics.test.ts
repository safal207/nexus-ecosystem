/**
 * @jest-environment node
 */

import { GET as getOverview } from '@/app/api/admin/analytics/overview/route';
import { GET as getUsers } from '@/app/api/admin/analytics/users/route';
import { NextRequest } from 'next/server';
import { requireAdminAuth } from '@/app/api/admin/_lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// Mock dependencies
jest.mock('@/app/api/admin/_lib/auth');
jest.mock('@/lib/supabase/admin');

const mockRequireAdminAuth = requireAdminAuth as jest.MockedFunction<
  typeof requireAdminAuth
>;
const mockGetSupabaseAdmin = getSupabaseAdmin as jest.MockedFunction<
  typeof getSupabaseAdmin
>;

describe('Admin Analytics API Tests', () => {
  let mockSupabase: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = process.env;

    // Mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
    };

    mockGetSupabaseAdmin.mockReturnValue(mockSupabase);

    process.env = {
      ...originalEnv,
      ADMIN_ECO_IDS: 'eco_usr_admin1,eco_usr_admin2',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ============================================================================
  // GET /api/admin/analytics/overview - System Overview
  // ============================================================================

  describe('GET /api/admin/analytics/overview', () => {
    test('should return system overview for admin user', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      const mockSubscriptions = [
        { plan: 'free', status: 'active' },
        { plan: 'free', status: 'active' },
        { plan: 'pro', status: 'active' },
        { plan: 'pro', status: 'active' },
        { plan: 'pro', status: 'active' },
        { plan: 'enterprise', status: 'active' },
      ];

      const mockUsageRecords = [
        { api_calls: 50000, overage_cost: 0 },
        { api_calls: 105000, overage_cost: 500 },
        { api_calls: 110000, overage_cost: 1000 },
      ];

      const mockTopUsers = [
        {
          eco_id: 'eco_usr_top1',
          api_calls: 110000,
          subscription: { plan: 'pro' },
        },
        {
          eco_id: 'eco_usr_top2',
          api_calls: 105000,
          subscription: { plan: 'pro' },
        },
      ];

      mockSupabase.select
        .mockResolvedValueOnce({ data: mockSubscriptions, error: null }) // subscriptions
        .mockResolvedValueOnce({ data: mockUsageRecords, error: null }) // usage records
        .mockResolvedValueOnce({ data: mockTopUsers, error: null }); // top users

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/overview'
      );

      // Act
      const response = await getOverview(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual({
        total_users: 6,
        users_by_plan: {
          free: 2,
          pro: 3,
          enterprise: 1,
        },
        total_api_calls_this_month: 265000, // 50k + 105k + 110k
        mrr: 2647, // 3 Pro × $49 + 1 Enterprise × $500
        mrr_usd: '$2,647',
        overage_revenue_this_month: 15.0, // (500 + 1000) / 100
        overage_revenue_usd: '$15.00',
        total_revenue_this_month: 2662.0,
        total_revenue_usd: '$2,662.00',
        top_users_by_usage: [
          { eco_id: 'eco_usr_top1', api_calls: 110000, plan: 'pro' },
          { eco_id: 'eco_usr_top2', api_calls: 105000, plan: 'pro' },
        ],
        timestamp: expect.any(String),
      });
    });

    test('should return 403 if not admin', async () => {
      // Arrange
      mockRequireAdminAuth.mockRejectedValue(new Error('Forbidden'));

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/overview'
      );

      // Act
      const response = await getOverview(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(403);
      expect(data).toEqual({ error: 'Forbidden' });
    });

    test('should handle system with no users', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      mockSupabase.select
        .mockResolvedValueOnce({ data: [], error: null }) // no subscriptions
        .mockResolvedValueOnce({ data: [], error: null }) // no usage
        .mockResolvedValueOnce({ data: [], error: null }); // no top users

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/overview'
      );

      // Act
      const response = await getOverview(request);
      const data = await response.json();

      // Assert
      expect(data).toEqual({
        total_users: 0,
        users_by_plan: {
          free: 0,
          pro: 0,
          enterprise: 0,
        },
        total_api_calls_this_month: 0,
        mrr: 0,
        mrr_usd: '$0',
        overage_revenue_this_month: 0,
        overage_revenue_usd: '$0.00',
        total_revenue_this_month: 0,
        total_revenue_usd: '$0.00',
        top_users_by_usage: [],
        timestamp: expect.any(String),
      });
    });

    test('should calculate MRR correctly for different plans', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      const testCases = [
        {
          subscriptions: [
            { plan: 'free', status: 'active' },
            { plan: 'free', status: 'active' },
          ],
          expectedMrr: 0,
        },
        {
          subscriptions: [
            { plan: 'pro', status: 'active' },
            { plan: 'pro', status: 'active' },
          ],
          expectedMrr: 98, // 2 × $49
        },
        {
          subscriptions: [{ plan: 'enterprise', status: 'active' }],
          expectedMrr: 500,
        },
        {
          subscriptions: [
            { plan: 'free', status: 'active' },
            { plan: 'pro', status: 'active' },
            { plan: 'enterprise', status: 'active' },
          ],
          expectedMrr: 549, // 0 + 49 + 500
        },
      ];

      for (const { subscriptions, expectedMrr } of testCases) {
        mockSupabase.select
          .mockResolvedValueOnce({ data: subscriptions, error: null })
          .mockResolvedValueOnce({ data: [], error: null })
          .mockResolvedValueOnce({ data: [], error: null });

        const request = new NextRequest(
          'http://localhost:3000/api/admin/analytics/overview'
        );

        const response = await getOverview(request);
        const data = await response.json();

        expect(data.mrr).toBe(expectedMrr);
      }
    });

    test('should handle database errors gracefully', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      mockSupabase.select.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/overview'
      );

      // Act
      const response = await getOverview(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to fetch overview',
        details: expect.any(String),
      });
    });

    test('should format large numbers correctly', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      const mockSubs = Array.from({ length: 100 }, () => ({
        plan: 'pro',
        status: 'active',
      }));

      mockSupabase.select
        .mockResolvedValueOnce({ data: mockSubs, error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/overview'
      );

      // Act
      const response = await getOverview(request);
      const data = await response.json();

      // Assert
      expect(data.mrr).toBe(4900); // 100 × $49
      expect(data.mrr_usd).toBe('$4,900'); // Formatted with comma
    });
  });

  // ============================================================================
  // GET /api/admin/analytics/users - User List
  // ============================================================================

  describe('GET /api/admin/analytics/users', () => {
    test('should return paginated user list', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      const mockUsers = [
        {
          eco_id: 'eco_usr_1',
          plan: 'pro',
          status: 'active',
          created_at: '2025-10-01T00:00:00Z',
          identity: { email: 'user1@example.com' },
          usage: [
            {
              api_calls: 105000,
              overage_calls: 5000,
              overage_cost: 500,
              billing_period_start: '2025-10-01T00:00:00Z',
            },
          ],
        },
        {
          eco_id: 'eco_usr_2',
          plan: 'free',
          status: 'active',
          created_at: '2025-10-02T00:00:00Z',
          identity: { email: 'user2@example.com' },
          usage: [
            {
              api_calls: 800,
              overage_calls: 0,
              overage_cost: 0,
              billing_period_start: '2025-10-01T00:00:00Z',
            },
          ],
        },
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockUsers,
        error: null,
        count: 2,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/users'
      );

      // Act
      const response = await getUsers(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.users).toHaveLength(2);
      expect(data.users[0]).toEqual({
        eco_id: 'eco_usr_1',
        email: 'user1@example.com',
        plan: 'pro',
        status: 'active',
        api_calls: 105000,
        overage_calls: 5000,
        overage_cost_usd: 5.0,
        subscription_revenue: 49,
        total_revenue: 54.0,
        created_at: '2025-10-01T00:00:00Z',
        last_api_call: null,
      });
      expect(data.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 2,
        total_pages: 1,
      });
    });

    test('should accept pagination parameters', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null,
        count: 100,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/users?page=2&limit=20'
      );

      // Act
      const response = await getUsers(request);
      const data = await response.json();

      // Assert
      expect(data.pagination).toEqual({
        page: 2,
        limit: 20,
        total: 100,
        total_pages: 5,
      });
      expect(mockSupabase.range).toHaveBeenCalledWith(20, 39); // page 2, limit 20
    });

    test('should filter by plan', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/users?plan=pro'
      );

      // Act
      await getUsers(request);

      // Assert
      expect(mockSupabase.eq).toHaveBeenCalledWith('plan', 'pro');
    });

    test('should sort by usage (default)', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      const mockUsers = [
        {
          eco_id: 'eco_usr_high',
          plan: 'pro',
          status: 'active',
          created_at: '2025-10-01T00:00:00Z',
          identity: { email: 'high@example.com' },
          usage: [{ api_calls: 110000, overage_calls: 10000, overage_cost: 1000 }],
        },
        {
          eco_id: 'eco_usr_low',
          plan: 'pro',
          status: 'active',
          created_at: '2025-10-01T00:00:00Z',
          identity: { email: 'low@example.com' },
          usage: [{ api_calls: 50000, overage_calls: 0, overage_cost: 0 }],
        },
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockUsers,
        error: null,
        count: 2,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/users'
      );

      // Act
      const response = await getUsers(request);
      const data = await response.json();

      // Assert - Should be sorted by api_calls DESC
      expect(data.users[0].eco_id).toBe('eco_usr_high');
      expect(data.users[1].eco_id).toBe('eco_usr_low');
    });

    test('should sort by overage', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      const mockUsers = [
        {
          eco_id: 'eco_usr_high_overage',
          plan: 'pro',
          status: 'active',
          created_at: '2025-10-01T00:00:00Z',
          identity: { email: 'high@example.com' },
          usage: [
            {
              api_calls: 110000,
              overage_calls: 10000,
              overage_cost: 1000,
              billing_period_start: '2025-10-01T00:00:00Z',
            },
          ],
        },
        {
          eco_id: 'eco_usr_low_overage',
          plan: 'pro',
          status: 'active',
          created_at: '2025-10-01T00:00:00Z',
          identity: { email: 'low@example.com' },
          usage: [
            {
              api_calls: 105000,
              overage_calls: 5000,
              overage_cost: 500,
              billing_period_start: '2025-10-01T00:00:00Z',
            },
          ],
        },
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockUsers,
        error: null,
        count: 2,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/users?sort=overage'
      );

      // Act
      const response = await getUsers(request);
      const data = await response.json();

      // Assert - Should be sorted by overage_calls DESC
      expect(data.users[0].eco_id).toBe('eco_usr_high_overage');
      expect(data.users[0].overage_calls).toBe(10000);
    });

    test('should sort by revenue', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      const mockUsers = [
        {
          eco_id: 'eco_usr_ent',
          plan: 'enterprise',
          status: 'active',
          created_at: '2025-10-01T00:00:00Z',
          identity: { email: 'ent@example.com' },
          usage: [
            {
              api_calls: 200000,
              overage_calls: 0,
              overage_cost: 0,
              billing_period_start: '2025-10-01T00:00:00Z',
            },
          ],
        },
        {
          eco_id: 'eco_usr_pro',
          plan: 'pro',
          status: 'active',
          created_at: '2025-10-01T00:00:00Z',
          identity: { email: 'pro@example.com' },
          usage: [
            {
              api_calls: 105000,
              overage_calls: 5000,
              overage_cost: 500,
              billing_period_start: '2025-10-01T00:00:00Z',
            },
          ],
        },
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockUsers,
        error: null,
        count: 2,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/users?sort=revenue'
      );

      // Act
      const response = await getUsers(request);
      const data = await response.json();

      // Assert - Enterprise ($500) should be first
      expect(data.users[0].eco_id).toBe('eco_usr_ent');
      expect(data.users[0].total_revenue).toBe(500);
    });

    test('should sort by created date', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      const mockUsers = [
        {
          eco_id: 'eco_usr_new',
          plan: 'free',
          status: 'active',
          created_at: '2025-10-15T00:00:00Z',
          identity: { email: 'new@example.com' },
          usage: [],
        },
        {
          eco_id: 'eco_usr_old',
          plan: 'free',
          status: 'active',
          created_at: '2025-10-01T00:00:00Z',
          identity: { email: 'old@example.com' },
          usage: [],
        },
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockUsers,
        error: null,
        count: 2,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/users?sort=created'
      );

      // Act
      const response = await getUsers(request);
      const data = await response.json();

      // Assert - Newest first
      expect(data.users[0].eco_id).toBe('eco_usr_new');
    });

    test('should limit pagination to max 100', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/users?limit=500'
      );

      // Act
      const response = await getUsers(request);
      const data = await response.json();

      // Assert
      expect(data.pagination.limit).toBe(100); // Capped
    });

    test('should return 403 if not admin', async () => {
      // Arrange
      mockRequireAdminAuth.mockRejectedValue(new Error('Forbidden'));

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/users'
      );

      // Act
      const response = await getUsers(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(403);
      expect(data).toEqual({ error: 'Forbidden' });
    });

    test('should handle users with no usage data', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      const mockUsers = [
        {
          eco_id: 'eco_usr_new',
          plan: 'free',
          status: 'active',
          created_at: '2025-10-15T00:00:00Z',
          identity: { email: 'new@example.com' },
          usage: [], // No usage yet
        },
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockUsers,
        error: null,
        count: 1,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/users'
      );

      // Act
      const response = await getUsers(request);
      const data = await response.json();

      // Assert
      expect(data.users[0]).toEqual({
        eco_id: 'eco_usr_new',
        email: 'new@example.com',
        plan: 'free',
        status: 'active',
        api_calls: 0, // Defaults to 0
        overage_calls: 0,
        overage_cost_usd: 0,
        subscription_revenue: 0,
        total_revenue: 0,
        created_at: '2025-10-15T00:00:00Z',
        last_api_call: null,
      });
    });

    test('should calculate revenue correctly for each plan', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      const mockUsers = [
        {
          eco_id: 'eco_usr_free',
          plan: 'free',
          status: 'active',
          created_at: '2025-10-01T00:00:00Z',
          identity: { email: 'free@example.com' },
          usage: [
            {
              api_calls: 500,
              overage_calls: 0,
              overage_cost: 0,
              billing_period_start: '2025-10-01T00:00:00Z',
            },
          ],
        },
        {
          eco_id: 'eco_usr_pro',
          plan: 'pro',
          status: 'active',
          created_at: '2025-10-01T00:00:00Z',
          identity: { email: 'pro@example.com' },
          usage: [
            {
              api_calls: 105000,
              overage_calls: 5000,
              overage_cost: 500,
              billing_period_start: '2025-10-01T00:00:00Z',
            },
          ],
        },
        {
          eco_id: 'eco_usr_ent',
          plan: 'enterprise',
          status: 'active',
          created_at: '2025-10-01T00:00:00Z',
          identity: { email: 'ent@example.com' },
          usage: [
            {
              api_calls: 500000,
              overage_calls: 0,
              overage_cost: 0,
              billing_period_start: '2025-10-01T00:00:00Z',
            },
          ],
        },
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockUsers,
        error: null,
        count: 3,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/users'
      );

      // Act
      const response = await getUsers(request);
      const data = await response.json();

      // Assert
      expect(data.users[0].subscription_revenue).toBe(0); // Free
      expect(data.users[1].subscription_revenue).toBe(49); // Pro
      expect(data.users[1].total_revenue).toBe(54); // Pro + overage
      expect(data.users[2].subscription_revenue).toBe(500); // Enterprise
    });

    test('should handle database errors', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      mockSupabase.select.mockResolvedValue({
        data: null,
        error: { message: 'Connection lost' },
      });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/users'
      );

      // Act
      const response = await getUsers(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to fetch user list',
        details: expect.any(String),
      });
    });
  });

  // ============================================================================
  // Edge Cases - Both Endpoints
  // ============================================================================

  describe('Edge Cases', () => {
    test('Overview should handle missing email in identity', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      mockSupabase.select
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({
          data: [
            {
              eco_id: 'eco_usr_no_email',
              api_calls: 1000,
              subscription: null, // No subscription data
            },
          ],
          error: null,
        });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/overview'
      );

      // Act
      const response = await getOverview(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.top_users_by_usage[0].plan).toBe('unknown');
    });

    test('User list should handle missing identity', async () => {
      // Arrange
      mockRequireAdminAuth.mockResolvedValue({
        ecoId: 'eco_usr_admin1',
        email: 'admin@example.com',
      });

      const mockUsers = [
        {
          eco_id: 'eco_usr_orphan',
          plan: 'free',
          status: 'active',
          created_at: '2025-10-01T00:00:00Z',
          identity: null, // Missing identity
          usage: [],
        },
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockUsers,
        error: null,
        count: 1,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/admin/analytics/users'
      );

      // Act
      const response = await getUsers(request);
      const data = await response.json();

      // Assert
      expect(data.users[0].email).toBe('unknown');
    });
  });
});
