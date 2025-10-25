// Integration tests for the full rotate flow using the API endpoint

import { NextRequest } from 'next/server';
import { generateApiKey, revokeApiKey } from '../../../packages/auth/src/api-keys';
import jwt from 'jsonwebtoken';

describe('API Key Rotation Flow - Integration Tests', () => {
  const mockEcoId = 'eco_usr_aaaaaaaaaaaaaaaaaaaaaa';
  const mockKeyName = 'Integration Test Key - Rotation Flow';
  
  let testApiKey: { apiKey: any, plainKey: string } | null = null;

  beforeAll(async () => {
    // Generate an API key for rotation flow testing
    testApiKey = await generateApiKey(mockEcoId, mockKeyName, ['test'], false);
    expect(testApiKey).not.toBeNull();
  });

  afterAll(async () => {
    // Clean up: revoke test key if it still exists
    if (testApiKey) {
      await revokeApiKey(testApiKey.apiKey.id);
    }
  });

  it('should successfully rotate an API key via the endpoint', async () => {
    if (!testApiKey) {
      throw new Error('Test API key not generated');
    }

    // Create a valid JWT for Authorization header (verifyJWT expects this)
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-32-characters-long!';
    const token = jwt.sign(
      { ecoId: mockEcoId, email: 'test@example.com', role: 'user' },
      process.env.JWT_SECRET!,
      { expiresIn: '15m', issuer: 'nexus-hub' }
    );

    // Mock the POST request to the rotate endpoint with Authorization
    const requestBody = { key_id: testApiKey.apiKey.id };
    
    const mockRequest = {
      json: async () => requestBody,
      headers: {
        get: (key: string) => {
          if (key.toLowerCase() === 'content-type') return 'application/json';
          if (key.toLowerCase() === 'authorization') return `Bearer ${token}`;
          return null;
        },
      },
    } as unknown as NextRequest;

    // Import the route handler function
    const { POST } = require('../../app/api/keys/rotate/route');
    
    // Make the request
    const response = await POST(mockRequest);
    
    expect(response.status).toBe(200);
    
    const result = await response.json();
    expect(result.message).toBe('API key rotated successfully');
    expect(result.key_id).toBe(testApiKey.apiKey.id);
    expect(result.new_key).toBeDefined();
    expect(result.new_key).not.toBe(testApiKey.plainKey);
    expect(result.new_key).toMatch(/^eco_api_[0-9a-zA-Z]{22}\.[0-9a-zA-Z]{22}$/);
  });

  it('should return 400 when key_id is missing in the request', async () => {
    // Create a valid JWT for Authorization header
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-32-characters-long!';
    const token = jwt.sign(
      { ecoId: mockEcoId, email: 'test@example.com', role: 'user' },
      process.env.JWT_SECRET!,
      { expiresIn: '15m', issuer: 'nexus-hub' }
    );

    // Mock the POST request with missing key_id
    const requestBody = { /* no key_id */ };
    
    const mockRequest = {
      json: async () => requestBody,
      headers: {
        get: (key: string) => {
          if (key.toLowerCase() === 'content-type') return 'application/json';
          if (key.toLowerCase() === 'authorization') return `Bearer ${token}`;
          return null;
        },
      },
    } as unknown as NextRequest;

    // Import the route handler function
    const { POST } = require('../../app/api/keys/rotate/route');
    
    // Make the request
    const response = await POST(mockRequest);
    
    expect(response.status).toBe(400);
    
    const result = await response.json();
    expect(result.error).toBe('Missing key_id');
  });

  it('should return error when trying to rotate a non-existent key', async () => {
    // Create a valid JWT for Authorization header
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-32-characters-long!';
    const token = jwt.sign(
      { ecoId: mockEcoId, email: 'test@example.com', role: 'user' },
      process.env.JWT_SECRET!,
      { expiresIn: '15m', issuer: 'nexus-hub' }
    );

    // Mock the POST request with a non-existent key_id
    const requestBody = { key_id: 'non_existent_key_id' };
    
    const mockRequest = {
      json: async () => requestBody,
      headers: {
        get: (key: string) => {
          if (key.toLowerCase() === 'content-type') return 'application/json';
          if (key.toLowerCase() === 'authorization') return `Bearer ${token}`;
          return null;
        },
      },
    } as unknown as NextRequest;

    // Import the route handler function
    const { POST } = require('../../app/api/keys/rotate/route');
    
    // Make the request
    const response = await POST(mockRequest);
    
    // The actual status code depends on the implementation - it will return 404 if the key doesn't exist
    expect(response.status).toBe(404);
    
    const result = await response.json();
    expect(result.error).toBeDefined();
  });
});
