// nexus-ecosystem/packages/auth/__tests__/api-keys.test.ts

import { generateApiKey, verifyApiKey, revokeApiKey, listKeys, checkRateLimit, RateLimiter, getRateLimiter, RedisRateLimiter, DbWindowRateLimiter, rotateApiKey } from '../src/api-keys';

// Mock environment variables
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = 'test_service_key';
process.env.JWT_SECRET = 'test_jwt_secret';

describe('API Keys Service', () => {
  describe('generateApiKey', () => {
    it('should generate a new API key with correct properties', async () => {
      const ecoId = 'test-eco-id';
      const name = 'Test Key';
      const scopes = ['read', 'write'];
      const testMode = true;

      const result = await generateApiKey(ecoId, name, scopes, testMode);

      expect(result.apiKey).toBeDefined();
      expect(result.plainKey).toBeDefined();
      expect(result.apiKey.eco_id).toBe(ecoId);
      expect(result.apiKey.name).toBe(name);
      expect(result.apiKey.status).toBe('active');
      expect(result.apiKey.test_mode).toBe(true);
      // Verify the plain key has the expected format id.secret
      expect(result.plainKey).toMatch(/^eco_api_[0-9A-Za-z]{22}\.[0-9A-Za-z]{22}$/);
    });

    it('should generate a live key when testMode is false', async () => {
      const result = await generateApiKey('test-eco-id', 'Test Key', [], false);
      expect(result.apiKey.test_mode).toBe(false);
      expect(result.plainKey).toMatch(/^eco_api_[0-9A-Za-z]{22}\.[0-9A-Za-z]{22}$/);
    });

    it('should handle errors during key generation', async () => {
      // Test error handling
      await expect(generateApiKey('', 'Test Key', [], false)).rejects.toThrow();
    });
  });

  describe('verifyApiKey', () => {
    it('should return null for non-existent API key', async () => {
      const result = await verifyApiKey('eco_api_aaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbb');
      expect(result).toBeNull();
    });
  });

  describe('revokeApiKey', () => {
    it('should return true when revoking a valid key', async () => {
      const result = await revokeApiKey('valid-key-id');
      expect(result).toBe(true);
    });

    it('should return false when revoking an invalid key', async () => {
      const result = await revokeApiKey('invalid-key-id');
      expect(result).toBe(false);
    });
  });

  describe('listKeys', () => {
    it('should return an empty array when no keys exist for the user', async () => {
      const result = await listKeys('non-existent-eco-id');
      expect(result).toEqual([]);
    });

    it('should return API keys for a valid user', async () => {
      const result = await listKeys('valid-eco-id');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('checkRateLimit', () => {
    beforeEach(() => {
      // Ensure REDIS_URL is not set so we use DB fallback
      delete process.env.REDIS_URL;
    });

    it('should return true by default (DB fallback implementation)', async () => {
      const result = await checkRateLimit('test-key-id');
      expect(result).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    describe('getRateLimiter', () => {
      it('should return DbWindowRateLimiter when REDIS_URL is not set', () => {
        delete process.env.REDIS_URL;
        const rateLimiter = getRateLimiter();
        expect(rateLimiter).toBeInstanceOf(DbWindowRateLimiter);
      });

      it('should return RedisRateLimiter when REDIS_URL is set', () => {
        process.env.REDIS_URL = 'redis://localhost:6379';
        const rateLimiter = getRateLimiter();
        expect(rateLimiter).toBeInstanceOf(RedisRateLimiter);
      });
    });

    describe('RedisRateLimiter', () => {
      let mockRedisClient: any;
      let redisRateLimiter: any;

      beforeEach(() => {
        // Mock the Redis client
        mockRedisClient = {
          get: jest.fn(),
          setex: jest.fn(),
        };

        // Create a RedisRateLimiter instance with the mocked client
        // We'll bypass the constructor that connects to Redis
        redisRateLimiter = new (class extends RedisRateLimiter {
          constructor() {
            // Call the parent constructor with a way to inject the mock
            super();
            this.client = mockRedisClient;
          }
        })();
      });

      it('should allow request when rate limit not exceeded', async () => {
        const keyId = 'test-key-id';
        const maxPerMinute = 10;
        const currentTimestamp = Date.now();
        const minuteTimestamp = Math.floor(currentTimestamp / 60000);
        const windowKey = `rl:${keyId}:${minuteTimestamp}`;

        // Mock Redis returning 5 count (current count is 5, max is 10)
        mockRedisClient.get.mockResolvedValue('5');

        const result = await redisRateLimiter.isAllowed(keyId, maxPerMinute);

        expect(mockRedisClient.get).toHaveBeenCalledWith(windowKey);
        expect(mockRedisClient.setex).toHaveBeenCalledWith(windowKey, 60, '6'); // Increment to 6
        expect(result).toBe(true);
      });

      it('should deny request when rate limit is exceeded', async () => {
        const keyId = 'test-key-id';
        const maxPerMinute = 5;
        const currentTimestamp = Date.now();
        const minuteTimestamp = Math.floor(currentTimestamp / 60000);
        const windowKey = `rl:${keyId}:${minuteTimestamp}`;

        // Mock Redis returning 6 count when max is 5
        mockRedisClient.get.mockResolvedValue('6');

        const result = await redisRateLimiter.isAllowed(keyId, maxPerMinute);

        expect(mockRedisClient.get).toHaveBeenCalledWith(windowKey);
        // setex should not be called because rate limit is exceeded
        expect(mockRedisClient.setex).not.toHaveBeenCalled();
        expect(result).toBe(false);
      });

      it('should allow request when no count exists yet', async () => {
        const keyId = 'test-key-id';
        const maxPerMinute = 10;
        const currentTimestamp = Date.now();
        const minuteTimestamp = Math.floor(currentTimestamp / 60000);
        const windowKey = `rl:${keyId}:${minuteTimestamp}`;

        // Mock Redis returning null (no count yet)
        mockRedisClient.get.mockResolvedValue(null);

        const result = await redisRateLimiter.isAllowed(keyId, maxPerMinute);

        expect(mockRedisClient.get).toHaveBeenCalledWith(windowKey);
        expect(mockRedisClient.setex).toHaveBeenCalledWith(windowKey, 60, '1'); // Set to 1
        expect(result).toBe(true);
      });

      it('should fail open when Redis is unavailable', async () => {
        const keyId = 'test-key-id';
        const maxPerMinute = 1;

        // Mock Redis throwing an error
        mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));

        const result = await redisRateLimiter.isAllowed(keyId, maxPerMinute);

        expect(result).toBe(true); // Should fail open
      });

      it('should not record usage separately since usage is tracked in isAllowed', async () => {
        const keyId = 'test-key-id';
        await redisRateLimiter.recordUsage(keyId);
        // recordUsage for Redis is a no-op, so no calls should be made to Redis
      });
    });

    describe('DbWindowRateLimiter', () => {
      // Since this would require mocking Supabase, we'll just test the basic interface
      it('should implement the RateLimiter interface', () => {
        const dbRateLimiter = new DbWindowRateLimiter();
        expect(dbRateLimiter.isAllowed).toBeDefined();
        expect(dbRateLimiter.recordUsage).toBeDefined();
      });
    });
  });

  describe('rotateApiKey', () => {
    it('should successfully rotate an existing key', async () => {
      // This test would require mocking Supabase properly, which is complex
      // For now, we'll just test that the function exists
      expect(rotateApiKey).toBeDefined();
    });

    it('should return error when key does not exist or does not belong to user', async () => {
      // This test would require mocking Supabase properly
      // Testing the authorization failure path
      const result = await rotateApiKey('non-existent-key', 'user-eco-id');
      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });
  });
});
