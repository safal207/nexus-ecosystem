// apps/web/app/api/keys/generate/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { generateApiKey } from '../../../../packages/auth/src/api-keys';
import { requireAuth } from '../../../../packages/auth/src/middleware';

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { name, scopes = [], testMode = false } = body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'API key name is required' },
        { status: 400 }
      );
    }

    // Generate the API key
    const result = await generateApiKey(user.ecoId, name, scopes, testMode);

    // Return the plain key (masked) and key information
    // In a real application, you would only return the key once and mask it in future responses
    const maskedKey = result.plainKey.substring(0, 8) + '...';
    
    return NextResponse.json({
      id: result.apiKey.id,
      name: result.apiKey.name,
      maskedKey,
      plainKey: result.plainKey, // This should only be shown once immediately after creation
      scopes: result.apiKey.scopes,
      testMode: result.apiKey.test_mode,
      createdAt: result.apiKey.created_at
    });
  } catch (error: any) {
    console.error('API key generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate API key' },
      { status: 500 }
    );
  }
}