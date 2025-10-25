// apps/web/app/api/keys/rotate/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { rotateApiKey } from '../../../../../packages/auth/src/api-keys';
import { verifyJWT } from '../../../../../packages/auth/src/middleware';
import { EcoIDService } from '@nexus/eco-id';

const ecoIdService = new EcoIDService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Authenticate user via JWT and extract ecoId
    const auth = verifyJWT(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const ecoId = auth.user.ecoId;

    // Parse the request body
    const { key_id } = await req.json();
    if (!key_id) {
      return NextResponse.json({ error: 'Missing key_id' }, { status: 400 });
    }

    // Rotate API key secret while keeping the same key_id
    const result = await rotateApiKey(key_id, ecoId);
    if (!result.success) {
      // Log failed rotation attempt for audit trail
      try {
        await ecoIdService.logActivity(ecoId, 'api_key_rotated', {
          projectName: 'nexus-hub',
          resourceType: 'api_key',
          resourceId: key_id,
          ipAddress:
            req.headers.get('x-forwarded-for') ||
            req.headers.get('x-real-ip') ||
            'unknown',
          userAgent: req.headers.get('user-agent') || 'unknown',
          status: 'failure',
          errorMessage: result.error || 'Failed to rotate key',
        });
      } catch (e) {
        // Swallow logging errors to not mask the original failure
        console.error('Failed to log activity (rotation failure):', e);
      }
      return NextResponse.json({ error: result.error || 'Failed to rotate key' }, { status: result.status || 500 });
    }

    // Log the activity
    await ecoIdService.logActivity(ecoId, 'api_key_rotated', {
      projectName: 'nexus-hub',
      resourceType: 'api_key',
      resourceId: key_id,
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
      status: 'success'
    });

    return NextResponse.json({
      message: 'API key rotated successfully',
      key_id: result.key_id,
      new_key: result.new_key,
      created_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error rotating API key:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
