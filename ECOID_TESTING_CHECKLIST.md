# T1.2: EcoID Testing Checklist

**Priority:** P0 (Critical - Foundation for entire ecosystem)
**Estimated Time:** 8 hours
**Dependencies:** Qwen's EcoID Integration (completed)

---

## 🎯 Objective

Test EcoID system comprehensively to ensure:
- Format validation works correctly
- No collision risks in production
- Service integration functions properly
- Cross-project access works
- Performance meets requirements

---

## 📋 Test Cases to Implement

### Phase 1: Format Validation (2 hours)

#### Test 1.1: EcoID Format Validation
**File:** `packages/eco-id/src/__tests__/generator.test.ts`

```typescript
describe('EcoID Format Validation', () => {
  test('should generate valid EcoID format', () => {
    const ecoId = EcoIDGenerator.generate('usr');
    expect(EcoIDGenerator.isValid(ecoId)).toBe(true);
    expect(ecoId).toMatch(/^usr_[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/);
  });

  test('should reject invalid formats', () => {
    const invalidIds = [
      'usr_123', // Too short
      'usr_123e4567-e89b-12d3-a456-426614174000-extra', // Too long
      'user_123e4567-e89b-12d3-a456-426614174000', // Wrong prefix
      'usr_gggggggg-hhhh-iiii-jjjj-kkkkkkkkkkkk', // Invalid chars
    ];

    invalidIds.forEach(id => {
      expect(EcoIDGenerator.isValid(id)).toBe(false);
    });
  });

  test('should validate all supported types', () => {
    const types = ['usr', 'prj', 'org', 'api', 'ses'];

    types.forEach(type => {
      const ecoId = EcoIDGenerator.generate(type);
      expect(EcoIDGenerator.isValid(ecoId)).toBe(true);
      expect(ecoId.startsWith(`${type}_`)).toBe(true);
    });
  });
});
```

#### Test 1.2: Collision Prevention
```typescript
describe('Collision Prevention', () => {
  test('should generate unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 10000; i++) {
      ids.add(EcoIDGenerator.generate('usr'));
    }
    expect(ids.size).toBe(10000); // All unique
  });

  test('should handle high concurrency', async () => {
    const promises = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(Promise.resolve(EcoIDGenerator.generate('usr')));
    }

    const results = await Promise.all(promises);
    const uniqueResults = new Set(results);
    expect(uniqueResults.size).toBe(1000);
  });
});
```

### Phase 2: Service Integration (3 hours)

#### Test 2.1: User Creation & Identity Management
**File:** `packages/eco-id/src/__tests__/service.test.ts`

```typescript
describe('EcoID Service - User Management', () => {
  beforeEach(async () => {
    // Clean test database
    await testSupabase.from('eco_ids').delete().neq('id', 'dummy');
  });

  test('should create user with valid EcoID', async () => {
    const userData = {
      type: 'usr',
      email: 'test@example.com',
      password: 'SecurePass123!',
      displayName: 'Test User'
    };

    const identity = await ecoIdService.createUser(userData);

    expect(identity.ecoId).toMatch(/^usr_[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/);
    expect(identity.email).toBe(userData.email);
    expect(identity.displayName).toBe(userData.displayName);
    expect(identity.createdAt).toBeDefined();
  });

  test('should retrieve identity by EcoID', async () => {
    const created = await ecoIdService.createUser({
      type: 'usr',
      email: 'retrieve@example.com',
      password: 'Pass123!',
    });

    const retrieved = await ecoIdService.getIdentity(created.ecoId);

    expect(retrieved.ecoId).toBe(created.ecoId);
    expect(retrieved.email).toBe(created.email);
  });

  test('should verify credentials correctly', async () => {
    const userData = {
      type: 'usr',
      email: 'verify@example.com',
      password: 'VerifyPass123!',
    };

    const created = await ecoIdService.createUser(userData);

    // Correct credentials
    const ecoId1 = await ecoIdService.verifyCredentials(userData.email, userData.password);
    expect(ecoId1).toBe(created.ecoId);

    // Wrong password
    const ecoId2 = await ecoIdService.verifyCredentials(userData.email, 'WrongPass123!');
    expect(ecoId2).toBeNull();

    // Wrong email
    const ecoId3 = await ecoIdService.verifyCredentials('wrong@example.com', userData.password);
    expect(ecoId3).toBeNull();
  });
});
```

#### Test 2.2: Project Management
```typescript
describe('EcoID Service - Project Management', () => {
  test('should create project with unique EcoID', async () => {
    const projectData = {
      type: 'prj',
      name: 'Test Project',
      description: 'A test project',
      ownerId: 'usr_123e4567-e89b-12d3-a456-426614174000'
    };

    const project = await ecoIdService.createProject(projectData);

    expect(project.ecoId).toMatch(/^prj_[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/);
    expect(project.name).toBe(projectData.name);
    expect(project.ownerId).toBe(projectData.ownerId);
  });

  test('should list user projects', async () => {
    const userId = 'usr_123e4567-e89b-12d3-a456-426614174000';

    // Create multiple projects
    const projects = [];
    for (let i = 0; i < 3; i++) {
      projects.push(await ecoIdService.createProject({
        type: 'prj',
        name: `Project ${i}`,
        ownerId: userId
      }));
    }

    const userProjects = await ecoIdService.getUserProjects(userId);
    expect(userProjects.length).toBe(3);
    expect(userProjects.map(p => p.name)).toEqual(['Project 0', 'Project 1', 'Project 2']);
  });
});
```

### Phase 3: Cross-Project Access (2 hours)

#### Test 3.1: Access Control
```typescript
describe('Cross-Project Access Control', () => {
  test('should grant access to project member', async () => {
    const userId = 'usr_123e4567-e89b-12d3-a456-426614174000';
    const projectId = 'prj_456e7890-e89b-12d3-a456-426614174000';

    // Grant access
    await ecoIdService.grantProjectAccess(projectId, userId, 'editor');

    // Verify access
    const hasAccess = await ecoIdService.checkProjectAccess(projectId, userId);
    expect(hasAccess).toBe(true);

    const role = await ecoIdService.getProjectRole(projectId, userId);
    expect(role).toBe('editor');
  });

  test('should deny access to non-member', async () => {
    const nonMemberId = 'usr_789e0123-e89b-12d3-a456-426614174000';
    const projectId = 'prj_456e7890-e89b-12d3-a456-426614174000';

    const hasAccess = await ecoIdService.checkProjectAccess(projectId, nonMemberId);
    expect(hasAccess).toBe(false);
  });

  test('should revoke access correctly', async () => {
    const userId = 'usr_123e4567-e89b-12d3-a456-426614174000';
    const projectId = 'prj_456e7890-e89b-12d3-a456-426614174000';

    // Grant then revoke
    await ecoIdService.grantProjectAccess(projectId, userId, 'viewer');
    await ecoIdService.revokeProjectAccess(projectId, userId);

    const hasAccess = await ecoIdService.checkProjectAccess(projectId, userId);
    expect(hasAccess).toBe(false);
  });
});
```

### Phase 4: Performance & Security (1 hour)

#### Test 4.1: Performance Benchmarks
```typescript
describe('Performance Benchmarks', () => {
  test('should generate EcoID within 1ms', () => {
    const start = Date.now();
    const ecoId = EcoIDGenerator.generate('usr');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1);
    expect(EcoIDGenerator.isValid(ecoId)).toBe(true);
  });

  test('should validate EcoID within 0.1ms', () => {
    const ecoId = EcoIDGenerator.generate('usr');

    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      EcoIDGenerator.isValid(ecoId);
    }
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(10); // 1000 validations in <10ms
  });

  test('should handle database queries within 50ms', async () => {
    const ecoId = 'usr_123e4567-e89b-12d3-a456-426614174000';

    const start = Date.now();
    await ecoIdService.getIdentity(ecoId);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(50);
  });
});
```

---

## 🛠️ Setup Requirements

### Environment Variables
```bash
SUPABASE_URL=test_supabase_url
SUPABASE_SERVICE_KEY=test_service_key
SUPABASE_ANON_KEY=test_anon_key
```

### Test Database Schema
Ensure test database has:
- `eco_ids` table with proper structure
- Test data isolation (separate schema)

### Dependencies
```json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "@types/jest": "^29.5.14",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2"
  }
}
```

---

## ✅ Definition of Done

### Format Validation
- [ ] EcoID format validation works for all types (usr, prj, org, api, ses)
- [ ] Invalid formats properly rejected
- [ ] Collision prevention verified (10k+ unique IDs)

### Service Integration
- [ ] User creation returns valid EcoID
- [ ] Identity retrieval works correctly
- [ ] Credential verification functions properly
- [ ] Project creation and management works

### Cross-Project Access
- [ ] Access granting/revoking works
- [ ] Role-based permissions enforced
- [ ] Member/non-member access control verified

### Performance & Security
- [ ] ID generation <1ms
- [ ] Validation <0.1ms per operation
- [ ] Database queries <50ms
- [ ] No security vulnerabilities in access control

---

## 📊 Deliverables

1. **Test Files Created:**
   - `packages/eco-id/src/__tests__/generator.test.ts`
   - `packages/eco-id/src/__tests__/service.test.ts`
   - `packages/eco-id/src/__tests__/integration.test.ts`

2. **Test Report:** `ECOID_TEST_REPORT.md`
   - Test results and coverage
   - Performance benchmarks
   - Security assessment

3. **Documentation Updates:**
   - EcoID format specification
   - Service API documentation
   - Performance characteristics

---

## 🚨 Risk Assessment

**High Risk Items:**
1. **Collision Prevention** - Must be 100% reliable in production
2. **Database Performance** - Queries must be sub-50ms for good UX
3. **Access Control** - Security critical for multi-tenant system

**Mitigations:**
- Extensive collision testing (10k+ IDs)
- Performance benchmarks with realistic data volumes
- Security-focused access control testing

---

## 🔄 Integration Points

**Depends On:**
- Supabase database setup and migrations
- EcoID package implementation completion

**Feeds Into:**
- T1.3: API Key Management
- T1.4: RBAC System
- Authentication system integration

---

**Ready to execute once Jest configuration is resolved and test database is available.**
