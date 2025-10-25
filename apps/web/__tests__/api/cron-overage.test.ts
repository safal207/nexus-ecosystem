/**
 * @jest-environment node
 */

import { POST } from '@/app/api/cron/process-overage/route';
import { NextRequest } from 'next/server';
import { createOverageService } from '@repo/billing';

// Mock dependencies
jest.mock('@repo/billing');
jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));
jest.mock('@/lib/stripe-server', () => ({
  getStripeServer: jest.fn(() => ({})),
}));

const mockCreateOverageService = createOverageService as jest.MockedFunction<
  typeof createOverageService
>;

describe('POST /api/cron/process-overage', () => {
  let mockOverageService: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = process.env;

    // Mock OverageService
    mockOverageService = {
      processMonthlyOverage: jest.fn(),
    };

    mockCreateOverageService.mockReturnValue(mockOverageService);

    // Set default env
    process.env = {
      ...originalEnv,
      CRON_SECRET: 'test-cron-secret-123',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ============================================================================
  // Authentication Tests
  // ============================================================================

  describe('Authentication', () => {
    test('should return 401 if no authorization header', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
      expect(mockOverageService.processMonthlyOverage).not.toHaveBeenCalled();
    });

    test('should return 401 if authorization header is invalid', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer wrong-secret',
        },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
      expect(mockOverageService.processMonthlyOverage).not.toHaveBeenCalled();
    });

    test('should return 401 if authorization format is wrong', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Basic test-cron-secret-123', // Wrong format
        },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    test('should return 500 if CRON_SECRET not configured', async () => {
      // Arrange
      delete process.env.CRON_SECRET;

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'CRON_SECRET not configured' });
      expect(mockOverageService.processMonthlyOverage).not.toHaveBeenCalled();
    });

    test('should accept request with valid CRON_SECRET', async () => {
      // Arrange
      mockOverageService.processMonthlyOverage.mockResolvedValue({
        processed: 0,
        charged: 0,
        totalCents: 0,
        errors: [],
      });

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(mockOverageService.processMonthlyOverage).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Success Cases
  // ============================================================================

  describe('Success Cases', () => {
    test('should process overage and return summary (no users)', async () => {
      // Arrange
      mockOverageService.processMonthlyOverage.mockResolvedValue({
        processed: 0,
        charged: 0,
        totalCents: 0,
        errors: [],
      });

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        results: {
          processed: 0,
          charged: 0,
          total_usd: '0.00',
          errors: [],
        },
        duration_ms: expect.any(Number),
        timestamp: expect.any(String),
      });
    });

    test('should process overage and return summary (multiple users)', async () => {
      // Arrange
      mockOverageService.processMonthlyOverage.mockResolvedValue({
        processed: 5,
        charged: 3,
        totalCents: 1250, // $12.50
        errors: [],
      });

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        results: {
          processed: 5,
          charged: 3,
          total_usd: '12.50',
          errors: [],
        },
        duration_ms: expect.any(Number),
        timestamp: expect.any(String),
      });
      expect(data.duration_ms).toBeGreaterThan(0);
    });

    test('should handle partial success (some errors)', async () => {
      // Arrange
      mockOverageService.processMonthlyOverage.mockResolvedValue({
        processed: 10,
        charged: 8,
        totalCents: 4500, // $45.00
        errors: [
          {
            ecoId: 'eco_usr_error1',
            error: 'No Stripe subscription found',
          },
          {
            ecoId: 'eco_usr_error2',
            error: 'Payment method expired',
          },
        ],
      });

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results).toEqual({
        processed: 10,
        charged: 8,
        total_usd: '45.00',
        errors: [
          {
            ecoId: 'eco_usr_error1',
            error: 'No Stripe subscription found',
          },
          {
            ecoId: 'eco_usr_error2',
            error: 'Payment method expired',
          },
        ],
      });
    });

    test('should calculate total_usd correctly for cents', async () => {
      // Arrange
      const testCases = [
        { cents: 0, expected: '0.00' },
        { cents: 1, expected: '0.01' },
        { cents: 50, expected: '0.50' },
        { cents: 100, expected: '1.00' },
        { cents: 1234, expected: '12.34' },
        { cents: 10050, expected: '100.50' },
      ];

      for (const { cents, expected } of testCases) {
        mockOverageService.processMonthlyOverage.mockResolvedValue({
          processed: 1,
          charged: 1,
          totalCents: cents,
          errors: [],
        });

        const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-cron-secret-123',
          },
        });

        // Act
        const response = await POST(request);
        const data = await response.json();

        // Assert
        expect(data.results.total_usd).toBe(expected);
      }
    });

    test('should return valid ISO timestamp', async () => {
      // Arrange
      mockOverageService.processMonthlyOverage.mockResolvedValue({
        processed: 0,
        charged: 0,
        totalCents: 0,
        errors: [],
      });

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(() => new Date(data.timestamp)).not.toThrow();
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    test('should return 500 if processMonthlyOverage throws error', async () => {
      // Arrange
      mockOverageService.processMonthlyOverage.mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toEqual({
        success: false,
        error: 'Database connection failed',
        timestamp: expect.any(String),
      });
    });

    test('should handle non-Error objects thrown', async () => {
      // Arrange
      mockOverageService.processMonthlyOverage.mockRejectedValue(
        'Something went wrong' // String instead of Error
      );

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toEqual({
        success: false,
        error: 'Something went wrong',
        timestamp: expect.any(String),
      });
    });

    test('should log errors to console', async () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockOverageService.processMonthlyOverage.mockRejectedValue(
        new Error('Test error')
      );

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      await POST(request);

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Cron] Overage processing failed:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ============================================================================
  // Logging Tests
  // ============================================================================

  describe('Logging', () => {
    test('should log start of processing', async () => {
      // Arrange
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      mockOverageService.processMonthlyOverage.mockResolvedValue({
        processed: 0,
        charged: 0,
        totalCents: 0,
        errors: [],
      });

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      await POST(request);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Cron] Starting overage processing...'
      );

      consoleLogSpy.mockRestore();
    });

    test('should log completion with duration', async () => {
      // Arrange
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      mockOverageService.processMonthlyOverage.mockResolvedValue({
        processed: 5,
        charged: 3,
        totalCents: 1500,
        errors: [],
      });

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      await POST(request);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[Cron\] Completed in \d+ms/)
      );

      consoleLogSpy.mockRestore();
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    test('should complete quickly for no users', async () => {
      // Arrange
      mockOverageService.processMonthlyOverage.mockResolvedValue({
        processed: 0,
        charged: 0,
        totalCents: 0,
        errors: [],
      });

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      const startTime = Date.now();
      const response = await POST(request);
      const duration = Date.now() - startTime;
      const data = await response.json();

      // Assert
      expect(duration).toBeLessThan(100); // Should be very fast
      expect(data.duration_ms).toBeLessThan(100);
    });

    test('should track accurate duration for processing', async () => {
      // Arrange
      mockOverageService.processMonthlyOverage.mockImplementation(async () => {
        // Simulate processing delay
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          processed: 10,
          charged: 10,
          totalCents: 5000,
          errors: [],
        };
      });

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(data.duration_ms).toBeGreaterThanOrEqual(50);
      expect(data.duration_ms).toBeLessThan(200); // Reasonable upper bound
    });
  });

  // ============================================================================
  // Idempotency Tests
  // ============================================================================

  describe('Idempotency', () => {
    test('should be safe to call multiple times (service handles idempotency)', async () => {
      // Arrange
      mockOverageService.processMonthlyOverage
        .mockResolvedValueOnce({
          processed: 5,
          charged: 5,
          totalCents: 2500,
          errors: [],
        })
        .mockResolvedValueOnce({
          processed: 0, // Second call finds no new records
          charged: 0,
          totalCents: 0,
          errors: [],
        });

      const request1 = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      const request2 = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      const response1 = await POST(request1);
      const data1 = await response1.json();

      const response2 = await POST(request2);
      const data2 = await response2.json();

      // Assert
      expect(data1.results.charged).toBe(5);
      expect(data2.results.charged).toBe(0); // No new charges
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    test('should handle all users processed but none charged', async () => {
      // Arrange
      mockOverageService.processMonthlyOverage.mockResolvedValue({
        processed: 10,
        charged: 0, // All already invoiced
        totalCents: 0,
        errors: [],
      });

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(data.results).toEqual({
        processed: 10,
        charged: 0,
        total_usd: '0.00',
        errors: [],
      });
    });

    test('should handle large number of errors', async () => {
      // Arrange
      const errors = Array.from({ length: 50 }, (_, i) => ({
        ecoId: `eco_usr_error${i}`,
        error: `Error ${i}`,
      }));

      mockOverageService.processMonthlyOverage.mockResolvedValue({
        processed: 50,
        charged: 0,
        totalCents: 0,
        errors,
      });

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(data.results.errors).toHaveLength(50);
      expect(data.results.processed).toBe(50);
      expect(data.results.charged).toBe(0);
    });

    test('should handle very large total amounts', async () => {
      // Arrange
      mockOverageService.processMonthlyOverage.mockResolvedValue({
        processed: 100,
        charged: 100,
        totalCents: 1000000, // $10,000
        errors: [],
      });

      const request = new NextRequest('http://localhost:3000/api/cron/process-overage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-123',
        },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(data.results.total_usd).toBe('10000.00');
      expect(data.results.charged).toBe(100);
    });
  });
});
