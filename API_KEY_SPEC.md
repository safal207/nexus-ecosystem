# API Key Specification

Last Updated: 2025-10-10

## Overview

API keys provide programmatic access to Nexus services. Keys are bound to an EcoID owner and support test/live modes. Secrets are shown exactly once at generation and never stored in plaintext.

## Key Format

- Key ID: `eco_api_<22>` where `<22>` is Base62 (0-9a-zA-Z)
- Full Secret (returned once): `<key_id>.<secret_part>`
  - `secret_part`: 22-char Base62
- Storage: SHA-256 of the full secret (`sha256(<key_id>.<secret_part>)`) persisted as `key_hash`
- Example:
  - `key_id`: `eco_api_mJ8bN0fQp2ZcTYxK4hV3sA`
  - `secret`: `eco_api_mJ8bN0fQp2ZcTYxK4hV3sA.Bx9Zq71mHcG8pQ2rTnY5Kd`

## Database Schema

Table: `eco_api_keys`
- `id` (text, PK, format `^eco_[a-z]{3}_[0-9a-zA-Z]{22}$`)
- `eco_id` (text, FK → `eco_identities.eco_id`)
- `key_hash` (text, UNIQUE) — SHA-256 of full secret
- `name` (text)
- `scopes` (text[])
- `status` (text: `active` | `revoked` | `expired`)
- `test_mode` (boolean)
- `last_used_at` (timestamptz, nullable)
- `created_at` (timestamptz default now())

Table: `eco_api_usage` (for rate limiting/analytics)
- `id` (uuid, PK)
- `key_id` (text, FK → `eco_api_keys.id`)
- `timestamp` (timestamptz)
- `count` (int)

See migration: `supabase/migrations/002_api_keys.sql`

Additional indexes for performance (migration: `supabase/migrations/003_api_usage_indexes.sql`):
- `idx_api_usage_key_timestamp` on `eco_api_usage(key_id, timestamp DESC)` - for optimizing rate limiting queries
- `idx_api_usage_key_id` on `eco_api_usage(key_id)` - for general key-based lookups

## Verification Flow

1. Client sends the full secret in header:
   - `Authorization: ApiKey <eco_api_...>.<secret_part>`
2. Server computes `sha256(header_value)` and looks up row by `key_hash`.
3. Conditions:
   - Row exists and `status = 'active'`
   - Optionally enforce `test_mode` per environment
4. On success:
   - Update `last_used_at`
   - Continue request
5. On failure: return `401 Unauthorized`

## HTTP Endpoints (App Router)

All endpoints require user JWT unless noted otherwise.

1) Generate Key
- POST `/api/keys/generate`
- Body: `{ "name": string, "scopes": string[], "testMode"?: boolean }`
- Response 200:
  ```json
  {
    "key_id": "eco_api_...",
    "key": "eco_api_....<secret_part>",
    "name": "My Key",
    "scopes": ["leads.read"],
    "test_mode": true,
    "created_at": "2025-10-10T12:00:00.000Z"
  }
  ```
- Notes: `key` is shown once. Store it securely client-side.

Curl:
```
ACCESS_TOKEN=<your_access_token>
API_URL=${TEST_API_URL:-http://localhost:3000}
curl -X POST "$API_URL/api/keys/generate" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Key","scopes":["leads.read"],"testMode":true}'
```

HTTPie:
```
http POST $API_URL/api/keys/generate \
  Authorization:"Bearer $ACCESS_TOKEN" \
  name="My Key" scopes:='["leads.read"]' testMode:=true
```

2) List Keys
- GET `/api/keys/list`
- Response 200:
  ```json
  {
    "keys": [
      {
        "id": "eco_api_...",
        "name": "My Key",
        "scopes": ["leads.read"],
        "status": "active",
        "test_mode": true,
        "last_used_at": null,
        "created_at": "2025-10-10T12:00:00.000Z"
      }
    ]
  }
  ```

Curl:
```
curl -X GET "$API_URL/api/keys/list" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

HTTPie:
```
http GET $API_URL/api/keys/list Authorization:"Bearer $ACCESS_TOKEN"
```

3) Revoke Key
- POST `/api/keys/revoke`
- Body: `{ "key_id": "eco_api_..." }`
- Response 200: `{ "message": "API key revoked", "key_id": "eco_api_..." }`

Curl:
```
KEY_ID=eco_api_...
curl -X POST "$API_URL/api/keys/revoke" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key_id":"'"$KEY_ID"'"}'
```

HTTPie:
```
http POST $API_URL/api/keys/revoke Authorization:"Bearer $ACCESS_TOKEN" key_id="$KEY_ID"
```

4) Use API Key (no JWT)
- GET `/api/secure/ping` (or other protected endpoints)
- Header: `Authorization: ApiKey <key_id>.<secret>`
- Scopes: API keys can be restricted to specific scopes using `requireScopes()` middleware

Curl:
```
KEY_SECRET=<eco_api_...>.<secret>
curl -X GET "$API_URL/api/secure/ping" \
  -H "Authorization: ApiKey $KEY_SECRET"
```

HTTPie:
```
http GET $API_URL/api/secure/ping Authorization:"ApiKey $KEY_SECRET"
```

Scope Enforcement Example:
```
// In your route handler
import { requireScopes } from '@nexus/auth';

export const GET = requireScopes(['leads.read'])(async (req, key) => {
  // Only accessible if the API key has 'leads.read' scope
  return NextResponse.json({ message: 'Success' });
});

// Multiple scopes required:
export const POST = requireScopes(['leads.write', 'contacts.read'])(async (req, key) => {
  // Only accessible if the API key has both 'leads.write' AND 'contacts.read' scopes
  return NextResponse.json({ message: 'Success' });
});
```

If an API key doesn't have the required scopes, the request will return:
- Status: 403 Forbidden
- Response: `{"error": "Insufficient scopes. Required: [scope1, scope2, ...]"}`

Example 403 response:
```
{
  "error": "Insufficient scopes. Required: [leads.read, contacts.write]"
}
```

## Error Codes
- 400: Validation errors (missing name/scopes/key_id)
- 401: Missing/invalid user JWT (for management endpoints) or invalid API key during verification
- 404: Key not found or not owned by user
- 429: Rate limit exceeded (planned in Task 1.3)
- 500: Internal errors

## Security Considerations
- Secrets never logged or stored in plaintext
- `key_hash` only; `key` shown once at creation
- Distinguish test vs live via `test_mode`
- Rotate keys by generating a new one and revoking the old

## Rate Limiting
- Implement per-key quotas with Redis (preferred) or DB windowed counters
- Enforce thresholds and return HTTP 429
- Track usage into `eco_api_usage`
- Environment configuration: 
  - Set `REDIS_URL` to use Redis-based rate limiting (preferred for performance)
  - If `REDIS_URL` is not set, falls back to database-based rate limiting
  - `RATE_LIMIT_PER_MINUTE` (optional): custom rate limit threshold per minute (default: 1000)

## Implementation References
- Service: `packages/auth/src/api-keys.ts`
- Routes: `apps/web/app/api/keys/*`
- Types: `packages/auth/src/types.ts`
- Migration: `supabase/migrations/002_api_keys.sql`
