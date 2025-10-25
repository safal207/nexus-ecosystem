/**
 * @jest-environment node
 */

import { UsageTracker } from '../usage-tracker';
import type { IUsageRepository } from '../repository';
import type { UsageRecord } from '../types';

// Mock repository
const createMockRepository = (): jest.Mocked<IUsageRepository> => ({
  batchInsert: jest.fn().mockResolvedValue(undefined),
  getCurrentUsage: jest.fn(),
  hasExceededLimit: jest.fn(),
  getHistory: jest.fn(),
  getEndpointStats: jest.fn(),
});

// Helper to wait for async operations
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('UsageTracker', () => {
  let mockRepository: jest.Mocked<IUsageRepository>;
  let tracker: UsageTracker;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockRepository = createMockRepository();
    tracker = new UsageTracker(mockRepository);
  });

  afterEach(async () => {
    await tracker.shutdown();
    jest.useRealTimers();
  });

  // ============================================================================
  // track() - Basic Functionality
  // ============================================================================

  describe('track() - Basic Functionality', () => {
    test('should queue a single usage record', async () => {
      // Arrange
      const record: UsageRecord = {
        eco_id: 'eco_usr_123',
        endpoint: '/api/test',
        method: 'GET',
        timestamp: new Date(),
        response_time_ms: 100,
        status_code: 200,
      };

      // Act
      await tracker.track(record);

      // Assert - Should not flush immediately (batching)
      expect(mockRepository.batchInsert).not.toHaveBeenCalled();
    });

    test('should queue multiple records without immediate flush', async () => {
      // Arrange
      const records: UsageRecord[] = [
        {
          eco_id: 'eco_usr_1',
          endpoint: '/api/test1',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        },
        {
          eco_id: 'eco_usr_2',
          endpoint: '/api/test2',
          method: 'POST',
          timestamp: new Date(),
          response_time_ms: 150,
          status_code: 201,
        },
      ];

      // Act
      for (const record of records) {
        await tracker.track(record);
      }

      // Assert - Should batch, not flush yet
      expect(mockRepository.batchInsert).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Batch Flushing - Count-Based (100 records)
  // ============================================================================

  describe('Batch Flushing - Count-Based', () => {
    test('should flush when queue reaches 100 records', async () => {
      // Arrange
      const records: UsageRecord[] = [];
      for (let i = 0; i < 100; i++) {
        records.push({
          eco_id: `eco_usr_${i}`,
          endpoint: '/api/test',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      // Act
      for (const record of records) {
        await tracker.track(record);
      }

      // Wait for async flush
      await wait(10);

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);
      expect(mockRepository.batchInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ eco_id: 'eco_usr_0' }),
          expect.objectContaining({ eco_id: 'eco_usr_99' }),
        ])
      );
    });

    test('should flush multiple batches of 100 records', async () => {
      // Arrange - 250 records = 2 full batches + 50 remaining
      const records: UsageRecord[] = [];
      for (let i = 0; i < 250; i++) {
        records.push({
          eco_id: `eco_usr_${i}`,
          endpoint: '/api/test',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      // Act
      for (const record of records) {
        await tracker.track(record);
      }

      // Wait for async flushes
      await wait(20);

      // Assert - Should flush 2 times (100 + 100), 50 remaining
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(2);

      const firstBatch = (mockRepository.batchInsert as jest.Mock).mock.calls[0][0];
      const secondBatch = (mockRepository.batchInsert as jest.Mock).mock.calls[1][0];

      expect(firstBatch).toHaveLength(100);
      expect(secondBatch).toHaveLength(100);
    });

    test('should handle exactly 100 records', async () => {
      // Arrange
      const records: UsageRecord[] = [];
      for (let i = 0; i < 100; i++) {
        records.push({
          eco_id: `eco_usr_${i}`,
          endpoint: '/api/test',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      // Act
      for (const record of records) {
        await tracker.track(record);
      }

      await wait(10);

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);
      expect((mockRepository.batchInsert as jest.Mock).mock.calls[0][0]).toHaveLength(100);
    });
  });

  // ============================================================================
  // Batch Flushing - Time-Based (5 seconds)
  // ============================================================================

  describe('Batch Flushing - Time-Based', () => {
    test('should flush after 5 seconds even with < 100 records', async () => {
      // Arrange
      const records: UsageRecord[] = [];
      for (let i = 0; i < 50; i++) {
        records.push({
          eco_id: `eco_usr_${i}`,
          endpoint: '/api/test',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      // Act
      for (const record of records) {
        await tracker.track(record);
      }

      // Should not flush immediately
      expect(mockRepository.batchInsert).not.toHaveBeenCalled();

      // Advance time by 5 seconds
      jest.advanceTimersByTime(5000);
      await wait(10);

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);
      expect((mockRepository.batchInsert as jest.Mock).mock.calls[0][0]).toHaveLength(50);
    });

    test('should flush after 5 seconds with only 1 record', async () => {
      // Arrange
      const record: UsageRecord = {
        eco_id: 'eco_usr_single',
        endpoint: '/api/test',
        method: 'GET',
        timestamp: new Date(),
        response_time_ms: 100,
        status_code: 200,
      };

      // Act
      await tracker.track(record);

      // Should not flush immediately
      expect(mockRepository.batchInsert).not.toHaveBeenCalled();

      // Advance time by 5 seconds
      jest.advanceTimersByTime(5000);
      await wait(10);

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);
      expect((mockRepository.batchInsert as jest.Mock).mock.calls[0][0]).toHaveLength(1);
    });

    test('should reset timer after count-based flush', async () => {
      // Arrange
      const firstBatch: UsageRecord[] = [];
      for (let i = 0; i < 100; i++) {
        firstBatch.push({
          eco_id: `eco_usr_batch1_${i}`,
          endpoint: '/api/test',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      // Act - First batch (count-based flush)
      for (const record of firstBatch) {
        await tracker.track(record);
      }
      await wait(10);

      // Assert first flush
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);

      // Add a few more records
      await tracker.track({
        eco_id: 'eco_usr_after',
        endpoint: '/api/test',
        method: 'GET',
        timestamp: new Date(),
        response_time_ms: 100,
        status_code: 200,
      });

      // Advance time by 5 seconds
      jest.advanceTimersByTime(5000);
      await wait(10);

      // Assert second flush (time-based)
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================================
  // flush() - Manual Flushing
  // ============================================================================

  describe('flush() - Manual Flushing', () => {
    test('should manually flush pending records', async () => {
      // Arrange
      const records: UsageRecord[] = [];
      for (let i = 0; i < 30; i++) {
        records.push({
          eco_id: `eco_usr_${i}`,
          endpoint: '/api/test',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      for (const record of records) {
        await tracker.track(record);
      }

      // Act - Manual flush
      await tracker.flush();

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);
      expect((mockRepository.batchInsert as jest.Mock).mock.calls[0][0]).toHaveLength(30);
    });

    test('should not flush if queue is empty', async () => {
      // Act
      await tracker.flush();

      // Assert
      expect(mockRepository.batchInsert).not.toHaveBeenCalled();
    });

    test('should clear queue after manual flush', async () => {
      // Arrange
      await tracker.track({
        eco_id: 'eco_usr_test',
        endpoint: '/api/test',
        method: 'GET',
        timestamp: new Date(),
        response_time_ms: 100,
        status_code: 200,
      });

      // Act - Manual flush
      await tracker.flush();

      // Second flush should do nothing (queue empty)
      await tracker.flush();

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // shutdown() - Graceful Shutdown
  // ============================================================================

  describe('shutdown() - Graceful Shutdown', () => {
    test('should flush all pending records on shutdown', async () => {
      // Arrange
      const records: UsageRecord[] = [];
      for (let i = 0; i < 50; i++) {
        records.push({
          eco_id: `eco_usr_${i}`,
          endpoint: '/api/test',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      for (const record of records) {
        await tracker.track(record);
      }

      // Act
      await tracker.shutdown();

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);
      expect((mockRepository.batchInsert as jest.Mock).mock.calls[0][0]).toHaveLength(50);
    });

    test('should stop timer on shutdown', async () => {
      // Arrange
      await tracker.track({
        eco_id: 'eco_usr_test',
        endpoint: '/api/test',
        method: 'GET',
        timestamp: new Date(),
        response_time_ms: 100,
        status_code: 200,
      });

      // Act
      await tracker.shutdown();

      // Advance time - should NOT trigger flush (timer stopped)
      jest.advanceTimersByTime(5000);
      await wait(10);

      // Assert - Only 1 flush from shutdown, not from timer
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    test('should continue queueing if flush fails', async () => {
      // Arrange
      mockRepository.batchInsert.mockRejectedValueOnce(
        new Error('Database error')
      );

      const records: UsageRecord[] = [];
      for (let i = 0; i < 100; i++) {
        records.push({
          eco_id: `eco_usr_${i}`,
          endpoint: '/api/test',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      // Act - Should trigger flush (100 records)
      for (const record of records) {
        await tracker.track(record);
      }
      await wait(10);

      // Assert - Flush attempted despite error
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);

      // Add another record - tracker should still work
      await tracker.track({
        eco_id: 'eco_usr_after_error',
        endpoint: '/api/test',
        method: 'GET',
        timestamp: new Date(),
        response_time_ms: 100,
        status_code: 200,
      });

      // Should not throw
      expect(async () => {
        await tracker.flush();
      }).not.toThrow();
    });

    test('should log error if flush fails', async () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockRepository.batchInsert.mockRejectedValueOnce(
        new Error('Database error')
      );

      const records: UsageRecord[] = [];
      for (let i = 0; i < 100; i++) {
        records.push({
          eco_id: `eco_usr_${i}`,
          endpoint: '/api/test',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      // Act
      for (const record of records) {
        await tracker.track(record);
      }
      await wait(10);

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UsageTracker] Flush error:'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ============================================================================
  // getCurrentUsage() - Passthrough
  // ============================================================================

  describe('getCurrentUsage()', () => {
    test('should call repository getCurrentUsage', async () => {
      // Arrange
      const ecoId = 'eco_usr_123';
      const mockUsage = {
        apiCalls: 5000,
        limit: 100000,
        overageCalls: 0,
        periodStart: new Date('2025-10-01'),
        periodEnd: new Date('2025-11-01'),
      };

      mockRepository.getCurrentUsage.mockResolvedValue(mockUsage);

      // Act
      const result = await tracker.getCurrentUsage(ecoId);

      // Assert
      expect(result).toEqual(mockUsage);
      expect(mockRepository.getCurrentUsage).toHaveBeenCalledWith(ecoId);
    });
  });

  // ============================================================================
  // hasExceededLimit() - Passthrough
  // ============================================================================

  describe('hasExceededLimit()', () => {
    test('should call repository hasExceededLimit', async () => {
      // Arrange
      const ecoId = 'eco_usr_123';
      mockRepository.hasExceededLimit.mockResolvedValue(true);

      // Act
      const result = await tracker.hasExceededLimit(ecoId);

      // Assert
      expect(result).toBe(true);
      expect(mockRepository.hasExceededLimit).toHaveBeenCalledWith(ecoId);
    });

    test('should return false if not exceeded', async () => {
      // Arrange
      const ecoId = 'eco_usr_under_limit';
      mockRepository.hasExceededLimit.mockResolvedValue(false);

      // Act
      const result = await tracker.hasExceededLimit(ecoId);

      // Assert
      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // Concurrent Operations
  // ============================================================================

  describe('Concurrent Operations', () => {
    test('should handle concurrent track() calls', async () => {
      // Arrange
      const promises: Promise<void>[] = [];

      // Act - Track 50 records concurrently
      for (let i = 0; i < 50; i++) {
        promises.push(
          tracker.track({
            eco_id: `eco_usr_${i}`,
            endpoint: '/api/test',
            method: 'GET',
            timestamp: new Date(),
            response_time_ms: 100,
            status_code: 200,
          })
        );
      }

      await Promise.all(promises);

      // Manual flush to check all records queued
      await tracker.flush();

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);
      expect((mockRepository.batchInsert as jest.Mock).mock.calls[0][0]).toHaveLength(50);
    });

    test('should handle concurrent flush() calls', async () => {
      // Arrange
      for (let i = 0; i < 30; i++) {
        await tracker.track({
          eco_id: `eco_usr_${i}`,
          endpoint: '/api/test',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      // Act - Multiple concurrent flush calls
      await Promise.all([tracker.flush(), tracker.flush(), tracker.flush()]);

      // Assert - Should only flush once (queue cleared after first flush)
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    test('should handle exactly 99 records (no auto-flush)', async () => {
      // Arrange
      const records: UsageRecord[] = [];
      for (let i = 0; i < 99; i++) {
        records.push({
          eco_id: `eco_usr_${i}`,
          endpoint: '/api/test',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      // Act
      for (const record of records) {
        await tracker.track(record);
      }
      await wait(10);

      // Assert - Should NOT auto-flush (need 100)
      expect(mockRepository.batchInsert).not.toHaveBeenCalled();

      // Manual flush should work
      await tracker.flush();
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);
      expect((mockRepository.batchInsert as jest.Mock).mock.calls[0][0]).toHaveLength(99);
    });

    test('should handle exactly 101 records (1 flush + 1 remaining)', async () => {
      // Arrange
      const records: UsageRecord[] = [];
      for (let i = 0; i < 101; i++) {
        records.push({
          eco_id: `eco_usr_${i}`,
          endpoint: '/api/test',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      // Act
      for (const record of records) {
        await tracker.track(record);
      }
      await wait(10);

      // Assert - Should flush 100, 1 remaining
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(1);
      expect((mockRepository.batchInsert as jest.Mock).mock.calls[0][0]).toHaveLength(100);

      // Flush remaining
      await tracker.flush();
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(2);
      expect((mockRepository.batchInsert as jest.Mock).mock.calls[1][0]).toHaveLength(1);
    });

    test('should handle records with optional fields', async () => {
      // Arrange
      const record: UsageRecord = {
        eco_id: 'eco_usr_123',
        endpoint: '/api/test',
        method: 'GET',
        timestamp: new Date(),
        response_time_ms: 100,
        status_code: 200,
        api_key_id: 'key_123', // Optional field
      };

      // Act
      await tracker.track(record);
      await tracker.flush();

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          api_key_id: 'key_123',
        }),
      ]);
    });

    test('should handle very large response times', async () => {
      // Arrange
      const record: UsageRecord = {
        eco_id: 'eco_usr_slow',
        endpoint: '/api/slow',
        method: 'GET',
        timestamp: new Date(),
        response_time_ms: 30000, // 30 seconds
        status_code: 200,
      };

      // Act
      await tracker.track(record);
      await tracker.flush();

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          response_time_ms: 30000,
        }),
      ]);
    });

    test('should handle error status codes', async () => {
      // Arrange
      const records: UsageRecord[] = [
        {
          eco_id: 'eco_usr_err',
          endpoint: '/api/error',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 400,
        },
        {
          eco_id: 'eco_usr_err',
          endpoint: '/api/error',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 150,
          status_code: 500,
        },
      ];

      // Act
      for (const record of records) {
        await tracker.track(record);
      }
      await tracker.flush();

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ status_code: 400 }),
          expect.objectContaining({ status_code: 500 }),
        ])
      );
    });
  });

  // ============================================================================
  // Performance & Stress Tests
  // ============================================================================

  describe('Performance & Stress Tests', () => {
    test('should handle 1000 records efficiently', async () => {
      // Arrange
      const records: UsageRecord[] = [];
      for (let i = 0; i < 1000; i++) {
        records.push({
          eco_id: `eco_usr_${i}`,
          endpoint: '/api/test',
          method: 'GET',
          timestamp: new Date(),
          response_time_ms: 100,
          status_code: 200,
        });
      }

      // Act
      const startTime = Date.now();
      for (const record of records) {
        await tracker.track(record);
      }
      await tracker.flush();
      const duration = Date.now() - startTime;

      // Assert
      expect(mockRepository.batchInsert).toHaveBeenCalledTimes(10); // 10 batches of 100
      expect(duration).toBeLessThan(1000); // Should complete in < 1 second
    });

    test('should handle rapid successive tracks', async () => {
      // Arrange & Act - 500 records in quick succession
      for (let i = 0; i < 500; i++) {
        tracker.track({
          eco_id: `eco_usr_${i}`,
          endpoint: '/api/rapid',
          method: 'POST',
          timestamp: new Date(),
          response_time_ms: Math.floor(Math.random() * 1000),
          status_code: 200,
        });
      }

      await wait(50); // Wait for batches to process
      await tracker.flush(); // Flush remaining

      // Assert - Should handle without errors
      expect(mockRepository.batchInsert).toHaveBeenCalled();
    });
  });
});
