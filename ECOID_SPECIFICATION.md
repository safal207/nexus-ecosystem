# 🆔 EcoID - Unified Identity System

**Version:** 1.0.0
**Created:** 2025-10-10
**Status:** 🔥 Ready for Implementation

---

## 📋 Executive Summary

**EcoID** is the universal identifier for all users across the Nexus Ecosystem. One ID, one profile, seamless access to all platforms.

```
┌─────────────────────────────────────────────┐
│         EcoID: eco_usr_a1b2c3d4e5f6        │
│                                             │
│  Name: John Smith                          │
│  Email: john@example.com                   │
│  Created: 2025-10-10                       │
│  Verified: ✅                               │
└─────────────────────────────────────────────┘
        ↓           ↓            ↓
   [Sales CRM] [Portfolio] [Testing Hub]
   [Liminal]   [Resonance] [AGI Safety]
```

**Benefits:**
- ✅ Single registration for all platforms
- ✅ Unified profile across projects
- ✅ One subscription = access everywhere
- ✅ Privacy-first (user controls data sharing)
- ✅ Easy to migrate between platforms

---

## 🎯 EcoID Format Specification

### Structure

```
eco_<type>_<random_22_chars>

Examples:
- eco_usr_a1b2c3d4e5f6g7h8i9j0k1  (User)
- eco_org_m9n8o7p6q5r4s3t2u1v0w9  (Organization)
- eco_api_x7y6z5a4b3c2d1e0f9g8h7  (API Key)
- eco_ses_k2j3i4h5g6f7e8d9c0b1a2  (Session)
```

### Format Details

| Part | Description | Length | Example |
|------|-------------|--------|---------|
| Prefix | `eco_` | 4 chars | `eco_` |
| Type | Entity type | 3 chars | `usr` |
| Separator | `_` | 1 char | `_` |
| Random ID | Base62 random | 22 chars | `a1b2c3d4e5f6g7h8i9j0k1` |
| **Total** | | **30 chars** | `eco_usr_a1b2c3d4e5f6g7h8i9j0k1` |

### Entity Types

| Type | Code | Description | Example |
|------|------|-------------|---------|
| User | `usr` | Individual user account | `eco_usr_123abc` |
| Organization | `org` | Company/team account | `eco_org_456def` |
| API Key | `api` | Programmatic access | `eco_api_789ghi` |
| Session | `ses` | Active session token | `eco_ses_012jkl` |
| Transaction | `txn` | Payment/billing | `eco_txn_345mno` |
| Project | `prj` | User-created project | `eco_prj_678pqr` |

### Character Set (Base62)

```
0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ
```

**Rationale:**
- URL-safe (no special characters)
- Case-sensitive (more entropy)
- 62^22 = 2.27 × 10^39 possible IDs (no collisions)
- Human-readable prefix for debugging

---

## 🗄️ Database Schema

### Main EcoID Table (Supabase)

```sql
-- Core EcoID registry
CREATE TABLE eco_identities (
  -- Identity
  eco_id TEXT PRIMARY KEY CHECK (eco_id ~ '^eco_[a-z]{3}_[0-9a-zA-Z]{22}$'),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('usr', 'org', 'api', 'ses', 'txn', 'prj')),

  -- Metadata
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  timezone TEXT DEFAULT 'UTC',
  locale TEXT DEFAULT 'en',

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,

  -- Security
  security_level TEXT DEFAULT 'standard' CHECK (security_level IN ('standard', 'high', 'enterprise')),
  mfa_enabled BOOLEAN DEFAULT FALSE,

  -- GDPR
  gdpr_consent BOOLEAN DEFAULT FALSE,
  gdpr_consent_at TIMESTAMPTZ,
  data_retention_days INTEGER DEFAULT 365
);

-- Indexes for performance
CREATE INDEX idx_eco_identities_entity_type ON eco_identities(entity_type);
CREATE INDEX idx_eco_identities_status ON eco_identities(status);
CREATE INDEX idx_eco_identities_created_at ON eco_identities(created_at DESC);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_eco_identities_updated_at
BEFORE UPDATE ON eco_identities
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

### User Credentials (Separate for security)

```sql
-- Authentication credentials (separate table for security)
CREATE TABLE eco_credentials (
  eco_id TEXT PRIMARY KEY REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, -- bcrypt hash

  -- Password management
  password_changed_at TIMESTAMPTZ DEFAULT NOW(),
  password_reset_token TEXT,
  password_reset_expires TIMESTAMPTZ,

  -- Login tracking
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_login_ip INET,

  -- MFA
  mfa_secret TEXT, -- TOTP secret
  mfa_backup_codes TEXT[], -- Array of backup codes

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eco_credentials_email ON eco_credentials(email);
```

### Project Access Control

```sql
-- Which EcoIDs can access which projects
CREATE TABLE eco_project_access (
  eco_id TEXT REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
  project_name TEXT NOT NULL, -- 'nexus-sales', 'dream-people', etc.
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'read_only', 'api_only')),

  -- Permissions (JSON for flexibility)
  permissions JSONB DEFAULT '{}',

  -- Access metadata
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by TEXT REFERENCES eco_identities(eco_id),
  expires_at TIMESTAMPTZ, -- NULL = permanent

  PRIMARY KEY (eco_id, project_name)
);

CREATE INDEX idx_eco_project_access_eco_id ON eco_project_access(eco_id);
CREATE INDEX idx_eco_project_access_project ON eco_project_access(project_name);

-- Example permissions JSONB:
-- {
--   "leads.create": true,
--   "leads.read": true,
--   "leads.update": true,
--   "leads.delete": false,
--   "api.access": true,
--   "export.data": false
-- }
```

### Profile Data (Cross-project)

```sql
-- Extended profile information
CREATE TABLE eco_profiles (
  eco_id TEXT PRIMARY KEY REFERENCES eco_identities(eco_id) ON DELETE CASCADE,

  -- Personal info
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  company TEXT,
  job_title TEXT,

  -- Social
  linkedin_url TEXT,
  twitter_handle TEXT,
  github_username TEXT,

  -- Preferences
  email_notifications BOOLEAN DEFAULT TRUE,
  marketing_emails BOOLEAN DEFAULT FALSE,

  -- Privacy settings
  profile_visibility TEXT DEFAULT 'private' CHECK (profile_visibility IN ('public', 'connections', 'private')),
  data_sharing_consent JSONB DEFAULT '{}', -- Which projects can access what data

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example data_sharing_consent:
-- {
--   "nexus-sales": ["email", "name", "company"],
--   "dream-people": ["email", "name"],
--   "testing-hub": ["email", "name", "company", "linkedin"]
-- }
```

### Activity Log (Audit Trail)

```sql
-- All actions for GDPR compliance
CREATE TABLE eco_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  eco_id TEXT REFERENCES eco_identities(eco_id) ON DELETE SET NULL,

  -- Action details
  action TEXT NOT NULL, -- 'login', 'logout', 'project.access', 'data.export', etc.
  project_name TEXT,
  resource_type TEXT, -- 'lead', 'portfolio', 'api_key'
  resource_id TEXT,

  -- Context
  ip_address INET,
  user_agent TEXT,
  location JSONB, -- {country, city}

  -- Result
  status TEXT CHECK (status IN ('success', 'failure', 'pending')),
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eco_activity_log_eco_id ON eco_activity_log(eco_id, created_at DESC);
CREATE INDEX idx_eco_activity_log_action ON eco_activity_log(action);

-- Auto-delete old logs (GDPR compliance)
CREATE OR REPLACE FUNCTION delete_old_activity_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM eco_activity_log WHERE created_at < NOW() - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;

-- Run daily
SELECT cron.schedule('delete-old-logs', '0 2 * * *', 'SELECT delete_old_activity_logs()');
```

### Sessions (JWT Tracking)

```sql
-- Active sessions for security monitoring
CREATE TABLE eco_sessions (
  session_id TEXT PRIMARY KEY, -- eco_ses_xxxxx
  eco_id TEXT REFERENCES eco_identities(eco_id) ON DELETE CASCADE,

  -- JWT tokens
  access_token_hash TEXT NOT NULL, -- SHA256 of JWT
  refresh_token_hash TEXT NOT NULL,

  -- Session metadata
  device_type TEXT, -- 'web', 'mobile', 'api'
  device_name TEXT, -- 'Chrome on Windows', 'iPhone 15'
  ip_address INET,
  location JSONB,

  -- Expiration
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,

  -- Status
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eco_sessions_eco_id ON eco_sessions(eco_id);
CREATE INDEX idx_eco_sessions_expires ON eco_sessions(refresh_expires_at);

-- Auto-delete expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM eco_sessions WHERE refresh_expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule('cleanup-sessions', '0 * * * *', 'SELECT cleanup_expired_sessions()');
```

---

## 💻 Implementation Code

### 1. EcoID Generator

```typescript
// nexus-ecosystem/packages/eco-id/src/generator.ts

import { randomBytes } from 'crypto';

const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export type EcoIDType = 'usr' | 'org' | 'api' | 'ses' | 'txn' | 'prj';

export class EcoIDGenerator {
  /**
   * Generate a new EcoID
   * @param type Entity type
   * @returns EcoID string (e.g., eco_usr_a1b2c3d4e5f6g7h8i9j0k1)
   */
  static generate(type: EcoIDType): string {
    const randomPart = this.generateRandomBase62(22);
    return `eco_${type}_${randomPart}`;
  }

  /**
   * Generate random Base62 string
   * @param length Number of characters
   * @returns Random Base62 string
   */
  private static generateRandomBase62(length: number): string {
    const bytes = randomBytes(length);
    let result = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = bytes[i] % BASE62_CHARS.length;
      result += BASE62_CHARS[randomIndex];
    }

    return result;
  }

  /**
   * Validate EcoID format
   * @param ecoId EcoID string to validate
   * @returns True if valid
   */
  static isValid(ecoId: string): boolean {
    const regex = /^eco_[a-z]{3}_[0-9a-zA-Z]{22}$/;
    return regex.test(ecoId);
  }

  /**
   * Extract type from EcoID
   * @param ecoId EcoID string
   * @returns Entity type or null if invalid
   */
  static getType(ecoId: string): EcoIDType | null {
    if (!this.isValid(ecoId)) return null;
    const type = ecoId.split('_')[1] as EcoIDType;
    return type;
  }

  /**
   * Check if EcoID is of specific type
   * @param ecoId EcoID string
   * @param type Expected type
   * @returns True if matches
   */
  static isType(ecoId: string, type: EcoIDType): boolean {
    return this.getType(ecoId) === type;
  }
}

// Usage example:
// const userId = EcoIDGenerator.generate('usr'); // eco_usr_a1b2c3d4e5f6g7h8i9j0k1
// const isValid = EcoIDGenerator.isValid(userId); // true
// const type = EcoIDGenerator.getType(userId); // 'usr'
```

### 2. EcoID Service (Database Operations)

```typescript
// nexus-ecosystem/packages/eco-id/src/service.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { EcoIDGenerator, EcoIDType } from './generator';
import bcrypt from 'bcryptjs';

export interface CreateEcoIDParams {
  type: EcoIDType;
  email?: string;
  password?: string;
  displayName?: string;
  metadata?: Record<string, any>;
}

export interface EcoIdentity {
  ecoId: string;
  entityType: EcoIDType;
  displayName: string | null;
  email?: string;
  verified: boolean;
  status: 'active' | 'suspended' | 'deleted';
  createdAt: Date;
}

export class EcoIDService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Create a new EcoID with credentials
   */
  async createUser(params: CreateEcoIDParams): Promise<EcoIdentity> {
    const { email, password, displayName } = params;

    if (!email || !password) {
      throw new Error('Email and password required for user creation');
    }

    // Check if email already exists
    const { data: existing } = await this.supabase
      .from('eco_credentials')
      .select('eco_id')
      .eq('email', email)
      .single();

    if (existing) {
      throw new Error('Email already registered');
    }

    // Generate EcoID
    const ecoId = EcoIDGenerator.generate('usr');

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create identity
    const { error: identityError } = await this.supabase
      .from('eco_identities')
      .insert({
        eco_id: ecoId,
        entity_type: 'usr',
        display_name: displayName || email.split('@')[0],
        status: 'active',
        verified: false,
      });

    if (identityError) throw identityError;

    // Create credentials
    const { error: credentialsError } = await this.supabase
      .from('eco_credentials')
      .insert({
        eco_id: ecoId,
        email,
        password_hash: passwordHash,
      });

    if (credentialsError) throw credentialsError;

    // Create profile
    await this.supabase.from('eco_profiles').insert({
      eco_id: ecoId,
    });

    // Grant default project access
    await this.grantProjectAccess(ecoId, 'nexus-hub', 'member');

    return this.getIdentity(ecoId);
  }

  /**
   * Get identity by EcoID
   */
  async getIdentity(ecoId: string): Promise<EcoIdentity> {
    const { data, error } = await this.supabase
      .from('eco_identities')
      .select('*')
      .eq('eco_id', ecoId)
      .single();

    if (error || !data) throw new Error('Identity not found');

    return {
      ecoId: data.eco_id,
      entityType: data.entity_type,
      displayName: data.display_name,
      verified: data.verified,
      status: data.status,
      createdAt: new Date(data.created_at),
    };
  }

  /**
   * Get identity by email
   */
  async getIdentityByEmail(email: string): Promise<EcoIdentity> {
    const { data, error } = await this.supabase
      .from('eco_credentials')
      .select('eco_id')
      .eq('email', email)
      .single();

    if (error || !data) throw new Error('User not found');

    return this.getIdentity(data.eco_id);
  }

  /**
   * Verify credentials
   */
  async verifyCredentials(email: string, password: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('eco_credentials')
      .select('eco_id, password_hash')
      .eq('email', email)
      .single();

    if (error || !data) return null;

    const valid = await bcrypt.compare(password, data.password_hash);
    return valid ? data.eco_id : null;
  }

  /**
   * Grant project access
   */
  async grantProjectAccess(
    ecoId: string,
    projectName: string,
    role: 'owner' | 'admin' | 'member' | 'read_only' | 'api_only'
  ): Promise<void> {
    const { error } = await this.supabase.from('eco_project_access').upsert({
      eco_id: ecoId,
      project_name: projectName,
      role,
    });

    if (error) throw error;
  }

  /**
   * Check project access
   */
  async hasProjectAccess(ecoId: string, projectName: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('eco_project_access')
      .select('role')
      .eq('eco_id', ecoId)
      .eq('project_name', projectName)
      .single();

    return !error && !!data;
  }

  /**
   * Get user's accessible projects
   */
  async getUserProjects(ecoId: string): Promise<Array<{ project: string; role: string }>> {
    const { data, error } = await this.supabase
      .from('eco_project_access')
      .select('project_name, role')
      .eq('eco_id', ecoId);

    if (error) throw error;

    return data.map((row) => ({
      project: row.project_name,
      role: row.role,
    }));
  }

  /**
   * Log activity (for audit trail)
   */
  async logActivity(
    ecoId: string,
    action: string,
    context: {
      projectName?: string;
      resourceType?: string;
      resourceId?: string;
      ipAddress?: string;
      userAgent?: string;
      status: 'success' | 'failure' | 'pending';
      errorMessage?: string;
    }
  ): Promise<void> {
    await this.supabase.from('eco_activity_log').insert({
      eco_id: ecoId,
      action,
      project_name: context.projectName,
      resource_type: context.resourceType,
      resource_id: context.resourceId,
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
      status: context.status,
      error_message: context.errorMessage,
    });
  }

  /**
   * Update last seen timestamp
   */
  async updateLastSeen(ecoId: string): Promise<void> {
    await this.supabase
      .from('eco_identities')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('eco_id', ecoId);
  }
}

// Usage example:
// const service = new EcoIDService(SUPABASE_URL, SUPABASE_KEY);
// const identity = await service.createUser({
//   type: 'usr',
//   email: 'john@example.com',
//   password: 'SecurePass123!',
//   displayName: 'John Smith',
// });
```

### 3. Authentication with EcoID

```typescript
// nexus-ecosystem/packages/auth/src/eco-auth.ts

import jwt from 'jsonwebtoken';
import { EcoIDService } from '@nexus/eco-id';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  ecoId: string;
}

export class EcoAuth {
  private ecoIdService: EcoIDService;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.ecoIdService = new EcoIDService(supabaseUrl, supabaseKey);
  }

  /**
   * Register new user
   */
  async register(email: string, password: string, displayName?: string): Promise<AuthTokens> {
    // Create EcoID
    const identity = await this.ecoIdService.createUser({
      type: 'usr',
      email,
      password,
      displayName,
    });

    // Generate tokens
    return this.generateTokens(identity.ecoId);
  }

  /**
   * Login user
   */
  async login(email: string, password: string, context?: {
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuthTokens> {
    // Verify credentials
    const ecoId = await this.ecoIdService.verifyCredentials(email, password);

    if (!ecoId) {
      // Log failed attempt
      await this.ecoIdService.logActivity(email, 'login.failed', {
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        status: 'failure',
        errorMessage: 'Invalid credentials',
      });
      throw new Error('Invalid credentials');
    }

    // Log successful login
    await this.ecoIdService.logActivity(ecoId, 'login.success', {
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      status: 'success',
    });

    // Update last seen
    await this.ecoIdService.updateLastSeen(ecoId);

    // Generate tokens
    return this.generateTokens(ecoId);
  }

  /**
   * Generate JWT tokens
   */
  private generateTokens(ecoId: string): AuthTokens {
    const accessToken = jwt.sign(
      {
        ecoId,
        type: 'access',
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      {
        ecoId,
        type: 'refresh',
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return { accessToken, refreshToken, ecoId };
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): { ecoId: string } | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded.type !== 'access') return null;
      return { ecoId: decoded.ecoId };
    } catch {
      return null;
    }
  }

  /**
   * Refresh tokens
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;
      if (decoded.type !== 'refresh') throw new Error('Invalid token type');

      return this.generateTokens(decoded.ecoId);
    } catch {
      throw new Error('Invalid refresh token');
    }
  }
}
```

### 4. Middleware for EcoID Protection

```typescript
// nexus-ecosystem/packages/auth/src/middleware.ts

import { NextRequest, NextResponse } from 'next/server';
import { EcoAuth } from './eco-auth';

const auth = new EcoAuth(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function requireEcoID(req: NextRequest) {
  // Get token from cookie or Authorization header
  const token =
    req.cookies.get('eco_access_token')?.value ||
    req.headers.get('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify token
  const payload = auth.verifyAccessToken(token);

  if (!payload) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Attach EcoID to request
  (req as any).ecoId = payload.ecoId;

  return NextResponse.next();
}

export async function requireProjectAccess(req: NextRequest, projectName: string) {
  // First check EcoID
  const authResponse = await requireEcoID(req);
  if (authResponse.status !== 200) return authResponse;

  const ecoId = (req as any).ecoId;

  // Check project access
  const ecoIdService = new EcoIDService(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const hasAccess = await ecoIdService.hasProjectAccess(ecoId, projectName);

  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.next();
}
```

---

## 🔌 API Endpoints

### Authentication Endpoints

```typescript
// nexus-ecosystem/apps/hub/src/app/api/eco-auth/register/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { EcoAuth } from '@nexus/auth';

const auth = new EcoAuth(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { email, password, displayName } = await req.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    // Register user
    const tokens = await auth.register(email, password, displayName);

    // Set cookies
    const response = NextResponse.json({
      success: true,
      ecoId: tokens.ecoId,
      message: 'Registration successful',
    });

    response.cookies.set('eco_access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
    });

    response.cookies.set('eco_refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
```

```typescript
// nexus-ecosystem/apps/hub/src/app/api/eco-auth/login/route.ts

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    const tokens = await auth.login(email, password, {
      ipAddress: req.headers.get('x-forwarded-for') || req.ip,
      userAgent: req.headers.get('user-agent') || undefined,
    });

    const response = NextResponse.json({
      success: true,
      ecoId: tokens.ecoId,
    });

    // Set cookies (same as register)
    response.cookies.set('eco_access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60,
    });

    response.cookies.set('eco_refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
```

```typescript
// nexus-ecosystem/apps/hub/src/app/api/eco-auth/refresh/route.ts

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get('eco_refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
    }

    const tokens = await auth.refreshTokens(refreshToken);

    const response = NextResponse.json({ success: true });

    response.cookies.set('eco_access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
```

```typescript
// nexus-ecosystem/apps/hub/src/app/api/eco-auth/logout/route.ts

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ success: true, message: 'Logged out' });

  // Clear cookies
  response.cookies.delete('eco_access_token');
  response.cookies.delete('eco_refresh_token');

  return response;
}
```

### EcoID Management Endpoints

```typescript
// nexus-ecosystem/apps/hub/src/app/api/eco-id/me/route.ts

import { requireEcoID } from '@nexus/auth/middleware';
import { EcoIDService } from '@nexus/eco-id';

export async function GET(req: NextRequest) {
  // Require authentication
  const authResponse = await requireEcoID(req);
  if (authResponse.status !== 200) return authResponse;

  const ecoId = (req as any).ecoId;

  // Get identity
  const service = new EcoIDService(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const identity = await service.getIdentity(ecoId);
  const projects = await service.getUserProjects(ecoId);

  return NextResponse.json({
    ecoId: identity.ecoId,
    displayName: identity.displayName,
    verified: identity.verified,
    status: identity.status,
    projects,
  });
}
```

---

## 🌐 Integration Examples

### Example 1: AlexB Testing Hub Integration

```typescript
// AlexB/personal-hub-alexey/middleware.ts

import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  // Check for EcoID token first (new auth)
  const ecoToken = req.cookies.get('eco_access_token')?.value;

  if (ecoToken) {
    // Verify with Nexus Ecosystem
    const verifyResponse = await fetch('https://nexus.com/api/eco-auth/verify', {
      headers: { Authorization: `Bearer ${ecoToken}` },
    });

    if (verifyResponse.ok) {
      const { ecoId } = await verifyResponse.json();

      // Check project access
      const accessResponse = await fetch(
        `https://nexus.com/api/eco-id/${ecoId}/projects/testing-hub`
      );

      if (accessResponse.ok) {
        // User has access via EcoID
        return NextResponse.next();
      }
    }
  }

  // Fallback to existing Supabase auth (for gradual migration)
  const supabaseToken = req.cookies.get('sb-access-token')?.value;
  if (supabaseToken) {
    // Existing Supabase verification
    return supabaseAuthCheck(req);
  }

  // No valid auth
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/dashboard/:path*', '/projects/:path*'],
};
```

### Example 2: Nexus Sales Integration

```typescript
// nexus-sales/apps/web/middleware.ts

import { requireProjectAccess } from '@nexus/auth/middleware';

export async function middleware(req: NextRequest) {
  return requireProjectAccess(req, 'nexus-sales');
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
```

### Example 3: Cross-Project Data Access

```typescript
// dream-people/src/lib/get-user-sales-data.ts

export async function getUserSalesData(ecoId: string) {
  // Call Nexus Sales API with EcoID
  const response = await fetch(
    `https://nexus.com/api/gateway/sales/user/${ecoId}/summary`,
    {
      headers: {
        'X-EcoID': ecoId,
        'X-Project': 'dream-people',
      },
    }
  );

  if (!response.ok) return null;

  const data = await response.json();
  return {
    totalDeals: data.deals_count,
    revenue: data.total_revenue,
    commission: data.commission_earned,
  };
}
```

---

## 🔒 Security Considerations

### Password Requirements

```typescript
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 12) errors.push('Minimum 12 characters');
  if (!/[a-z]/.test(password)) errors.push('Must contain lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('Must contain uppercase letter');
  if (!/[0-9]/.test(password)) errors.push('Must contain number');
  if (!/[!@#$%^&*]/.test(password)) errors.push('Must contain special character');

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

### Rate Limiting

```typescript
// nexus-ecosystem/packages/middleware/src/rate-limit.ts

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

export async function rateLimit(
  req: NextRequest,
  key: string,
  limit: number,
  window: number // seconds
): Promise<NextResponse | null> {
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, window);
  }

  if (count > limit) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        retryAfter: await redis.ttl(key),
      },
      { status: 429 }
    );
  }

  return null;
}

// Usage in API route:
// const rateLimitResponse = await rateLimit(req, `login:${email}`, 5, 300); // 5 attempts per 5 min
// if (rateLimitResponse) return rateLimitResponse;
```

### GDPR Compliance

```typescript
// nexus-ecosystem/apps/hub/src/app/api/eco-id/export-data/route.ts

export async function POST(req: NextRequest) {
  const authResponse = await requireEcoID(req);
  if (authResponse.status !== 200) return authResponse;

  const ecoId = (req as any).ecoId;

  // Collect all user data from all projects
  const [identityData, profileData, projectsData, activityData] = await Promise.all([
    supabase.from('eco_identities').select('*').eq('eco_id', ecoId).single(),
    supabase.from('eco_profiles').select('*').eq('eco_id', ecoId).single(),
    supabase.from('eco_project_access').select('*').eq('eco_id', ecoId),
    supabase.from('eco_activity_log').select('*').eq('eco_id', ecoId).limit(1000),
  ]);

  // Aggregate data
  const exportData = {
    identity: identityData.data,
    profile: profileData.data,
    projects: projectsData.data,
    recentActivity: activityData.data,
    exportedAt: new Date().toISOString(),
  };

  // Generate JSON file
  return NextResponse.json(exportData, {
    headers: {
      'Content-Disposition': `attachment; filename="ecoid-${ecoId}-export.json"`,
    },
  });
}
```

---

## 📊 Analytics & Monitoring

### Key Metrics to Track

```typescript
// Dashborad queries
const metrics = {
  totalUsers: await supabase.from('eco_identities').select('count').eq('entity_type', 'usr'),

  activeUsers: await supabase
    .from('eco_identities')
    .select('count')
    .gte('last_seen_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),

  verifiedUsers: await supabase
    .from('eco_identities')
    .select('count')
    .eq('verified', true),

  crossProjectUsers: await supabase.rpc('count_users_with_multiple_projects'),

  loginAttempts: await supabase
    .from('eco_activity_log')
    .select('count')
    .eq('action', 'login.success')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000)),
};
```

---

## 🚀 Migration Plan

### Phase 1: Setup EcoID Infrastructure (Week 1)
- [ ] Create database tables
- [ ] Implement EcoID generator
- [ ] Implement EcoID service
- [ ] Create auth endpoints
- [ ] Deploy to staging

### Phase 2: Migrate AlexB Testing Hub (Week 2)
- [ ] Add EcoID middleware
- [ ] Dual auth support (EcoID + Supabase)
- [ ] Migrate existing users to EcoID
- [ ] Test cross-project access
- [ ] Deploy to production

### Phase 3: Integrate Other Projects (Week 3-4)
- [ ] Nexus Sales
- [ ] Dream People
- [ ] Liminal 2.0
- [ ] Test SSO flow

### Phase 4: Advanced Features (Week 5+)
- [ ] MFA (Two-Factor Authentication)
- [ ] Social login (Google, GitHub)
- [ ] API key management
- [ ] Organization accounts

---

## ✅ Success Criteria

- [ ] Users can register with one EcoID
- [ ] Single login gives access to all projects
- [ ] Profile synced across platforms
- [ ] Activity logged for GDPR compliance
- [ ] No performance degradation (<200ms auth check)
- [ ] 99.9% uptime
- [ ] Zero security vulnerabilities

---

## 📞 Next Steps

1. **Review this spec** - Confirm design decisions
2. **Setup Supabase** - Create tables from schema
3. **Implement generator** - Start with EcoID generation
4. **Build auth service** - JWT + EcoID integration
5. **Test thoroughly** - Unit + integration tests

---

**Questions?** Open GitHub issue: `nexus-ecosystem/issues/new?label=eco-id`

**Ready to build!** 🚀
