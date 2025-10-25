// apps/web/app/api/auth/refresh/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { generateAccessToken, verifyRefreshToken } from '../../../../packages/auth/src/jwt';
import { EcoIDService } from '@nexus/eco-id';

// Initialize EcoID service for getting user info
const ecoIdService = new EcoIDService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Get refresh token from cookie
    const refreshToken = req.cookies.get('nexus_refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token not found' },
        { status: 401 }
      );
    }

    // Verify the refresh token
    const decoded = verifyRefreshToken(refreshToken);
    
    if (!decoded || !decoded.ecoId) {
      return NextResponse.json(
        { error: 'Invalid refresh token' },
        { status: 401 }
      );
    }

    // Get user identity using EcoID to get email and role
    const identity = await ecoIdService.getIdentity(decoded.ecoId);
    
    // Generate a new access token using EcoID instead of userId
    const newAccessToken = generateAccessToken({
      ecoId: decoded.ecoId,
      email: identity.email || decoded.email, // Use email from identity if available, fallback to token
      role: decoded.role || 'user'
    });

    // Set the new access token as httpOnly cookie
    const response = NextResponse.json({
      message: 'Token refreshed successfully'
    });

    response.cookies.set('nexus_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60, // 15 minutes
      sameSite: 'strict',
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Token refresh error:', error);

    // Clear the invalid refresh token cookie
    const response = NextResponse.json(
      { error: 'Token refresh failed' },
      { status: 401 }
    );

    response.cookies.delete('nexus_refresh_token');

    return response;
  }
}