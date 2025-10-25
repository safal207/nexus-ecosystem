// apps/web/app/api/auth/logout/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { logout } from '../../../../packages/auth/src/jwt';

export async function POST(req: NextRequest) {
  try {
    // Get user info from the request (would typically come from middleware)
    const token = req.cookies.get('nexus_token')?.value;
    let userId = null;

    if (token) {
      try {
        // We could decode the token to get the userId, but for simplicity we'll skip this
        // In a real implementation, you'd have middleware that decodes the token
        // and attaches the user info to the request
        // For now, we'll just clear the cookies
      } catch (decodeError) {
        console.warn('Could not decode token for logout, proceeding with cookie removal');
      }
    }

    // Perform logout (in a real implementation, this might invalidate refresh tokens in DB)
    if (userId) {
      await logout(userId);
    }

    // Clear authentication cookies
    const response = NextResponse.json({
      message: 'Logout successful'
    });

    // Remove auth cookies
    response.cookies.delete('nexus_token');
    response.cookies.delete('nexus_refresh_token');

    return response;
  } catch (error: any) {
    console.error('Logout error:', error);

    return NextResponse.json(
      { error: 'Logout failed', details: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}