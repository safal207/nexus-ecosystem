# @nexus/auth

JWT Authentication package for the Nexus Ecosystem. Provides secure user authentication with access and refresh tokens, password hashing, and middleware for protecting routes.

## Features

- JWT token generation with 15-minute access tokens and 7-day refresh tokens
- Secure password hashing with bcrypt
- Supabase integration for user management
- Middleware for route protection
- API endpoints for authentication flows

## API Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Token refresh
- `POST /api/auth/logout` - User logout

## Environment Variables

```env
# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars-please-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars-please-change-in-production

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
```

## Database Schema

The authentication system works with the following Supabase tables:

### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### api_keys (for future use)
```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  key_hash TEXT UNIQUE NOT NULL,
  name TEXT,
  environment TEXT CHECK (environment IN ('test', 'live')),
  rate_limit INTEGER DEFAULT 100,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);
```

### subscriptions (for future use)
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  mrr NUMERIC(10,2)
);
```

## Usage

### Register a new user
```typescript
const response = await fetch('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securepassword',
    full_name: 'John Doe'
  })
});
```

### Login
```typescript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securepassword'
  })
});

// Access token is stored in httpOnly cookie automatically
```

### Protected route middleware
The middleware automatically protects routes (except for auth routes). Add your protected routes in the app router, and they will be automatically protected.

## Security Considerations

- Access tokens expire after 15 minutes
- Refresh tokens expire after 7 days
- Passwords are hashed with bcrypt (10 rounds)
- Tokens are stored in httpOnly cookies to prevent XSS attacks
- SameSite=strict attribute prevents CSRF attacks

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build the package
pnpm build
```

## API Key Middleware (withApiKey, requireScopes)

Use API keys to protect routes and enforce scopes. Clients send the full secret in the `Authorization` header as:

```
Authorization: ApiKey <key_id>.<secret_part>
```

### Basic protection

```ts
import { NextRequest, NextResponse } from 'next/server';
import { withApiKey } from '@nexus/auth';

export const GET = withApiKey(async (_req: NextRequest, key) => {
  return NextResponse.json({ ok: true, key_id: key.id, scopes: key.scopes });
});
```

### Scope enforcement

```ts
import { requireScopes } from '@nexus/auth';

// Requires the API key to have both scopes
export const POST = requireScopes(['leads.read', 'contacts.write'])(async (_req, key) => {
  return NextResponse.json({ ok: true, key_id: key.id });
});
```

### Rate limiting

Rate limiting is enforced per key. Default is 1000 req/min. Configure Redis for best performance:

```env
REDIS_URL=redis://localhost:6379
RATE_LIMIT_PER_MINUTE=1000
```

Without `REDIS_URL`, a database windowed fallback is used (table `eco_api_usage`).

See `API_KEY_SPEC.md` for full details and curl/HTTPie examples.
