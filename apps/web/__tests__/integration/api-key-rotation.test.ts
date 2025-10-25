import { generateApiKey, verifyApiKey, rotateApiKey, revokeApiKey } from '../../../packages/auth/src/api-keys';
import { NextRequest } from 'next/server';

// Mock session for testing
jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}));

// Mock activity log
jest.mock('../../../lib/activity-log', () => ({
  createActivityLog: jest.fn().mockResolvedValue(true),
}));

// Mock data for testing
const mockEcoId = 'eco_usr_aaaaaaaaaaaaaaaaaaaaaa';
const mockKeyName = 'Rotate Test Key';
const mockScopes = ['read', 'write'];

describe('API Key Rotation - Integration Tests', () => {
  let generatedApiKey: { apiKey: any, plainKey: string } | null = null;

  beforeAll(async () => {
    // Generate a test key for rotation
    generatedApiKey = await generateApiKey(mockEcoId, mockKeyName, mockScopes, false);
    expect(generatedApiKey).not.toBeNull();
  });

  afterAll(async () => {
    // Clean up: revoke the test key
    if (generatedApiKey) {
      await require('../../../packages/auth/src/api-keys').revokeApiKey(generatedApiKey.apiKey.id);
    }
  });

  it('should successfully rotate an API key', async () => {
    if (!generatedApiKey) {
      throw new Error('API key not generated');
    }

    // Verify that the original key works before rotation
    let verifiedKeyBefore = await verifyApiKey(generatedApiKey.plainKey);
    expect(verifiedKeyBefore).not.toBeNull();
    expect(verifiedKeyBefore?.id).toBe(generatedApiKey.apiKey.id);

    // Perform the rotation
    const result = await rotateApiKey(generatedApiKey.apiKey.id, mockEcoId);
    
    // Verify the rotation was successful
    expect(result.success).toBe(true);
    expect(result.key_id).toBe(generatedApiKey.apiKey.id);
    expect(result.new_key).toBeDefined();
    expect(result.new_key).not.toBe(generatedApiKey.plainKey);
    
    // The old key should no longer be valid after rotation
    const verifiedOldKey = await verifyApiKey(generatedApiKey.plainKey);
    expect(verifiedOldKey).toBeNull();

    // The new key should be valid
    const verifiedNewKey = await verifyApiKey(result.new_key!);
    expect(verifiedNewKey).not.toBeNull();
    expect(verifiedNewKey?.id).toBe(generatedApiKey.apiKey.id);
  });

  it('should fail to rotate a key that does not belong to the user', async () => {
    if (!generatedApiKey) {
      throw new Error('API key not generated');
    }

    // Try to rotate with a different ecoId (should fail)
    const result = await rotateApiKey(generatedApiKey.apiKey.id, 'different_eco_id');
    
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
    expect(result.error).toBe('API key not found or does not belong to user');
  });

  it('should fail to rotate a non-existent key', async () => {
    // Try to rotate a non-existent key
    const result = await rotateApiKey('non_existent_key_id', mockEcoId);
    
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
    expect(result.error).toBe('API key not found or does not belong to user');
  });
});
