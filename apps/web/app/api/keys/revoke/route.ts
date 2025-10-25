// apps/web/app/api/keys/revoke/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { ApiKeyService } from '../../../../../packages/auth/src/api-keys';
import { verifyJWT } from '../../../../../packages/auth/src/middleware';

const apiKeyService = new ApiKeyService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const auth = verifyJWT(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { key_id }: { key_id?: string } = await req.json();
    if (!key_id) {
      return NextResponse.json({ error: 'key_id is required' }, { status: 400 });
    }

    // Optional: verify that key belongs to the user
    const keys = await apiKeyService.listKeys(auth.user.ecoId);
    if (!keys.some(k => k.id === key_id)) {
      return NextResponse.json({ error: 'API key not found or unauthorized' }, { status: 404 });
    }

    await apiKeyService.revokeApiKey(key_id);
    return NextResponse.json({ message: 'API key revoked', key_id });
  } catch (error: any) {
    console.error('API key revoke error:', error);
    return NextResponse.json(
      { error: 'Failed to revoke API key', details: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

