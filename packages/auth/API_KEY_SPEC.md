# API Key System Specification

## Overview
The Nexus Ecosystem API Key system provides secure authentication for programmatic access to Nexus services. API keys allow applications to authenticate and access Nexus resources without requiring user credentials.

## Key Features
- Secure API key generation with strong randomization
- Test and Live environment modes
- Configurable rate limiting per key
- Key revocation and management
- Usage tracking and monitoring

## API Key Format
API keys follow the format: `nexus_(test|live)_(timestamp)_(random_string)`

Example:
- Test Key: `nexus_test_1681234567890_a1b2c3d4e5f6g7h8i9j0k`
- Live Key: `nexus_live_1681234567890_z9y8x7w6v5u4t3s2r1q0p`

## Core Functions

### generateApiKey(ecoId, name, scopes, testMode)
**Description**: Generates a new API key for the specified user

**Parameters**:
- `ecoId` (string): The EcoID of the user requesting the key
- `name` (string): A descriptive name for the API key
- `scopes` (string[]): Array of permissions/scopes for the key (default: [])
- `testMode` (boolean): Whether to create a test mode key (default: false)

**Returns**: Promise resolving to `{ apiKey: ApiKey, plainKey: string }`

**Example**:
```javascript
const { apiKey, plainKey } = await generateApiKey(
  'usr_abc123def456', 
  'My Application Key',
  ['read:users', 'write:posts'],
  false
);
```

### verifyApiKey(plainKey)
**Description**: Verifies an API key and returns its details if valid

**Parameters**:
- `plainKey` (string): The full API key string to verify

**Returns**: Promise resolving to `ApiKey | null`

**Example**:
```javascript
const apiKey = await verifyApiKey('nexus_live_1681234567890_z9y8x7w6v5u4t3s2r1q0p');
if (apiKey) {
  console.log(`Valid key for user: ${apiKey.user_id}`);
} else {
  console.log('Invalid API key');
}
```

### revokeApiKey(keyId)
**Description**: Revokes an existing API key, preventing further use

**Parameters**:
- `keyId` (string): The ID of the API key to revoke

**Returns**: Promise resolving to boolean indicating success

**Example**:
```javascript
const success = await revokeApiKey('key_1234567890_abc123');
if (success) {
  console.log('API key revoked successfully');
}
```

### listKeys(ecoId)
**Description**: Lists all non-revoked API keys for a user

**Parameters**:
- `ecoId` (string): The EcoID of the user

**Returns**: Promise resolving to `ApiKey[]`

**Example**:
```javascript
const keys = await listKeys('usr_abc123def456');
console.log(`User has ${keys.length} active API keys`);
```

### checkRateLimit(keyId)
**Description**: Checks if a key has exceeded its rate limit (stub implementation)

**Parameters**:
- `keyId` (string): The ID of the API key to check

**Returns**: Promise resolving to boolean indicating if request is allowed

## Data Models

### ApiKey Interface
```typescript
interface ApiKey {
  id: string;              // Unique identifier for the API key
  user_id: string;         // EcoID of the key owner
  key_hash: string;        // Bcrypt hash of the API key
  name: string;            // Descriptive name for the key
  environment: 'test' | 'live'; // Environment context
  rate_limit: number;      // Requests per minute allowed
  last_used_at?: string;   // Timestamp of last use
  expires_at?: string;     // Expiration timestamp (optional)
  created_at: string;      // Creation timestamp
  revoked?: boolean;       // Whether the key has been revoked
}
```

## Database Schema

### eco_api_keys table
```sql
CREATE TABLE eco_api_keys (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    environment VARCHAR(10) NOT NULL DEFAULT 'live' CHECK (environment IN ('test', 'live')),
    rate_limit INTEGER NOT NULL DEFAULT 1000,
    scopes TEXT[] DEFAULT '{}',
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### eco_api_usage table
```sql
CREATE TABLE eco_api_usage (
    id SERIAL PRIMARY KEY,
    key_id VARCHAR(64) NOT NULL,
    request_path VARCHAR(500),
    request_method VARCHAR(10),
    response_status INTEGER,
    request_size INTEGER,
    response_size INTEGER,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (key_id) REFERENCES eco_api_keys(id) ON DELETE CASCADE
);
```

## Security Considerations

1. **Key Storage**: API keys are stored as bcrypt hashes in the database
2. **Key Transmission**: API keys must be transmitted over HTTPS only
3. **Key Exposure**: Plain API keys are only returned once during generation
4. **Rate Limiting**: Each key has a default rate limit of 1000 requests per minute
5. **Environment Separation**: Test and Live keys are clearly distinguished

## Usage Examples

### Creating an API Key
```javascript
import { generateApiKey } from '@nexus/auth';

async function createApplicationKey() {
  try {
    const { apiKey, plainKey } = await generateApiKey(
      'usr_abc123def456',
      'My Application',
      ['read:posts', 'write:comments'],
      false  // Live mode
    );

    console.log('New API key created');
    console.log('Key ID:', apiKey.id);
    console.log('Keep the following key secure:', plainKey);  // Only shown once!
  } catch (error) {
    console.error('Failed to create API key:', error);
  }
}
```

### Using an API Key in HTTP Requests
```javascript
// Example of using the API key in requests
const response = await fetch('/api/v1/data', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer nexus_live_1681234567890_z9y8x7w6v5u4t3s2r1q0p`,
    'Content-Type': 'application/json'
  }
});
```

## Rate Limiting

The system implements rate limiting at the API key level with the following characteristics:
- Default: 1000 requests per minute per key
- Configured per key during creation (future enhancement)
- Tracked using the `eco_api_usage` table
- The `checkRateLimit` function (stub) will implement the actual logic

## Key Management Best Practices

1. **Secure Storage**: Store API keys securely, never in plain text in source code
2. **Environment Variables**: Use environment variables for API key configuration
3. **Regular Rotation**: Rotate API keys periodically for enhanced security
4. **Scope Minimization**: Grant only the minimum scopes necessary
5. **Monitoring**: Monitor API key usage and revoke compromised keys immediately
6. **Test vs Live**: Use test keys during development and live keys in production