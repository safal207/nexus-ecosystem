// apps/web/app/api/secure/ping/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { withApiKey, requireScopes } from '../../../../../packages/auth/src/api-key-middleware';

// Basic secure route that checks API key but doesn't require specific scopes
export const GET = withApiKey(async (_req: NextRequest, key) => {
  return NextResponse.json({ ok: true, key_id: key.id, test_mode: key.test_mode, scopes: key.scopes });
});

