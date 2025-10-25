import { NextRequest, NextResponse } from 'next/server';
import { generateApiKey, verifyApiKey, revokeApiKey } from '../../../packages/auth/src/api-keys';
import { withApiKey, requireScopes } from '../../../packages/auth/src/api-key-middleware';

// Mock the API for testing
const mockRequest = (headers: Record<string, string> = {}) => ({
  headers: {
    get: (key: string) => headers[key] || null,
  },
});

describe('API Key Scope Enforcement - Integration Tests', () => {
  const mockEcoId = 'eco_usr_aaaaaaaaaaaaaaaaaaaaaa';
  const mockKeyName = 'Integration Test Key - Scopes';
  
  let apiKeyWithScopes: { apiKey: any, plainKey: string } | null = null;
  let apiKeyWithoutScopes: { apiKey: any, plainKey: string } | null = null;

  beforeAll(async () => {
    // Generate an API key with specific scopes
    apiKeyWithScopes = await generateApiKey(mockEcoId, `${mockKeyName} - with scopes`, ['leads.read', 'contacts.write'], false);
    
    // Generate an API key with no scopes
    apiKeyWithoutScopes = await generateApiKey(mockEcoId, `${mockKeyName} - no scopes`, [], false);
    
    expect(apiKeyWithScopes).not.toBeNull();
    expect(apiKeyWithoutScopes).not.toBeNull();
  });

  afterAll(async () => {
    // Clean up: revoke test keys
    if (apiKeyWithScopes) {
      await revokeApiKey(apiKeyWithScopes.apiKey.id);
    }
    if (apiKeyWithoutScopes) {
      await revokeApiKey(apiKeyWithoutScopes.apiKey.id);
    }
  });

  it('should allow access when API key has required scopes', async () => {
    if (!apiKeyWithScopes) {
      throw new Error('API key with scopes not generated');
    }

    // Create a protected handler that requires 'leads.read' scope
    const handler = requireScopes(['leads.read'])(async (req, key) => {
      return NextResponse.json({ message: 'Access granted', keyId: key.id });
    });

    // Create request with valid API key
    const req = mockRequest({ 
      authorization: `ApiKey ${apiKeyWithScopes.plainKey}` 
    });

    // Execute the handler
    const response = await handler(req as unknown as NextRequest);
    
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.message).toBe('Access granted');
    expect(result.keyId).toBe(apiKeyWithScopes.apiKey.id);
  });

  it('should deny access with 403 when API key lacks required scopes', async () => {
    if (!apiKeyWithoutScopes) {
      throw new Error('API key without scopes not generated');
    }

    // Create a protected handler that requires 'leads.read' scope
    const handler = requireScopes(['leads.read'])(async (req, key) => {
      return NextResponse.json({ message: 'Access granted', keyId: key.id });
    });

    // Create request with API key that doesn't have the required scope
    const req = mockRequest({ 
      authorization: `ApiKey ${apiKeyWithoutScopes.plainKey}` 
    });

    // Execute the handler
    const response = await handler(req as unknown as NextRequest);
    
    expect(response.status).toBe(403);
    const result = await response.json();
    expect(result.error).toContain('Insufficient scopes');
    expect(result.error).toContain('leads.read');
  });

  it('should deny access with 403 when API key lacks one of multiple required scopes', async () => {
    if (!apiKeyWithScopes) {
      throw new Error('API key with scopes not generated');
    }

    // Create a handler that requires multiple scopes
    const handler = requireScopes(['leads.read', 'admin.permissions'])(async (req, key) => {
      return NextResponse.json({ message: 'Access granted', keyId: key.id });
    });

    // Create request with API key that has 'leads.read' but not 'admin.permissions'
    const req = mockRequest({ 
      authorization: `ApiKey ${apiKeyWithScopes.plainKey}` 
    });

    // Execute the handler
    const response = await handler(req as unknown as NextRequest);
    
    expect(response.status).toBe(403);
    const result = await response.json();
    expect(result.error).toContain('Insufficient scopes');
    expect(result.error).toContain('admin.permissions');
  });

  it('should allow access when API key has all required scopes', async () => {
    if (!apiKeyWithScopes) {
      throw new Error('API key with scopes not generated');
    }

    // Create a handler that requires multiple scopes that the key has
    const handler = requireScopes(['leads.read', 'contacts.write'])(async (req, key) => {
      return NextResponse.json({ message: 'Access granted', keyId: key.id });
    });

    // Create request with API key that has both required scopes
    const req = mockRequest({ 
      authorization: `ApiKey ${apiKeyWithScopes.plainKey}` 
    });

    // Execute the handler
    const response = await handler(req as unknown as NextRequest);
    
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.message).toBe('Access granted');
    expect(result.keyId).toBe(apiKeyWithScopes.apiKey.id);
  });
});
