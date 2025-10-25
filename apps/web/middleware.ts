// apps/web/middleware.ts

import { NextRequest } from 'next/server';
import { authMiddleware } from '../packages/auth/src/middleware';

// Export the middleware configuration
export default authMiddleware;

// Define which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (API auth routes like login, register)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};