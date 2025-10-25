import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, ApiKey } from './api-keys';

export type ApiKeyHandler = (req: NextRequest, key: ApiKey) => Promise<NextResponse>;

export function withApiKey(handler: ApiKeyHandler, opts?: { rateLimit?: number }) {
  return async (req: NextRequest) => {
    const auth = req.headers.get('authorization') || req.headers.get('Authorization');
    const result = await authenticateApiKey(auth || undefined, { rateLimit: opts?.rateLimit });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return handler(req, result.key);
  };
}

/**
 * Wrapper function that checks if the API key has all required scopes
 * Returns 403 if the key doesn't have all required scopes
 */
export function requireScopes(required: string[]) {
  return function (handler: ApiKeyHandler, opts?: { rateLimit?: number }) {
    return withApiKey(async (req: NextRequest, key: ApiKey) => {
      // Check if the key has all required scopes
      const hasAllScopes = required.every(scope => key.scopes.includes(scope));
      
      if (!hasAllScopes) {
        return NextResponse.json(
          { error: `Insufficient scopes. Required: [${required.join(', ')}]` },
          { status: 403 }
        );
      }
      
      return handler(req, key);
    }, opts);
  };
}

