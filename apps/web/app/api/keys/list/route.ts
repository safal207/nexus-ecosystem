// apps/web/app/api/keys/list/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { listKeys } from '../../../../packages/auth/src/api-keys';
import { requireAuth } from '../../../../packages/auth/src/middleware';

export async function GET(req: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the user's API keys
    const apiKeys = await listKeys(user.ecoId);

    // Return the keys without revealing the plain key values
    const keysForResponse = apiKeys.map(key => ({
      id: key.id,
      name: key.name,
      scopes: key.scopes,
      status: key.status,
      testMode: key.test_mode,
      lastUsedAt: key.last_used_at,
      createdAt: key.created_at
    }));

    return NextResponse.json({ keys: keysForResponse });
  } catch (error: any) {
    console.error('API key listing error:', error);
    return NextResponse.json(
      { error: 'Failed to list API keys' },
      { status: 500 }
    );
  }
}