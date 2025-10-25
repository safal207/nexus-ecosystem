// apps/web/app/api/auth/register/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { register } from '../../../../packages/auth/src/jwt';
import { RegisterData } from '../../../../packages/auth/src/types';

export async function POST(req: NextRequest) {
  try {
    const { email, password, full_name }: RegisterData = await req.json();

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Enhanced password strength validation (min 12 characters with complexity)
    if (password.length < 12) {
      return NextResponse.json(
        { error: 'Password must be at least 12 characters' },
        { status: 400 }
      );
    }

    // Check password complexity
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
      return NextResponse.json(
        { error: 'Password must contain uppercase, lowercase, number, and special character' },
        { status: 400 }
      );
    }

    // Register the user
    const user = await register({ email, password, full_name });

    // Return success response
    return NextResponse.json(
      { 
        message: 'User registered successfully', 
        user: { id: user.id, email: user.email, full_name: user.full_name } 
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Registration error:', error);

    // Check for specific error messages
    if (error.message?.includes('already exists')) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 } // Conflict
      );
    }

    return NextResponse.json(
      { error: 'Registration failed', details: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}