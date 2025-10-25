// apps/web/app/api/secure/test-scopes/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireScopes } from '../../../../../packages/auth/src/api-key-middleware';

// Example of a route that requires multiple scopes
export const GET = requireScopes(['leads.read', 'contacts.write'])(async (_req: NextRequest, key) => {
  return NextResponse.json({ 
    ok: true, 
    key_id: key.id, 
    test_mode: key.test_mode, 
    scopes: key.scopes,
    message: 'Successfully accessed route requiring multiple scopes'
  });
});