# 🚀 Qwen - START HERE: EcoID Implementation

**Date:** 2025-10-10
**Priority:** 🔥 P0 (Critical - Foundation of entire ecosystem)
**Estimated Time:** 20-24 hours (3 working days)

---

## 📋 Overview

Привет, Qwen! 👋

Ты будешь создавать **EcoID** - это единый идентификатор пользователя для всей Nexus экосистемы. Это самая важная часть всего проекта, так как от этого зависят все остальные системы.

**EcoID** = Один ID, который работает везде:
- ✅ Nexus Sales (CRM)
- ✅ Dream People (Portfolio)
- ✅ AlexB Testing Hub (QA Services)
- ✅ Liminal 2.0 (Psychology)
- ✅ Resonance & AGI Safety (Research)

**Формат EcoID:**
```
eco_usr_a1b2c3d4e5f6g7h8i9j0k1  ← 30 символов
│   │   └─────────┬────────────┘
│   │            Уникальный ID (22 chars, Base62)
│   └─ Тип: usr/org/api/ses/txn/prj
└─ Префикс: eco
```

**Пример в действии:**
```typescript
// User регистрируется на nexus.com
const ecoId = "eco_usr_abc123xyz789";

// Автоматически получает доступ ко всем проектам:
- nexus.com/sales/dashboard     ✅
- nexus.com/portfolio           ✅
- testing-hub.alexb.com         ✅
- liminal.com                   ✅

// Один логин = доступ везде (SSO)
```

---

## 📚 ОБЯЗАТЕЛЬНО прочитать ДО начала работы:

### 1️⃣ **EcoID Specification** (Main document)
```
C:\Users\safal\OneDrive\Documente\GitHub\nexus-ecosystem\ECOID_SPECIFICATION.md
```
**Что там:**
- Полная спецификация формата EcoID
- Database schema (7 таблиц)
- **Готовый код** для копирования (Generator, Service, Auth)
- API endpoints
- Security best practices
- Integration examples

⚠️ **ВАЖНО:** Там весь код уже написан! Твоя задача - скопировать и адаптировать.

### 2️⃣ **Ecosystem Integration Map**
```
C:\Users\safal\OneDrive\Documente\GitHub\nexus-ecosystem\ECOSYSTEM_INTEGRATION_MAP.md
```
**Что там:**
- Архитектура всей экосистемы
- Как проекты связаны между собой
- JWT authentication flow

### 3️⃣ **Main Development Plan**
```
C:\Users\safal\OneDrive\Documente\GitHub\AlexB\NEXUS_ECOSYSTEM_PLAN.md
```
**Что там:**
- 12-недельный план разработки
- Твои будущие задачи после EcoID

---

## 🎯 Твоя задача: Task 1.1 Extended - EcoID + JWT Auth

### Что нужно сделать:

#### Phase 1: Setup Project Structure (2 hours)

**1.1 Создать package структуру:**

```bash
cd C:\Users\safal\OneDrive\Documente\GitHub\nexus-ecosystem

# Создать директории
mkdir -p packages/eco-id/src
mkdir -p packages/auth/src
mkdir -p apps/hub/src/app/api/eco-auth/register
mkdir -p apps/hub/src/app/api/eco-auth/login
mkdir -p apps/hub/src/app/api/eco-auth/refresh
mkdir -p apps/hub/src/app/api/eco-auth/logout
mkdir -p apps/hub/src/app/api/eco-id/me
```

**1.2 Создать package.json для eco-id:**

```json
// packages/eco-id/package.json
{
  "name": "@nexus/eco-id",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.58.0",
    "bcryptjs": "^2.4.3"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "typescript": "^5.7.2"
  }
}
```

**1.3 Создать package.json для auth:**

```json
// packages/auth/package.json
{
  "name": "@nexus/auth",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@nexus/eco-id": "workspace:*",
    "@supabase/supabase-js": "^2.58.0",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "next": "^15.5.4"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.5",
    "@types/bcryptjs": "^2.4.6",
    "typescript": "^5.7.2"
  }
}
```

**1.4 Install dependencies:**

```bash
cd packages/eco-id
npm install

cd ../auth
npm install

cd ../..
npm install  # Root install (turborepo)
```

---

#### Phase 2: Database Setup (2 hours)

**2.1 Открой Supabase Dashboard:**

1. Go to: https://supabase.com/dashboard
2. Open your project (or create new)
3. Go to: SQL Editor → New Query

**2.2 Выполни SQL миграции:**

Скопируй из **ECOID_SPECIFICATION.md** (lines 66-276) и выполни по порядку:

```sql
-- 1. Core identity table
CREATE TABLE eco_identities (
  eco_id TEXT PRIMARY KEY CHECK (eco_id ~ '^eco_[a-z]{3}_[0-9a-zA-Z]{22}$'),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('usr', 'org', 'api', 'ses', 'txn', 'prj')),
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  timezone TEXT DEFAULT 'UTC',
  locale TEXT DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  security_level TEXT DEFAULT 'standard' CHECK (security_level IN ('standard', 'high', 'enterprise')),
  mfa_enabled BOOLEAN DEFAULT FALSE,
  gdpr_consent BOOLEAN DEFAULT FALSE,
  gdpr_consent_at TIMESTAMPTZ,
  data_retention_days INTEGER DEFAULT 365
);

-- Indexes
CREATE INDEX idx_eco_identities_entity_type ON eco_identities(entity_type);
CREATE INDEX idx_eco_identities_status ON eco_identities(status);
CREATE INDEX idx_eco_identities_created_at ON eco_identities(created_at DESC);

-- Auto-update trigger
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

-- 2. Credentials table
CREATE TABLE eco_credentials (
  eco_id TEXT PRIMARY KEY REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_changed_at TIMESTAMPTZ DEFAULT NOW(),
  password_reset_token TEXT,
  password_reset_expires TIMESTAMPTZ,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_login_ip INET,
  mfa_secret TEXT,
  mfa_backup_codes TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eco_credentials_email ON eco_credentials(email);

-- 3. Project access
CREATE TABLE eco_project_access (
  eco_id TEXT REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'read_only', 'api_only')),
  permissions JSONB DEFAULT '{}',
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by TEXT REFERENCES eco_identities(eco_id),
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (eco_id, project_name)
);

CREATE INDEX idx_eco_project_access_eco_id ON eco_project_access(eco_id);
CREATE INDEX idx_eco_project_access_project ON eco_project_access(project_name);

-- 4. Profiles
CREATE TABLE eco_profiles (
  eco_id TEXT PRIMARY KEY REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  company TEXT,
  job_title TEXT,
  linkedin_url TEXT,
  twitter_handle TEXT,
  github_username TEXT,
  email_notifications BOOLEAN DEFAULT TRUE,
  marketing_emails BOOLEAN DEFAULT FALSE,
  profile_visibility TEXT DEFAULT 'private' CHECK (profile_visibility IN ('public', 'connections', 'private')),
  data_sharing_consent JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Activity log
CREATE TABLE eco_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  eco_id TEXT REFERENCES eco_identities(eco_id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  project_name TEXT,
  resource_type TEXT,
  resource_id TEXT,
  ip_address INET,
  user_agent TEXT,
  location JSONB,
  status TEXT CHECK (status IN ('success', 'failure', 'pending')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eco_activity_log_eco_id ON eco_activity_log(eco_id, created_at DESC);
CREATE INDEX idx_eco_activity_log_action ON eco_activity_log(action);

-- 6. Sessions
CREATE TABLE eco_sessions (
  session_id TEXT PRIMARY KEY,
  eco_id TEXT REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
  access_token_hash TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  device_type TEXT,
  device_name TEXT,
  ip_address INET,
  location JSONB,
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eco_sessions_eco_id ON eco_sessions(eco_id);
CREATE INDEX idx_eco_sessions_expires ON eco_sessions(refresh_expires_at);
```

**2.3 Verify tables created:**

```sql
-- Check all tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'eco_%';

-- Should return:
-- eco_identities
-- eco_credentials
-- eco_project_access
-- eco_profiles
-- eco_activity_log
-- eco_sessions
```

**2.4 Setup Environment Variables:**

```bash
# nexus-ecosystem/.env.local

# JWT Secret (generate random 32-char string)
JWT_SECRET="your-super-secret-jwt-key-here-32-chars-minimum"

# Supabase
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_KEY="your-service-role-key"  # For server-side operations

# Stripe (for future)
STRIPE_SECRET_KEY="sk_test_..."
```

🔐 **Generate JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

#### Phase 3: Implement EcoID Generator (3 hours)

**3.1 Create: `packages/eco-id/src/generator.ts`**

📄 **Скопируй код из ECOID_SPECIFICATION.md (lines 284-357)**

```typescript
// packages/eco-id/src/generator.ts

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
```

**3.2 Create tests: `packages/eco-id/src/__tests__/generator.test.ts`**

```typescript
import { EcoIDGenerator } from '../generator';

describe('EcoIDGenerator', () => {
  test('generates valid EcoID', () => {
    const ecoId = EcoIDGenerator.generate('usr');

    expect(ecoId).toMatch(/^eco_usr_[0-9a-zA-Z]{22}$/);
    expect(ecoId.length).toBe(30);
  });

  test('generates unique IDs', () => {
    const id1 = EcoIDGenerator.generate('usr');
    const id2 = EcoIDGenerator.generate('usr');

    expect(id1).not.toBe(id2);
  });

  test('validates correct EcoID', () => {
    const ecoId = EcoIDGenerator.generate('usr');
    expect(EcoIDGenerator.isValid(ecoId)).toBe(true);
  });

  test('rejects invalid EcoID', () => {
    expect(EcoIDGenerator.isValid('invalid')).toBe(false);
    expect(EcoIDGenerator.isValid('eco_usr_short')).toBe(false);
    expect(EcoIDGenerator.isValid('eco_invalid_a1b2c3d4e5f6g7h8i9j0k1')).toBe(false);
  });

  test('extracts type correctly', () => {
    const ecoId = EcoIDGenerator.generate('usr');
    expect(EcoIDGenerator.getType(ecoId)).toBe('usr');
  });

  test('checks type correctly', () => {
    const ecoId = EcoIDGenerator.generate('org');
    expect(EcoIDGenerator.isType(ecoId, 'org')).toBe(true);
    expect(EcoIDGenerator.isType(ecoId, 'usr')).toBe(false);
  });
});
```

**3.3 Run tests:**

```bash
cd packages/eco-id
npm test
```

✅ **All tests should pass!**

---

#### Phase 4: Implement EcoID Service (6 hours)

**4.1 Create: `packages/eco-id/src/service.ts`**

📄 **Скопируй код из ECOID_SPECIFICATION.md (lines 363-559)**

```typescript
// packages/eco-id/src/service.ts

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
```

**4.2 Create: `packages/eco-id/src/index.ts`**

```typescript
// packages/eco-id/src/index.ts

export { EcoIDGenerator, type EcoIDType } from './generator';
export { EcoIDService, type CreateEcoIDParams, type EcoIdentity } from './service';
```

---

#### Phase 5: Implement Authentication (5 hours)

**5.1 Create: `packages/auth/src/eco-auth.ts`**

📄 **Скопируй код из ECOID_SPECIFICATION.md (lines 565-664)**

```typescript
// packages/auth/src/eco-auth.ts

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

**5.2 Create: `packages/auth/src/middleware.ts`**

📄 **Скопируй код из ECOID_SPECIFICATION.md (lines 670-725)**

```typescript
// packages/auth/src/middleware.ts

import { NextRequest, NextResponse } from 'next/server';
import { EcoAuth } from './eco-auth';
import { EcoIDService } from '@nexus/eco-id';

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

**5.3 Create: `packages/auth/src/index.ts`**

```typescript
// packages/auth/src/index.ts

export { EcoAuth, type AuthTokens } from './eco-auth';
export { requireEcoID, requireProjectAccess } from './middleware';
```

---

#### Phase 6: Create API Endpoints (4 hours)

**6.1 Register endpoint:**

```typescript
// apps/hub/src/app/api/eco-auth/register/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { EcoAuth } from '@nexus/auth';

const auth = new EcoAuth(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, password, displayName } = await req.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 12) {
      return NextResponse.json(
        { error: 'Password must be at least 12 characters' },
        { status: 400 }
      );
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
      path: '/',
    });

    response.cookies.set('eco_refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: error.message || 'Registration failed' },
      { status: 400 }
    );
  }
}
```

**6.2 Login endpoint:**

```typescript
// apps/hub/src/app/api/eco-auth/login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { EcoAuth } from '@nexus/auth';

const auth = new EcoAuth(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      );
    }

    const tokens = await auth.login(email, password, {
      ipAddress: req.headers.get('x-forwarded-for') || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
    });

    const response = NextResponse.json({
      success: true,
      ecoId: tokens.ecoId,
      message: 'Login successful',
    });

    response.cookies.set('eco_access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60,
      path: '/',
    });

    response.cookies.set('eco_refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error.message || 'Login failed' },
      { status: 401 }
    );
  }
}
```

**6.3 Refresh endpoint:**

```typescript
// apps/hub/src/app/api/eco-auth/refresh/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { EcoAuth } from '@nexus/auth';

const auth = new EcoAuth(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get('eco_refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'No refresh token' },
        { status: 401 }
      );
    }

    const tokens = await auth.refreshTokens(refreshToken);

    const response = NextResponse.json({
      success: true,
      message: 'Token refreshed',
    });

    response.cookies.set('eco_access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Refresh error:', error);
    return NextResponse.json(
      { error: 'Invalid refresh token' },
      { status: 401 }
    );
  }
}
```

**6.4 Logout endpoint:**

```typescript
// apps/hub/src/app/api/eco-auth/logout/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully',
  });

  // Clear cookies
  response.cookies.delete('eco_access_token');
  response.cookies.delete('eco_refresh_token');

  return response;
}
```

**6.5 Get current user endpoint:**

```typescript
// apps/hub/src/app/api/eco-id/me/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireEcoID } from '@nexus/auth';
import { EcoIDService } from '@nexus/eco-id';

export async function GET(req: NextRequest) {
  // Require authentication
  const authResponse = await requireEcoID(req);
  if (authResponse.status !== 200) return authResponse;

  const ecoId = (req as any).ecoId;

  try {
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
  } catch (error: any) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: 'Failed to get user' },
      { status: 500 }
    );
  }
}
```

---

## 🧪 Testing Your Implementation

### Manual Testing with curl:

**1. Register a new user:**

```bash
curl -X POST http://localhost:3000/api/eco-auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!",
    "displayName": "Test User"
  }'

# Expected response:
# {
#   "success": true,
#   "ecoId": "eco_usr_...",
#   "message": "Registration successful"
# }
```

**2. Login:**

```bash
curl -X POST http://localhost:3000/api/eco-auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }' \
  -c cookies.txt

# Saves cookies to cookies.txt
```

**3. Get current user:**

```bash
curl http://localhost:3000/api/eco-id/me \
  -b cookies.txt

# Expected response:
# {
#   "ecoId": "eco_usr_...",
#   "displayName": "Test User",
#   "verified": false,
#   "status": "active",
#   "projects": [
#     { "project": "nexus-hub", "role": "member" }
#   ]
# }
```

**4. Logout:**

```bash
curl -X POST http://localhost:3000/api/eco-auth/logout \
  -b cookies.txt
```

---

## ✅ Definition of Done (Checklist)

Before marking task complete, ensure:

### Code Quality:
- [ ] All TypeScript files have proper types (no `any` except in error handlers)
- [ ] No console.log in production code (use proper logging)
- [ ] Error handling with try/catch
- [ ] Input validation on all endpoints
- [ ] Password strength validation (min 12 chars)

### Functionality:
- [ ] User can register with email/password
- [ ] User can login and receive JWT tokens
- [ ] Access token expires after 15 minutes
- [ ] Refresh token works for 7 days
- [ ] Logout clears cookies
- [ ] GET /api/eco-id/me returns user data
- [ ] Passwords are hashed with bcrypt
- [ ] Activity is logged to eco_activity_log

### Database:
- [ ] All 6 tables created in Supabase
- [ ] Indexes created
- [ ] Triggers working (updated_at)
- [ ] Foreign key constraints working

### Security:
- [ ] JWT_SECRET is strong (32+ chars)
- [ ] Cookies are httpOnly
- [ ] Cookies are secure in production
- [ ] No sensitive data in JWT payload
- [ ] Rate limiting implemented (future task)

### Testing:
- [ ] All unit tests pass (npm test)
- [ ] Manual curl tests work
- [ ] Tested in browser (Postman/Insomnia)
- [ ] Checked Supabase tables (data inserted correctly)

### Documentation:
- [ ] Code comments for complex logic
- [ ] README.md in packages/eco-id
- [ ] README.md in packages/auth
- [ ] API endpoint documentation

---

## 📊 Success Metrics

After implementation:
- ✅ User can register in <2 seconds
- ✅ Login response time <500ms
- ✅ No security vulnerabilities (npm audit)
- ✅ Test coverage >80%
- ✅ Zero console errors

---

## 🆘 If You Get Stuck

### Common Issues:

**1. "Cannot find module '@nexus/eco-id'"**
```bash
# Solution: Install workspace dependencies
npm install
# or
pnpm install
```

**2. "JWT_SECRET is not defined"**
```bash
# Solution: Check .env.local exists
ls -la .env.local

# Generate new secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**3. "Supabase connection error"**
```bash
# Solution: Verify environment variables
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_KEY

# Check Supabase project is running
# Visit: https://supabase.com/dashboard
```

**4. "Password validation failed"**
```bash
# Password requirements:
# - Minimum 12 characters
# - At least 1 uppercase letter
# - At least 1 lowercase letter
# - At least 1 number
# - At least 1 special character
```

**5. "EcoID generation collision"**
```bash
# Extremely unlikely (1 in 2.27 × 10^39)
# But if it happens, regenerate:
const ecoId = EcoIDGenerator.generate('usr');
```

---

## 💬 Communication

### Daily Updates (Discord/Slack):

**Template:**
```
🚀 Day X Update - EcoID Implementation

✅ Completed:
- Created EcoID generator
- Setup Supabase tables
- Implemented auth service

🏗️ In Progress:
- Testing API endpoints

🚧 Blockers:
- None / [describe issue]

📅 Tomorrow:
- Finish API endpoints
- Write unit tests
```

### Questions?

1. Read ECOID_SPECIFICATION.md first (90% answers there)
2. Check code examples in doc
3. Google error message
4. Ask in Discord/Slack with:
   - Error message
   - What you tried
   - Relevant code snippet

---

## 🎯 After Completion

When you finish Task 1.1, you'll move to:

**Task 1.2: API Key Management** (12 hours)
- Generate API keys (format: `nxs_live_xxxxx`)
- Key validation middleware
- Rate limiting per key
- Key rotation

**Task 1.3: Rate Limiting** (10 hours)
- Token bucket algorithm
- Redis-based counters
- Per-user limits

**Task 1.4: RBAC** (14 hours)
- Role-based permissions
- Permission checks
- Admin panel

---

## 🎉 You're Ready!

**Next steps:**
1. ✅ Read ECOID_SPECIFICATION.md (full spec)
2. ✅ Setup Supabase tables
3. ✅ Create packages structure
4. ✅ Implement EcoID generator
5. ✅ Implement EcoID service
6. ✅ Implement auth
7. ✅ Create API endpoints
8. ✅ Test everything
9. ✅ Create PR for code review

**Estimated timeline:** 3 days (20-24 hours)

**Let's build the foundation of Nexus Ecosystem!** 🚀

---

**Questions before starting?** Ask now!

**Ready to code?** Create branch and start:
```bash
git checkout -b feat/ecoid-implementation
```

Good luck, Qwen! 💪 You got this!
