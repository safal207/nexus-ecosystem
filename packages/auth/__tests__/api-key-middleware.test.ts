// nexus-ecosystem/packages/auth/__tests__/api-key-middleware.test.ts

import { NextRequest, NextResponse } from 'next/server';
import { withApiKey, requireScopes } from '../src/api-key-middleware';
import { authenticateApiKey, ApiKey } from '../src/api-keys';

// Mock the API key authentication
jest.mock('../src/api-keys', () => ({
  authenticateApiKey: jest.fn(),
}));

describe('API Key Middleware', () => {
  const mockApiKey: ApiKey = {
    id: 'eco_api_test12345678901234567890',
    eco_id: 'test-eco-id',
    key_hash: 'hash',
    name: 'Test Key',
    scopes: ['leads.read', 'contacts.write'],
    status: 'active',
    test_mode: false,
    last_used_at: null,
    created_at: new Date().toISOString(),
  };

  const mockRequest = (headers: Record<string, string> = {}) => {
    return {
      headers: {
        get: jest.fn((header: string) => headers[header] || null),
      },
    } as unknown as NextRequest;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('withApiKey', () => {
    it('should call handler with valid API key', async () => {
      const mockHandler = jest.fn().mockResolvedValue(new NextResponse('OK'));
      (authenticateApiKey as jest.MockedFunction<typeof authenticateApiKey>).mockResolvedValue({
        ok: true,
        key: mockApiKey,
      });

      const middleware = withApiKey(mockHandler);
      const req = mockRequest({ authorization: 'ApiKey test-key' });
      
      const response = await middleware(req);
      
      expect(authenticateApiKey).toHaveBeenCalledWith('ApiKey test-key', { rateLimit: undefined });
      expect(mockHandler).toHaveBeenCalledWith(req, mockApiKey);
      expect(response.status).toBe(200);
    });

    it('should return error response for invalid API key', async () => {
      (authenticateApiKey as jest.MockedFunction<typeof authenticateApiKey>).mockResolvedValue({
        ok: false,
        status: 401,
        error: 'Invalid API key',
      });

      const mockHandler = jest.fn().mockResolvedValue(new NextResponse('OK'));
      const middleware = withApiKey(mockHandler);
      const req = mockRequest({ authorization: 'ApiKey invalid-key' });
      
      const response = await middleware(req);
      
      expect(response.status).toBe(401);
      const jsonResponse = await response.json();
      expect(jsonResponse).toEqual({ error: 'Invalid API key' });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should handle missing authorization header', async () => {
      (authenticateApiKey as jest.MockedFunction<typeof authenticateApiKey>).mockResolvedValue({
        ok: false,
        status: 401,
        error: 'Missing Authorization',
      });

      const mockHandler = jest.fn().mockResolvedValue(new NextResponse('OK'));
      const middleware = withApiKey(mockHandler);
      const req = mockRequest();
      
      const response = await middleware(req);
      
      expect(response.status).toBe(401);
      const jsonResponse = await response.json();
      expect(jsonResponse).toEqual({ error: 'Missing Authorization' });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should pass rate limit option to authenticateApiKey', async () => {
      (authenticateApiKey as jest.MockedFunction<typeof authenticateApiKey>).mockResolvedValue({
        ok: true,
        key: mockApiKey,
      });

      const mockHandler = jest.fn().mockResolvedValue(new NextResponse('OK'));
      const middleware = withApiKey(mockHandler, { rateLimit: 500 });
      const req = mockRequest({ authorization: 'ApiKey test-key' });
      
      await middleware(req);
      
      expect(authenticateApiKey).toHaveBeenCalledWith('ApiKey test-key', { rateLimit: 500 });
      expect(mockHandler).toHaveBeenCalledWith(req, mockApiKey);
    });
  });

  describe('requireScopes', () => {
    it('should allow access when API key has all required scopes', async () => {
      (authenticateApiKey as jest.MockedFunction<typeof authenticateApiKey>).mockResolvedValue({
        ok: true,
        key: mockApiKey,
      });

      const mockHandler = jest.fn().mockResolvedValue(new NextResponse('Success'));
      const middleware = requireScopes(['leads.read'])(mockHandler);
      const req = mockRequest({ authorization: 'ApiKey test-key' });
      
      const response = await middleware(req);
      
      expect(mockHandler).toHaveBeenCalledWith(req, mockApiKey);
      expect(response.status).toBe(200);
    });

    it('should allow access when API key has multiple required scopes', async () => {
      (authenticateApiKey as jest.MockedFunction<typeof authenticateApiKey>).mockResolvedValue({
        ok: true,
        key: mockApiKey,
      });

      const mockHandler = jest.fn().mockResolvedValue(new NextResponse('Success'));
      const middleware = requireScopes(['leads.read', 'contacts.write'])(mockHandler);
      const req = mockRequest({ authorization: 'ApiKey test-key' });
      
      const response = await middleware(req);
      
      expect(mockHandler).toHaveBeenCalledWith(req, mockApiKey);
      expect(response.status).toBe(200);
    });

    it('should return 403 when API key lacks required scope', async () => {
      (authenticateApiKey as jest.MockedFunction<typeof authenticateApiKey>).mockResolvedValue({
        ok: true,
        key: mockApiKey,
      });

      const mockHandler = jest.fn().mockResolvedValue(new NextResponse('Success'));
      const middleware = requireScopes(['leads.read', 'admin.permissions'])(mockHandler);
      const req = mockRequest({ authorization: 'ApiKey test-key' });
      
      const response = await middleware(req);
      
      expect(response.status).toBe(403);
      const jsonResponse = await response.json();
      expect(jsonResponse).toEqual({ 
        error: 'Insufficient scopes. Required: [leads.read, admin.permissions]' 
      });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should return 403 when API key has no scopes but requires one', async () => {
      const keyWithNoScopes = { ...mockApiKey, scopes: [] };
      (authenticateApiKey as jest.MockedFunction<typeof authenticateApiKey>).mockResolvedValue({
        ok: true,
        key: keyWithNoScopes,
      });

      const mockHandler = jest.fn().mockResolvedValue(new NextResponse('Success'));
      const middleware = requireScopes(['leads.read'])(mockHandler);
      const req = mockRequest({ authorization: 'ApiKey test-key' });
      
      const response = await middleware(req);
      
      expect(response.status).toBe(403);
      const jsonResponse = await response.json();
      expect(jsonResponse).toEqual({ 
        error: 'Insufficient scopes. Required: [leads.read]' 
      });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should still authenticate the API key before checking scopes', async () => {
      (authenticateApiKey as jest.MockedFunction<typeof authenticateApiKey>).mockResolvedValue({
        ok: false,
        status: 401,
        error: 'Invalid API key',
      });

      const mockHandler = jest.fn().mockResolvedValue(new NextResponse('Success'));
      const middleware = requireScopes(['leads.read'])(mockHandler);
      const req = mockRequest({ authorization: 'ApiKey invalid-key' });
      
      const response = await middleware(req);
      
      expect(response.status).toBe(401);
      const jsonResponse = await response.json();
      expect(jsonResponse).toEqual({ error: 'Invalid API key' });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should pass rate limit option through requireScopes', async () => {
      (authenticateApiKey as jest.MockedFunction<typeof authenticateApiKey>).mockResolvedValue({
        ok: true,
        key: mockApiKey,
      });

      const mockHandler = jest.fn().mockResolvedValue(new NextResponse('Success'));
      const middleware = requireScopes(['leads.read'])(mockHandler, { rateLimit: 200 });
      const req = mockRequest({ authorization: 'ApiKey test-key' });
      
      await middleware(req);
      
      expect(authenticateApiKey).toHaveBeenCalledWith('ApiKey test-key', { rateLimit: 200 });
      expect(mockHandler).toHaveBeenCalledWith(req, mockApiKey);
    });
  });
});