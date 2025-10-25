// nexus-ecosystem/packages/auth/__tests__/api-keys-integration.test.ts

import { generateApiKey, verifyApiKey, revokeApiKey, listKeys, checkRateLimit } from '../src/api-keys';

// Mock environment variables
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = 'test_service_key';
process.env.JWT_SECRET = 'test_jwt_secret';

const SUPA_READY = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY;

describe('API Keys Integration Tests', () => {
  const testEcoId = 'test-eco-id';
  const testName = 'Integration Test Key';

  describe('Full API Key Lifecycle', () => {
    (SUPA_READY ? it : it.skip)('should generate, verify, list, and revoke an API key', async () => {
      // 1. Generate an API key
      const { apiKey, plainKey } = await generateApiKey(testEcoId, testName, ['read', 'write'], true);
      
      expect(apiKey).toBeDefined();
      expect(apiKey.eco_id).toBe(testEcoId);
      expect(apiKey.name).toBe(testName);
      expect(plainKey).toMatch(/^eco_api_[0-9A-Za-z]{22}\.[0-9A-Za-z]{22}$/);
      
      // 2. Verify the API key (this would normally work with the full key string)
      const verifiedKey = await verifyApiKey(plainKey);
      
      // Note: The verification function expects to look up the key in the database
      expect(verifiedKey).toBeDefined();
      if (verifiedKey) {
        expect(verifiedKey.eco_id).toBe(testEcoId);
        expect(verifiedKey.name).toBe(testName);
      }
      
      // 3. List API keys for the user
      const userKeys = await listKeys(testEcoId);
      expect(userKeys).toBeDefined();
      expect(Array.isArray(userKeys)).toBe(true);
      expect(userKeys.some(key => key.name === testName)).toBe(true);
      
      // 4. Revoke the API key
      const revokeResult = await revokeApiKey(apiKey.id);
      expect(revokeResult).toBe(true);
      
      // 5. Verify the key is revoked (would return null after revocation)
      const revokedKey = await verifyApiKey(plainKey);
      expect(revokedKey).toBeNull();
    });
  });

  describe('Multiple keys management', () => {
    (SUPA_READY ? it : it.skip)('should allow multiple API keys per user', async () => {
      const userEcoId = 'another-user-id';
      
      // Generate multiple keys
      const key1 = await generateApiKey(userEcoId, 'Key 1', ['read'], false);
      const key2 = await generateApiKey(userEcoId, 'Key 2', ['write'], false);
      const key3 = await generateApiKey(userEcoId, 'Key 3', ['read', 'write'], true);
      
      expect(key1.apiKey.eco_id).toBe(userEcoId);
      expect(key2.apiKey.eco_id).toBe(userEcoId);
      expect(key3.apiKey.eco_id).toBe(userEcoId);
      
      // List all keys for the user
      const allKeys = await listKeys(userEcoId);
      expect(allKeys.length).toBeGreaterThanOrEqual(3);
      
      // Should contain our generated keys
      const keyNames = allKeys.map(k => k.name);
      expect(keyNames).toContain('Key 1');
      expect(keyNames).toContain('Key 2');
      expect(keyNames).toContain('Key 3');
    });
  });

  describe('Environment handling', () => {
    (SUPA_READY ? it : it.skip)('should correctly handle test and live modes', async () => {
      // Generate test key
      const testKeyResult = await generateApiKey(testEcoId, 'Test Key', [], true);
      expect(testKeyResult.apiKey.test_mode).toBe(true);
      expect(testKeyResult.plainKey).toMatch(/^eco_api_/);
      
      // Generate live key
      const liveKeyResult = await generateApiKey(testEcoId, 'Live Key', [], false);
      expect(liveKeyResult.apiKey.test_mode).toBe(false);
      expect(liveKeyResult.plainKey).toMatch(/^eco_api_/);
    });
  });

  describe('Rate limiting integration', () => {
    (SUPA_READY ? it : it.skip)('should allow checking rate limits for an API key', async () => {
      const { apiKey } = await generateApiKey(testEcoId, 'Rate Limit Key', [], false);
      
      // Test rate limit check
      const rateLimitOk = await checkRateLimit(apiKey.id);
      expect(rateLimitOk).toBeDefined();
    });
  });
});
