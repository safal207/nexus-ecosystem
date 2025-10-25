// nexus-ecosystem/packages/auth/src/middleware.ts

import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from './jwt';
import { TokenPayload } from './types';
import { EcoIDGenerator } from '@nexus/eco-id';

const JWT_SECRET = process.env.JWT_SECRET!;

/**
 * Middleware to verify JWT token from cookies or authorization header
 */
export function verifyJWT(req: NextRequest): { success: true; user?: TokenPayload } | { success: false; redirect?: string } {
  try {
    // Get token from cookie or Authorization header
    const token = req.cookies.get('nexus_token')?.value ||
                  req.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return { success: false, redirect: '/login' };
    }

    // Verify the token
    const decoded = verifyAccessToken(token) as TokenPayload;
    
    // Validate EcoID format
    if (!EcoIDGenerator.isValid(decoded.ecoId)) {
      throw new Error('Invalid EcoID format');
    }
    
    // Add user info to request for downstream handlers
    (req as any).user = decoded;
    (req as any).ecoId = decoded.ecoId;  // Attach EcoID to request
    
    return { success: true, user: decoded };
  } catch (error) {
    console.error('Token verification failed:', error);
    return { success: false, redirect: '/login' };
  }
}

/**
 * Next.js Middleware function
 * This will be used in the middleware.ts file at the app root
 */
export async function authMiddleware(req: NextRequest) {
  // Define public routes that don't require authentication
  const publicPaths = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/login', '/register', '/api/public'];
  
  const isPublicPath = publicPaths.some(path => 
    req.nextUrl.pathname.startsWith(path)
  );

  // If it's a public path, continue without authentication
  if (isPublicPath) {
    return NextResponse.next();
  }

  // For protected paths, verify the JWT
  const result = verifyJWT(req);

  if (!result.success) {
    // Redirect to login if not authenticated
    return NextResponse.redirect(new URL(result.redirect || '/login', req.url));
  }

  // Continue with the request if authenticated
  return NextResponse.next();
}

/**
 * Higher-order function to protect API routes
 */
export function withAuth(handler: (req: NextRequest, user: TokenPayload) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const result = verifyJWT(req);

    if (!result.success || !result.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return handler(req, result.user);
  };
}