import { 
  generateApiKey, 
  verifyApiKey, 
  revokeApiKey, 
  listKeys,
  checkRateLimit 
} from '../api-keys';

// Mock the database helper functions
jest.mock('../api-keys', () => {
  const actual = jest.requireActual('../api-keys');
  return {
    ...actual,
    storeApiKeyInDatabase: jest.fn(),
    findApiKeyByHash: jest.fn(),
    markApiKeyAsRevoked: jest.fn(),
    getApiKeysByEcoId: jest.fn(),
    updateApiKeyLastUsed: jest.fn(),
  };
});

// Import the mocked functions
import {
  storeApiKeyInDatabase,
  findApiKeyByHash,
  markApiKeyAsRevoked,
  getApiKeysByEcoId,
  updateApiKeyLastUsed,
} from '../api-keys';

describe('API Key Management', () => {
  const mockEcoId = 'eco_123456789';
  const mockKeyName = 'Test Key';
  const mockScopes = ['read', 'write'];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateApiKey', () => {
    it('should generate a valid API key with correct format', async () => {
      // Mock database storage
      (storeApiKeyInDatabase as jest.Mock).mockResolvedValue(undefined);

      const result = await generateApiKey(mockEcoId, mockKeyName, mockScopes, false);

      expect(result).toHaveProperty('apiKey');
      expect(result).toHaveProperty('plainKey');
      expect(result.plainKey).toMatch(/^eco_api_[0-9a-zA-Z]{22}$/);
      expect(result.apiKey.eco_id).toBe(mockEcoId);
      expect(result.apiKey.name).toBe(mockKeyName);
      expect(result.apiKey.scopes).toEqual(mockScopes);
      expect(result.apiKey.test_mode).toBe(false);
      expect(result.apiKey.status).toBe('active');
      expect(storeApiKeyInDatabase).toHaveBeenCalledWith(result.apiKey);
    });

    it('should generate a test mode API key when testMode is true', async () => {
      // Mock database storage
      (storeApiKeyInDatabase as jest.Mock).mockResolvedValue(undefined);

      const result = await generateApiKey(mockEcoId, mockKeyName, mockScopes, true);

      expect(result.apiKey.test_mode).toBe(true);
    });

    it('should throw an error if database storage fails', async () => {
      // Mock database failure
      (storeApiKeyInDatabase as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        generateApiKey(mockEcoId, mockKeyName, mockScopes, false)
      ).rejects.toThrow('Failed to generate API key');
    });
  });

  describe('verifyApiKey', () => {
    const validApiKey = 'eco_api_1234567890123456789012';
    const mockApiKeyRecord = {
      id: 'key_123',
      eco_id: mockEcoId,
      key_hash: 'mock_hash',
      name: mockKeyName,
      scopes: mockScopes,
      status: 'active',
      test_mode: false,
      last_used_at: null,
      created_at: new Date().toISOString(),
    };

    it('should return null for invalid API key format', async () => {
      const result = await verifyApiKey('invalid_key_format');
      expect(result).toBeNull();
    });

    it('should return null if key is not found in database', async () => {
      (findApiKeyByHash as jest.Mock).mockResolvedValue(null);

      const result = await verifyApiKey(validApiKey);
      expect(result).toBeNull();
      expect(findApiKeyByHash).toHaveBeenCalled();
    });

    it('should return null if key is revoked', async () => {
      const revokedKey = { ...mockApiKeyRecord, status: 'revoked' };
      (findApiKeyByHash as jest.Mock).mockResolvedValue(revokedKey);

      const result = await verifyApiKey(validApiKey);
      expect(result).toBeNull();
    });

    it('should return API key record if valid and active', async () => {
      (findApiKeyByHash as jest.Mock).mockResolvedValue(mockApiKeyRecord);
      (updateApiKeyLastUsed as jest.Mock).mockResolvedValue(undefined);

      const result = await verifyApiKey(validApiKey);
      expect(result).toEqual(mockApiKeyRecord);
      expect(updateApiKeyLastUsed).toHaveBeenCalledWith(mockApiKeyRecord.id);
    });
  });

  describe('revokeApiKey', () => {
    const mockKeyId = 'key_123';

    it('should return true when key is successfully revoked', async () => {
      (markApiKeyAsRevoked as jest.Mock).mockResolvedValue(true);

      const result = await revokeApiKey(mockKeyId);
      expect(result).toBe(true);
      expect(markApiKeyAsRevoked).toHaveBeenCalledWith(mockKeyId);
    });

    it('should return false when revocation fails', async () => {
      (markApiKeyAsRevoked as jest.Mock).mockResolvedValue(false);

      const result = await revokeApiKey(mockKeyId);
      expect(result).toBe(false);
    });
  });

  describe('listKeys', () => {
    const mockApiKeyList = [
      {
        id: 'key_1',
        eco_id: mockEcoId,
        key_hash: 'hash_1',
        name: 'Key 1',
        scopes: ['read'],
        status: 'active',
        test_mode: false,
        last_used_at: null,
        created_at: new Date().toISOString(),
      },
      {
        id: 'key_2',
        eco_id: mockEcoId,
        key_hash: 'hash_2',
        name: 'Key 2',
        scopes: ['write'],
        status: 'active',
        test_mode: true,
        last_used_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }
    ];

    it('should return list of API keys for given ecoId', async () => {
      (getApiKeysByEcoId as jest.Mock).mockResolvedValue(mockApiKeyList);

      const result = await listKeys(mockEcoId);
      expect(result).toEqual(mockApiKeyList);
      expect(getApiKeysByEcoId).toHaveBeenCalledWith(mockEcoId);
    });

    it('should return empty array if no keys found', async () => {
      (getApiKeysByEcoId as jest.Mock).mockResolvedValue([]);

      const result = await listKeys(mockEcoId);
      expect(result).toEqual([]);
    });
  });

  describe('checkRateLimit', () => {
    it('should return true (placeholder)', async () => {
      const result = await checkRateLimit('key_123');
      expect(result).toBe(true);
    });
  });
});