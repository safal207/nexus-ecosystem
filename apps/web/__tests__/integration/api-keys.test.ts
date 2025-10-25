import { generateApiKey, verifyApiKey, revokeApiKey, listKeys } from '../../../packages/auth/src/api-keys';

// Mock Next.js request and response objects for testing
const mockRequest = (body: any = {}, headers: any = {}) => ({
  json: async () => body,
  headers: {
    get: (key: string) => headers[key] || null,
  },
});

describe('API Key Management - Integration Tests', () => {
  const mockEcoId = 'eco_123456789';
  const mockKeyName = 'Integration Test Key';
  const mockScopes = ['read', 'write'];

  let generatedApiKey: { apiKey: any, plainKey: string } | null = null;

  it('should generate a new API key', async () => {
    generatedApiKey = await generateApiKey(mockEcoId, mockKeyName, mockScopes, false);
    
    expect(generatedApiKey).toHaveProperty('apiKey');
    expect(generatedApiKey).toHaveProperty('plainKey');
    expect(generatedApiKey?.plainKey).toMatch(/^eco_api_[0-9a-zA-Z]{22}$/);
    expect(generatedApiKey?.apiKey.eco_id).toBe(mockEcoId);
    expect(generatedApiKey?.apiKey.name).toBe(mockKeyName);
    expect(generatedApiKey?.apiKey.scopes).toEqual(mockScopes);
    expect(generatedApiKey?.apiKey.status).toBe('active');
  });

  it('should verify the generated API key', async () => {
    if (!generatedApiKey) {
      throw new Error('API key not generated');
    }

    const verifiedKey = await verifyApiKey(generatedApiKey.plainKey);
    
    expect(verifiedKey).not.toBeNull();
    expect(verifiedKey?.id).toBe(generatedApiKey.apiKey.id);
    expect(verifiedKey?.eco_id).toBe(mockEcoId);
    expect(verifiedKey?.name).toBe(mockKeyName);
    expect(verifiedKey?.status).toBe('active');
  });

  it('should list the generated API key', async () => {
    if (!generatedApiKey) {
      throw new Error('API key not generated');
    }

    const keys = await listKeys(mockEcoId);
    
    expect(keys).toBeInstanceOf(Array);
    expect(keys).toHaveLength(1); // Assuming this is the first key for this ecoId
    expect(keys[0].id).toBe(generatedApiKey.apiKey.id);
    expect(keys[0].name).toBe(mockKeyName);
    expect(keys[0].status).toBe('active');
  });

  it('should revoke the API key', async () => {
    if (!generatedApiKey) {
      throw new Error('API key not generated');
    }

    const result = await revokeApiKey(generatedApiKey.apiKey.id);
    expect(result).toBe(true);

    // Verify the key is no longer valid
    const verifiedKey = await verifyApiKey(generatedApiKey.plainKey);
    expect(verifiedKey).toBeNull();
  });

  it('should handle invalid API key verification', async () => {
    const invalidKeyResult = await verifyApiKey('eco_api_invalid_key_format');
    expect(invalidKeyResult).toBeNull();

    const wrongKeyResult = await verifyApiKey('eco_api_1234567890123456789012');
    expect(wrongKeyResult).toBeNull();
  });

  it('should handle revoke with non-existent key', async () => {
    const result = await revokeApiKey('non_existent_key_id');
    // Implementation-dependent behavior - might return false or throw
    expect(typeof result).toBe('boolean');
  });

  it('should handle empty listKeys for non-existent ecoId', async () => {
    const keys = await listKeys('non_existent_eco_id');
    expect(keys).toBeInstanceOf(Array);
    expect(keys).toHaveLength(0);
  });
});