// Example API endpoints for API key management
// This would typically be implemented in the consuming application

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from './middleware';
import { generateApiKey, revokeApiKey, listKeys } from './api-keys';

// POST /api/auth/api-keys/generate - Generate a new API key
export const generateApiKeyHandler = withAuth(async (req: NextRequest, user: any) => {
  try {
    const { name, scopes = [], testMode = false } = await req.json();
    
    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' }, 
        { status: 400 }
      );
    }
    
    const { apiKey, plainKey } = await generateApiKey(user.ecoId, name, scopes, testMode);
    
    // Return the plain key to the user (only at generation time)
    return NextResponse.json({ 
      key_id: apiKey.id,
      key: plainKey,
      name: apiKey.name,
      scopes: apiKey.scopes,
      status: apiKey.status,
      test_mode: apiKey.test_mode,
      created_at: apiKey.created_at,
    });
  } catch (error) {
    console.error('Error generating API key:', error);
    return NextResponse.json(
      { error: 'Failed to generate API key' }, 
      { status: 500 }
    );
  }
});

// GET /api/auth/api-keys - List API keys for the authenticated user
export const listApiKeysHandler = withAuth(async (req: NextRequest, user: any) => {
  try {
    const apiKeys = await listKeys(user.ecoId);
    
    // Don't return the hash, only the key metadata
    const keyList = apiKeys.map(({ key_hash, ...key }) => key);
    
    return NextResponse.json({ apiKeys: keyList });
  } catch (error) {
    console.error('Error listing API keys:', error);
    return NextResponse.json(
      { error: 'Failed to list API keys' }, 
      { status: 500 }
    );
  }
});

// DELETE /api/auth/api-keys/[id] - Revoke an API key
export const revokeApiKeyHandler = withAuth(async (req: NextRequest, user: any) => {
  try {
    // Extract key ID from URL
    // This would require parameter extraction specific to your framework
    const urlParts = req.nextUrl.pathname.split('/');
    const keyId = urlParts[urlParts.length - 1];
    
    if (!keyId) {
      return NextResponse.json(
        { error: 'API key ID is required' }, 
        { status: 400 }
      );
    }
    
    // Verify that the key belongs to the user
    const userKeys = await listKeys(user.ecoId);
    const userKey = userKeys.find(key => key.id === keyId);
    
    if (!userKey) {
      return NextResponse.json(
        { error: 'API key not found or unauthorized' }, 
        { status: 404 }
      );
    }
    
    const success = await revokeApiKey(keyId);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to revoke API key' }, 
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      message: 'API key revoked successfully',
      keyId
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    return NextResponse.json(
      { error: 'Failed to revoke API key' }, 
      { status: 500 }
    );
  }
});

// Example usage in Next.js app router:
// In app/api/keys/generate/route.ts
// export { generateApiKeyHandler as POST } from './endpoints';
//
// In app/api/keys/route.ts  
// export { listApiKeysHandler as GET, generateApiKeyHandler as POST } from './endpoints';
//
// In app/api/keys/[id]/route.ts
// export { revokeApiKeyHandler as DELETE } from './endpoints';
