// apps/web/app/api/auth/login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { login } from '../../../../packages/auth/src/jwt';
import { LoginCredentials } from '../../../../packages/auth/src/types';

export async function POST(req: NextRequest) {
  try {
    const { email, password }: LoginCredentials = await req.json();

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Attempt to log in the user
    const { accessToken, refreshToken, user } = await login({ email, password });

    // Set refresh token as httpOnly cookie (secure in production)
    const response = NextResponse.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name
      }
    });

    // Set access token as httpOnly cookie
    response.cookies.set('nexus_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60, // 15 minutes
      sameSite: 'strict',
      path: '/',
    });

    // Set refresh token as httpOnly cookie (longer expiry)
    response.cookies.set('nexus_refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      sameSite: 'strict',
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);

    // Check for specific error messages
    if (error.message?.includes('not found') || error.message?.includes('Invalid password')) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Login failed', details: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}