# 🧪 Grok - START HERE: Testing Infrastructure & Auth Tests

**Date:** 2025-10-10
**Priority:** 🔥 P0 (Critical - Quality Gate for entire ecosystem)
**Estimated Time:** 16-20 hours (2-3 working days)
**Your Role:** QA Engineer / Test Automation Specialist

---

## 👋 Welcome, Grok!

You're the **Quality Guardian** of the Nexus Ecosystem. Your mission: ensure **zero critical bugs** reach production.

**Your scope:**
- ✅ Write comprehensive test suites
- ✅ Automate testing (unit, integration, E2E)
- ✅ Security testing (penetration tests, vulnerability scans)
- ✅ Performance testing (load tests, stress tests)
- ✅ CI/CD integration (automated test runs)

**Target:** >85% test coverage, 0 critical vulnerabilities, <200ms p95 latency

---

## 📊 Current State

**What Qwen built:**
- ✅ JWT Authentication system (Task 1.1)
  - Register, Login, Refresh, Logout endpoints
  - bcrypt password hashing
  - httpOnly cookies
  - Token expiration (15min access, 7 days refresh)

**Your job:**
- 🧪 Test everything Qwen built
- 🐛 Find bugs before production
- 📊 Ensure security & performance standards
- ✅ Write tests that catch regressions

---

## 🎯 Task T1.1: JWT Authentication Test Suite

**Priority:** P0 (Critical)
**Estimated Time:** 12-14 hours
**Dependencies:** Qwen's Task 1.1 (completed)

### Objectives:

1. **Unit Tests** (4 hours)
   - JWT token generation/verification
   - Password hashing/comparison
   - Token expiration logic

2. **Integration Tests** (4 hours)
   - Complete auth flows (register → login → access protected route)
   - Database operations (user creation, credential verification)
   - Cookie management

3. **Security Tests** (3 hours)
   - SQL injection attempts
   - XSS prevention
   - JWT manipulation attempts
   - Brute force protection

4. **Performance Tests** (2 hours)
   - Response time benchmarks
   - Concurrent login handling
   - Database query optimization

---

## 📁 Files to Test

**Qwen's code location:**
```
nexus-ecosystem/
├── packages/
│   └── auth/
│       └── src/
│           ├── jwt.ts          ← Main logic (test this!)
│           ├── middleware.ts   ← Route protection (test this!)
│           └── types.ts        ← TypeScript interfaces
└── apps/
    └── web/
        └── app/api/auth/
            ├── register/route.ts  ← API endpoint (test this!)
            ├── login/route.ts     ← API endpoint (test this!)
            ├── refresh/route.ts   ← API endpoint (test this!)
            └── logout/route.ts    ← API endpoint (test this!)
```

---

## 🛠️ Setup Your Testing Environment

### Step 1: Install Testing Tools (30 min)

```bash
cd C:\Users\safal\OneDrive\Documente\GitHub\nexus-ecosystem

# Install Jest for unit tests
npm install -D jest @types/jest ts-jest

# Install Supertest for API testing
npm install -D supertest @types/supertest

# Install Playwright for E2E tests
npm install -D @playwright/test

# Install testing utilities
npm install -D @testing-library/react @testing-library/jest-dom

# Install security testing tools
npm install -D snyk owasp-dependency-check

# Install load testing tools (k6)
# Download from: https://k6.io/docs/getting-started/installation/
```

### Step 2: Configure Jest (15 min)

**File:** `packages/auth/jest.config.js`

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
```

### Step 3: Create Test Setup (15 min)

**File:** `packages/auth/src/__tests__/setup.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

// Test database connection
const supabaseUrl = process.env.SUPABASE_URL_TEST || process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY_TEST || process.env.SUPABASE_ANON_KEY!;

export const testSupabase = createClient(supabaseUrl, supabaseKey);

// Clean up test data before each test
beforeEach(async () => {
  // Delete test users (emails starting with 'test_')
  await testSupabase
    .from('users')
    .delete()
    .like('email', 'test_%@example.com');
});

// Global test timeout
jest.setTimeout(10000); // 10 seconds

// Mock environment variables
process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-long!';
```

### Step 4: Create Test Fixtures (20 min)

**File:** `packages/auth/src/__tests__/fixtures.ts`

```typescript
export const testUsers = {
  validUser: {
    email: 'test_valid@example.com',
    password: 'SecurePassword123!',
    full_name: 'Test Valid User',
  },

  weakPassword: {
    email: 'test_weak@example.com',
    password: '12345', // Too weak
    full_name: 'Weak Password User',
  },

  invalidEmail: {
    email: 'not-an-email',
    password: 'SecurePassword123!',
    full_name: 'Invalid Email User',
  },

  existingUser: {
    email: 'test_existing@example.com',
    password: 'ExistingPass123!',
    full_name: 'Existing User',
  },
};

export const mockJwtPayload = {
  userId: '123e4567-e89b-12d3-a456-426614174000',
  email: 'test@example.com',
  role: 'user',
};

export const mockTokens = {
  validAccessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  expiredAccessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  invalidToken: 'invalid.token.here',
};
```

---

## 🧪 Test Cases to Implement

### Phase 1: Unit Tests (4 hours)

#### Test 1.1: JWT Token Generation

**File:** `packages/auth/src/__tests__/jwt.test.ts`

```typescript
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
} from '../jwt';
import { mockJwtPayload } from './fixtures';

describe('JWT Token Generation', () => {
  describe('generateAccessToken', () => {
    test('should generate valid access token', () => {
      const token = generateAccessToken(mockJwtPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    test('should include payload data in token', () => {
      const token = generateAccessToken(mockJwtPayload);
      const decoded = verifyAccessToken(token);

      expect(decoded.userId).toBe(mockJwtPayload.userId);
      expect(decoded.email).toBe(mockJwtPayload.email);
      expect(decoded.role).toBe(mockJwtPayload.role);
    });

    test('should set correct expiration (15 minutes)', () => {
      const token = generateAccessToken(mockJwtPayload);
      const decoded = verifyAccessToken(token);

      const now = Math.floor(Date.now() / 1000);
      const expectedExpiry = now + (15 * 60); // 15 minutes

      expect(decoded.exp).toBeGreaterThan(now);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 5); // 5s tolerance
    });

    test('should include issuer', () => {
      const token = generateAccessToken(mockJwtPayload);
      const decoded = verifyAccessToken(token);

      expect(decoded.iss).toBe('nexus-hub');
    });
  });

  describe('generateRefreshToken', () => {
    test('should generate valid refresh token', () => {
      const token = generateRefreshToken('user-123');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    test('should set 7 day expiration', () => {
      const token = generateRefreshToken('user-123');
      const decoded = verifyRefreshToken(token);

      const now = Math.floor(Date.now() / 1000);
      const expectedExpiry = now + (7 * 24 * 60 * 60); // 7 days

      expect(decoded.exp).toBeGreaterThan(now);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 60); // 1min tolerance
    });

    test('should mark token as refresh type', () => {
      const token = generateRefreshToken('user-123');
      const decoded = verifyRefreshToken(token);

      expect(decoded.type).toBe('refresh');
    });
  });

  describe('verifyAccessToken', () => {
    test('should verify valid token', () => {
      const token = generateAccessToken(mockJwtPayload);

      expect(() => verifyAccessToken(token)).not.toThrow();
    });

    test('should reject invalid token', () => {
      expect(() => verifyAccessToken('invalid.token.here')).toThrow('Invalid access token');
    });

    test('should reject expired token', async () => {
      // Mock token that expired 1 hour ago
      const expiredPayload = {
        ...mockJwtPayload,
        exp: Math.floor(Date.now() / 1000) - 3600,
      };

      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        expiredPayload,
        process.env.JWT_SECRET!,
        { expiresIn: '-1h' }
      );

      expect(() => verifyAccessToken(expiredToken)).toThrow();
    });

    test('should reject token with wrong signature', () => {
      const jwt = require('jsonwebtoken');
      const wrongToken = jwt.sign(mockJwtPayload, 'wrong-secret');

      expect(() => verifyAccessToken(wrongToken)).toThrow();
    });
  });
});
```

#### Test 1.2: Password Hashing

**File:** `packages/auth/src/__tests__/password.test.ts`

```typescript
import { hashPassword, comparePassword } from '../jwt';

describe('Password Hashing', () => {
  const plainPassword = 'MySecurePassword123!';

  describe('hashPassword', () => {
    test('should hash password successfully', async () => {
      const hash = await hashPassword(plainPassword);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(plainPassword);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are long
    });

    test('should generate unique hashes for same password', async () => {
      const hash1 = await hashPassword(plainPassword);
      const hash2 = await hashPassword(plainPassword);

      expect(hash1).not.toBe(hash2); // Different salts
    });

    test('should use bcrypt (starts with $2b$)', async () => {
      const hash = await hashPassword(plainPassword);

      expect(hash).toMatch(/^\$2b\$/);
    });

    test('should use 10 rounds', async () => {
      const hash = await hashPassword(plainPassword);

      expect(hash).toMatch(/^\$2b\$10\$/); // 10 rounds
    });
  });

  describe('comparePassword', () => {
    test('should return true for correct password', async () => {
      const hash = await hashPassword(plainPassword);
      const result = await comparePassword(plainPassword, hash);

      expect(result).toBe(true);
    });

    test('should return false for incorrect password', async () => {
      const hash = await hashPassword(plainPassword);
      const result = await comparePassword('WrongPassword123!', hash);

      expect(result).toBe(false);
    });

    test('should be case-sensitive', async () => {
      const hash = await hashPassword('Password123!');
      const result = await comparePassword('password123!', hash);

      expect(result).toBe(false);
    });
  });
});
```

#### Test 1.3: User Registration

**File:** `packages/auth/src/__tests__/register.test.ts`

```typescript
import { register } from '../jwt';
import { testUsers } from './fixtures';
import { testSupabase } from './setup';

describe('User Registration', () => {
  test('should register new user successfully', async () => {
    const user = await register(testUsers.validUser);

    expect(user).toBeDefined();
    expect(user.email).toBe(testUsers.validUser.email);
    expect(user.full_name).toBe(testUsers.validUser.full_name);
    expect(user.id).toBeDefined();
    expect(user.password_hash).toBeUndefined(); // Should not return hash
  });

  test('should hash password before storing', async () => {
    const user = await register(testUsers.validUser);

    // Fetch from DB directly
    const { data } = await testSupabase
      .from('users')
      .select('password_hash')
      .eq('id', user.id)
      .single();

    expect(data?.password_hash).toBeDefined();
    expect(data?.password_hash).not.toBe(testUsers.validUser.password);
    expect(data?.password_hash).toMatch(/^\$2b\$/); // bcrypt hash
  });

  test('should reject duplicate email', async () => {
    // Register first user
    await register(testUsers.existingUser);

    // Try to register again with same email
    await expect(register(testUsers.existingUser)).rejects.toThrow(
      'User with this email already exists'
    );
  });

  test('should validate email format', async () => {
    await expect(register(testUsers.invalidEmail)).rejects.toThrow();
  });

  test('should create user with timestamp', async () => {
    const user = await register(testUsers.validUser);

    expect(user.created_at).toBeDefined();
    expect(new Date(user.created_at).getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('should handle optional full_name', async () => {
    const userWithoutName = {
      email: 'test_noname@example.com',
      password: 'SecurePass123!',
    };

    const user = await register(userWithoutName);

    expect(user).toBeDefined();
    expect(user.full_name).toBeNull();
  });
});
```

#### Test 1.4: User Login

**File:** `packages/auth/src/__tests__/login.test.ts`

```typescript
import { register, login } from '../jwt';
import { testUsers } from './fixtures';

describe('User Login', () => {
  beforeEach(async () => {
    // Register a user for login tests
    await register(testUsers.validUser);
  });

  test('should login with correct credentials', async () => {
    const result = await login({
      email: testUsers.validUser.email,
      password: testUsers.validUser.password,
    });

    expect(result).toBeDefined();
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.email).toBe(testUsers.validUser.email);
  });

  test('should return access and refresh tokens', async () => {
    const result = await login({
      email: testUsers.validUser.email,
      password: testUsers.validUser.password,
    });

    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.refreshToken.split('.')).toHaveLength(3);
  });

  test('should reject incorrect password', async () => {
    await expect(
      login({
        email: testUsers.validUser.email,
        password: 'WrongPassword123!',
      })
    ).rejects.toThrow('Invalid password');
  });

  test('should reject non-existent user', async () => {
    await expect(
      login({
        email: 'nonexistent@example.com',
        password: 'AnyPassword123!',
      })
    ).rejects.toThrow('User not found');
  });

  test('should not leak user existence in error message', async () => {
    // Security: Don't tell attackers if email exists or password is wrong

    const error1 = await login({
      email: 'nonexistent@example.com',
      password: 'Pass123!',
    }).catch(e => e.message);

    const error2 = await login({
      email: testUsers.validUser.email,
      password: 'WrongPass123!',
    }).catch(e => e.message);

    // Both should say "User not found" or "Invalid credentials"
    // NOT "Invalid password" (leaks that user exists)
    expect(error1).toBe(error2);
  });

  test('should generate different tokens on each login', async () => {
    const result1 = await login({
      email: testUsers.validUser.email,
      password: testUsers.validUser.password,
    });

    const result2 = await login({
      email: testUsers.validUser.email,
      password: testUsers.validUser.password,
    });

    expect(result1.accessToken).not.toBe(result2.accessToken);
    expect(result1.refreshToken).not.toBe(result2.refreshToken);
  });
});
```

**Run unit tests:**
```bash
cd packages/auth
npm test
```

**Expected output:**
```
PASS  src/__tests__/jwt.test.ts
PASS  src/__tests__/password.test.ts
PASS  src/__tests__/register.test.ts
PASS  src/__tests__/login.test.ts

Test Suites: 4 passed, 4 total
Tests:       24 passed, 24 total
Coverage:    85.2%
```

---

### Phase 2: Integration Tests (4 hours)

#### Test 2.1: Complete Auth Flow

**File:** `apps/web/__tests__/integration/auth-flow.test.ts`

```typescript
import request from 'supertest';

// Note: You'll need to create a test server instance
// For now, assume app runs on localhost:3000

const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';

describe('Complete Authentication Flow', () => {
  const testUser = {
    email: `test_${Date.now()}@example.com`,
    password: 'SecurePassword123!',
    full_name: 'Integration Test User',
  };

  let accessToken: string;
  let refreshToken: string;

  test('Step 1: Register new user', async () => {
    const response = await request(API_URL)
      .post('/api/auth/register')
      .send(testUser)
      .expect(201);

    expect(response.body).toHaveProperty('message');
    expect(response.body.user.email).toBe(testUser.email);
  });

  test('Step 2: Login with credentials', async () => {
    const response = await request(API_URL)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    expect(response.body).toHaveProperty('message', 'Login successful');
    expect(response.body.user.email).toBe(testUser.email);

    // Extract cookies
    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();

    // Parse tokens from cookies
    const tokenCookie = cookies.find((c: string) => c.startsWith('nexus_token='));
    const refreshCookie = cookies.find((c: string) => c.startsWith('nexus_refresh_token='));

    expect(tokenCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();

    accessToken = tokenCookie.split(';')[0].split('=')[1];
    refreshToken = refreshCookie.split(';')[0].split('=')[1];
  });

  test('Step 3: Access protected route with token', async () => {
    // Assuming you have a protected route /api/user/profile
    const response = await request(API_URL)
      .get('/api/user/profile')
      .set('Cookie', [`nexus_token=${accessToken}`])
      .expect(200);

    expect(response.body.user.email).toBe(testUser.email);
  });

  test('Step 4: Refresh access token', async () => {
    const response = await request(API_URL)
      .post('/api/auth/refresh')
      .set('Cookie', [`nexus_refresh_token=${refreshToken}`])
      .expect(200);

    expect(response.body).toHaveProperty('message');

    // Should receive new access token
    const cookies = response.headers['set-cookie'];
    const newTokenCookie = cookies.find((c: string) => c.startsWith('nexus_token='));
    const newAccessToken = newTokenCookie.split(';')[0].split('=')[1];

    expect(newAccessToken).toBeDefined();
    expect(newAccessToken).not.toBe(accessToken); // New token
  });

  test('Step 5: Logout', async () => {
    const response = await request(API_URL)
      .post('/api/auth/logout')
      .set('Cookie', [`nexus_token=${accessToken}`])
      .expect(200);

    expect(response.body).toHaveProperty('message');

    // Cookies should be cleared
    const cookies = response.headers['set-cookie'];
    expect(cookies.some((c: string) => c.includes('nexus_token=;'))).toBe(true);
  });

  test('Step 6: Cannot access protected route after logout', async () => {
    await request(API_URL)
      .get('/api/user/profile')
      .set('Cookie', [`nexus_token=${accessToken}`]) // Old token
      .expect(401);
  });
});
```

#### Test 2.2: Error Handling

**File:** `apps/web/__tests__/integration/auth-errors.test.ts`

```typescript
import request from 'supertest';

const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';

describe('Authentication Error Handling', () => {
  describe('POST /api/auth/register', () => {
    test('should return 400 for missing email', async () => {
      const response = await request(API_URL)
        .post('/api/auth/register')
        .send({ password: 'SecurePass123!' })
        .expect(400);

      expect(response.body.error).toContain('Email');
    });

    test('should return 400 for missing password', async () => {
      const response = await request(API_URL)
        .post('/api/auth/register')
        .send({ email: 'test@example.com' })
        .expect(400);

      expect(response.body.error).toContain('password');
    });

    test('should return 400 for invalid email format', async () => {
      const response = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'SecurePass123!',
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid email');
    });

    test('should return 400 for weak password', async () => {
      const response = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: '12345', // Too weak
        })
        .expect(400);

      expect(response.body.error).toContain('Password must be at least');
    });

    test('should return 409 for duplicate email', async () => {
      const user = {
        email: 'duplicate@example.com',
        password: 'SecurePass123!',
      };

      // Register once
      await request(API_URL).post('/api/auth/register').send(user).expect(201);

      // Try again
      const response = await request(API_URL)
        .post('/api/auth/register')
        .send(user)
        .expect(409);

      expect(response.body.error).toContain('already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    test('should return 401 for invalid credentials', async () => {
      const response = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'AnyPassword123!',
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid');
    });

    test('should return 400 for missing email', async () => {
      await request(API_URL)
        .post('/api/auth/login')
        .send({ password: 'Pass123!' })
        .expect(400);
    });
  });

  describe('POST /api/auth/refresh', () => {
    test('should return 401 for missing refresh token', async () => {
      await request(API_URL)
        .post('/api/auth/refresh')
        .expect(401);
    });

    test('should return 401 for invalid refresh token', async () => {
      await request(API_URL)
        .post('/api/auth/refresh')
        .set('Cookie', ['nexus_refresh_token=invalid.token.here'])
        .expect(401);
    });
  });
});
```

**Run integration tests:**
```bash
cd apps/web
npm run test:integration
```

---

### Phase 3: Security Tests (3 hours)

#### Test 3.1: SQL Injection Prevention

**File:** `apps/web/__tests__/security/sql-injection.test.ts`

```typescript
import request from 'supertest';

const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';

describe('SQL Injection Prevention', () => {
  const sqlInjectionPayloads = [
    "'; DROP TABLE users; --",
    "admin' OR '1'='1",
    "' OR 1=1 --",
    "admin' --",
    "' UNION SELECT NULL, NULL, NULL --",
  ];

  sqlInjectionPayloads.forEach((payload) => {
    test(`should block SQL injection attempt: ${payload}`, async () => {
      const response = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: payload,
          password: 'any password',
        });

      // Should return 400 or 401, NOT 500 (which indicates SQL error)
      expect([400, 401]).toContain(response.status);
      expect(response.body.error).not.toContain('SQL');
      expect(response.body.error).not.toContain('syntax');
    });
  });

  test('should safely handle special characters in email', async () => {
    const response = await request(API_URL)
      .post('/api/auth/register')
      .send({
        email: "test+special'chars@example.com",
        password: 'SecurePass123!',
      });

    // Should either accept (if valid email) or reject gracefully
    expect([201, 400]).toContain(response.status);
  });
});
```

#### Test 3.2: XSS Prevention

**File:** `apps/web/__tests__/security/xss.test.ts`

```typescript
import request from 'supertest';

const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';

describe('XSS Prevention', () => {
  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert("XSS")>',
    'javascript:alert("XSS")',
    '<svg onload=alert("XSS")>',
  ];

  xssPayloads.forEach((payload) => {
    test(`should sanitize XSS attempt: ${payload}`, async () => {
      const response = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
          full_name: payload,
        });

      if (response.status === 201) {
        // If registration succeeded, check that payload is sanitized
        expect(response.body.user.full_name).not.toContain('<script');
        expect(response.body.user.full_name).not.toContain('javascript:');
      }
    });
  });

  test('should set httpOnly cookies (prevents XSS cookie theft)', async () => {
    const response = await request(API_URL)
      .post('/api/auth/login')
      .send({
        email: 'existing@example.com',
        password: 'SecurePass123!',
      });

    const cookies = response.headers['set-cookie'] || [];
    const tokenCookie = cookies.find((c: string) => c.startsWith('nexus_token='));

    expect(tokenCookie).toContain('HttpOnly');
  });
});
```

#### Test 3.3: JWT Security

**File:** `apps/web/__tests__/security/jwt-security.test.ts`

```typescript
import request from 'supertest';
import jwt from 'jsonwebtoken';

const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';

describe('JWT Security', () => {
  test('should reject tampered JWT', async () => {
    // Create valid token
    const validPayload = {
      userId: '123',
      email: 'test@example.com',
      role: 'user',
    };
    const validToken = jwt.sign(validPayload, process.env.JWT_SECRET!, { expiresIn: '15m' });

    // Tamper with token (change role to admin)
    const tamperedPayload = {
      userId: '123',
      email: 'test@example.com',
      role: 'admin', // ← Changed!
    };
    const tamperedToken = jwt.sign(tamperedPayload, 'wrong-secret', { expiresIn: '15m' });

    // Try to access with tampered token
    const response = await request(API_URL)
      .get('/api/user/profile')
      .set('Cookie', [`nexus_token=${tamperedToken}`]);

    expect([401, 403]).toContain(response.status);
  });

  test('should reject expired JWT', async () => {
    const expiredPayload = {
      userId: '123',
      email: 'test@example.com',
    };
    const expiredToken = jwt.sign(expiredPayload, process.env.JWT_SECRET!, { expiresIn: '-1h' });

    const response = await request(API_URL)
      .get('/api/user/profile')
      .set('Cookie', [`nexus_token=${expiredToken}`]);

    expect(response.status).toBe(401);
  });

  test('should use secure cookies in production', async () => {
    // Mock production environment
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const response = await request(API_URL)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

    const cookies = response.headers['set-cookie'] || [];
    const tokenCookie = cookies.find((c: string) => c.startsWith('nexus_token='));

    expect(tokenCookie).toContain('Secure'); // HTTPS only in production

    process.env.NODE_ENV = oldEnv;
  });

  test('should use sameSite protection', async () => {
    const response = await request(API_URL)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

    const cookies = response.headers['set-cookie'] || [];
    const tokenCookie = cookies.find((c: string) => c.startsWith('nexus_token='));

    expect(tokenCookie).toContain('SameSite=Strict');
  });
});
```

**Run security tests:**
```bash
cd apps/web
npm run test:security
```

---

### Phase 4: Performance Tests (2 hours)

#### Test 4.1: Load Testing with k6

**File:** `tests/load/auth-load.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp up to 50 users
    { duration: '1m', target: 100 },   // Stay at 100 users
    { duration: '30s', target: 200 },  // Spike to 200 users
    { duration: '1m', target: 100 },   // Down to 100 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    errors: ['rate<0.1'],             // Error rate must be below 10%
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:3000';

export default function () {
  // Test registration
  const email = `load_test_${Date.now()}_${Math.random()}@example.com`;
  const registerPayload = JSON.stringify({
    email,
    password: 'LoadTest123!',
    full_name: 'Load Test User',
  });

  let response = http.post(
    `${API_URL}/api/auth/register`,
    registerPayload,
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(response, {
    'registration status is 201': (r) => r.status === 201,
    'registration completes in <500ms': (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  sleep(1);

  // Test login
  const loginPayload = JSON.stringify({
    email,
    password: 'LoadTest123!',
  });

  response = http.post(
    `${API_URL}/api/auth/login`,
    loginPayload,
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(response, {
    'login status is 200': (r) => r.status === 200,
    'login completes in <300ms': (r) => r.timings.duration < 300,
    'returns access token': (r) => r.headers['Set-Cookie'].includes('nexus_token'),
  }) || errorRate.add(1);

  sleep(1);
}
```

**Run load test:**
```bash
cd tests/load
k6 run auth-load.js
```

**Expected output:**
```
scenarios: (100.00%) 1 scenario, 200 max VUs
     ✓ registration status is 201
     ✓ registration completes in <500ms
     ✓ login status is 200
     ✓ login completes in <300ms
     ✓ returns access token

http_req_duration..........: avg=185ms min=45ms med=150ms max=480ms p(95)=420ms
errors.....................: 2.5%
```

---

## ✅ Definition of Done

Before marking task complete, verify:

### Unit Tests:
- [ ] All 24+ unit tests pass
- [ ] Test coverage >85%
- [ ] JWT generation/verification tested
- [ ] Password hashing tested
- [ ] Register/login logic tested

### Integration Tests:
- [ ] Complete auth flow tested (register → login → access → refresh → logout)
- [ ] Error handling tested (400, 401, 409 status codes)
- [ ] Cookie management tested

### Security Tests:
- [ ] SQL injection attempts blocked
- [ ] XSS attempts sanitized
- [ ] JWT tampering rejected
- [ ] httpOnly + Secure + SameSite cookies
- [ ] 0 critical vulnerabilities (npm audit, snyk)

### Performance Tests:
- [ ] Login response time <300ms (p95)
- [ ] Registration response time <500ms (p95)
- [ ] System handles 100 concurrent users
- [ ] Error rate <10% under load

### Documentation:
- [ ] Test README created
- [ ] Test data fixtures documented
- [ ] CI/CD integration documented

---

## 📊 Deliverables

**Create these files:**

1. `packages/auth/src/__tests__/`
   - jwt.test.ts
   - password.test.ts
   - register.test.ts
   - login.test.ts
   - setup.ts
   - fixtures.ts

2. `apps/web/__tests__/integration/`
   - auth-flow.test.ts
   - auth-errors.test.ts

3. `apps/web/__tests__/security/`
   - sql-injection.test.ts
   - xss.test.ts
   - jwt-security.test.ts

4. `tests/load/`
   - auth-load.js

5. `TEST_REPORT.md`
   - Test results summary
   - Coverage report
   - Security findings
   - Performance benchmarks

---

## 🚀 After Task T1.1

**Next tasks for you:**

**T1.2: EcoID Testing** (when Qwen completes EcoID)
- Test EcoID generation (format validation)
- Test EcoID service (createUser, verifyCredentials)
- Test cross-project access

**T1.3: API Key Testing** (after Qwen's Task 1.2)
- Test API key generation
- Test key validation
- Test rate limiting per key

**T2.1: Dream People Testing** (Phase 2)
- Test portfolio calculations
- Test human capital formula accuracy
- Test analytics engine

---

## 💬 Daily Updates

Post in Discord/GitHub Issues:

```
**Date:** 2025-10-10
**Task:** T1.1 - JWT Auth Testing

**Progress:**
- ✅ Unit tests for JWT generation (8 tests)
- ✅ Unit tests for password hashing (6 tests)
- 🚧 Working on: Integration tests
- ⏳ Next: Security tests

**Test Results:**
- Unit tests: 14/14 passed
- Coverage: 82% (target: 85%)

**Bugs Found:**
1. [CRITICAL] SQL injection possible in email field
2. [MEDIUM] Password validation too weak (6 chars)

**Blockers:**
- None
```

---

## 📚 Resources

**Testing Documentation:**
- Jest: https://jestjs.io/docs/getting-started
- Supertest: https://github.com/ladjs/supertest
- Playwright: https://playwright.dev/docs/intro
- k6: https://k6.io/docs/

**Security Resources:**
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- JWT Best Practices: https://tools.ietf.org/html/rfc8725
- npm audit: https://docs.npmjs.com/cli/v8/commands/npm-audit

---

## 🏆 Success Metrics

**Your KPIs:**
- Test coverage: >85%
- Critical bugs found: >5
- Security vulnerabilities: 0
- Performance: p95 <500ms
- Test execution time: <5 minutes

**You're the last line of defense before production!** 🛡️

Good luck, Grok! 🧪 Let me know when you need help!

---

**Alexey**
Founder, Nexus Ecosystem
