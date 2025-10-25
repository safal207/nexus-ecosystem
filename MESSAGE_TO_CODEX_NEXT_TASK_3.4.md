# 🚀 Message to Codex - Task 3.4 Ready

**Дата**: 2025-10-14
**От**: Claude (Tech Architect)
**Кому**: Codex (Backend Developer)

---

## 🎉 Task 3.3: OUTSTANDING WORK!

Привет, Codex!

Task 3.3 завершен на **отлично**! 🏆

**Grade**: **A+ (98/100)**

**Что выполнено**:
- ✅ 3 API endpoints созданы
- ✅ Reusable auth helper
- ✅ Singleton Supabase client
- ✅ Clean architecture
- ✅ Frontend-ready responses

**Подробный feedback**: `CODEX_FEEDBACK_PHASE_3_TASK_3.3.md`

---

## 🎯 Next: Task 3.4 - Integration с API Keys

**Приоритет**: HIGH
**Duration**: 2-3 часа
**Цель**: Автоматически отслеживать usage для API key requests

---

## 📋 Task 3.4 Overview

### Goal:
Интегрировать usage tracking в существующий `withApiKey` middleware, чтобы **каждый API call автоматически трекался**.

### Current State:
- ✅ `@nexus/usage` package готов (Task 3.1)
- ✅ Database tables готовы (Task 3.2)
- ✅ Analytics API готовы (Task 3.3)
- ⏳ API key middleware НЕ трекает usage

### Target State:
- ✅ API key requests автоматически трекаются
- ✅ Rate limits применяются
- ✅ X-RateLimit-* headers добавляются
- ✅ Free plan блокируется при превышении

---

## 🔧 Implementation Guide

### Step 1: Update withApiKey Middleware

**File**: `packages/auth/src/api-key-middleware.ts`

**Current Code** (simplified):
```typescript
export async function withApiKey(
  req: NextRequest,
  handler: (req: NextRequest, context: { ecoId: string; apiKeyId: string }) => Promise<NextResponse>
): Promise<NextResponse> {
  // 1. Extract API key from header
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('ApiKey ')) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
  }

  // 2. Verify API key
  const apiKey = authHeader.replace('ApiKey ', '');
  const [keyId, secret] = apiKey.split('.');
  const { valid, ecoId } = await verifyApiKey(keyId, secret);

  if (!valid || !ecoId) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  // 3. Call handler
  return handler(req, { ecoId, apiKeyId: keyId });
}
```

**New Code** (with usage tracking):
```typescript
import { withUsageTracking } from '@nexus/usage';

export async function withApiKey(
  req: NextRequest,
  handler: (req: NextRequest, context: { ecoId: string; apiKeyId: string }) => Promise<NextResponse>
): Promise<NextResponse> {
  // 1. Extract API key from header
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('ApiKey ')) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
  }

  // 2. Verify API key
  const apiKey = authHeader.replace('ApiKey ', '');
  const [keyId, secret] = apiKey.split('.');
  const { valid, ecoId } = await verifyApiKey(keyId, secret);

  if (!valid || !ecoId) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  // 3. Wrap handler with usage tracking
  return withUsageTracking(
    req,
    { ecoId, apiKeyId: keyId },
    (req) => handler(req, { ecoId, apiKeyId: keyId })
  );
}
```

**Changes**:
- ✅ Import `withUsageTracking` from `@nexus/usage`
- ✅ Wrap handler call with usage tracking
- ✅ Pass `ecoId` and `apiKeyId` to tracker

---

### Step 2: Verify withUsageTracking Implementation

**File**: `packages/usage/src/middleware.ts` (from Task 3.1)

**Should already have**:
```typescript
export async function withUsageTracking(
  req: NextRequest,
  context: UsageContext, // { ecoId: string, apiKeyId?: string }
  handler: (req: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // 1. Check if user has exceeded limit
    const exceeded = await tracker.hasExceededLimit(context.ecoId);

    if (exceeded) {
      const usage = await tracker.getCurrentUsage(context.ecoId);

      // Free plan: block request
      if (usage.limit === 1000) {
        return NextResponse.json(
          {
            error: 'API limit exceeded',
            message: `You have exceeded your ${usage.limit} API calls/month limit`,
            current_usage: usage.apiCalls,
            limit: usage.limit,
            period_end: usage.periodEnd,
            upgrade_url: '/dashboard/billing',
          },
          { status: 429 }
        );
      }

      // Pro plan: allow but log overage
      console.log(`User ${context.ecoId} in overage: ${usage.overageCalls} calls`);
    }

    // 2. Execute handler
    const response = await handler(req);

    // 3. Track usage
    const responseTime = Date.now() - startTime;
    const url = new URL(req.url);

    await tracker.track({
      eco_id: context.ecoId,
      endpoint: url.pathname,
      method: req.method,
      timestamp: new Date(),
      response_time_ms: responseTime,
      status_code: response.status,
      api_key_id: context.apiKeyId,
    });

    // 4. Add rate limit headers
    const usage = await tracker.getCurrentUsage(context.ecoId);
    response.headers.set('X-RateLimit-Limit', usage.limit.toString());
    response.headers.set(
      'X-RateLimit-Remaining',
      Math.max(0, usage.limit - usage.apiCalls).toString()
    );
    response.headers.set('X-RateLimit-Reset', usage.periodEnd.toISOString());

    return response;
  } catch (error) {
    console.error('Usage tracking error:', error);
    // Don't block request if tracking fails
    return handler(req);
  }
}
```

**Verify**:
- ✅ Rate limit check implemented
- ✅ Free plan blocking (429 error)
- ✅ Pro plan overage logging
- ✅ Usage tracking after response
- ✅ X-RateLimit-* headers
- ✅ Error handling (graceful degradation)

---

### Step 3: Test Integration

#### Test 1: API Key Request with Tracking
```bash
# Make API request with API key
curl -H "Authorization: ApiKey eco_api_123.secret456" \
  http://localhost:3000/api/test

# Expected response headers:
# X-RateLimit-Limit: 100000
# X-RateLimit-Remaining: 99950
# X-RateLimit-Reset: 2025-11-01T00:00:00Z
```

#### Test 2: Verify Tracking in Database
```sql
-- Check eco_api_usage table
SELECT * FROM eco_api_usage
WHERE eco_id = 'eco_usr_123'
ORDER BY timestamp DESC
LIMIT 10;

-- Expected: New rows for each API call
```

#### Test 3: Verify Usage Counters
```sql
-- Check eco_usage_records
SELECT api_calls, overage_calls, overage_cost
FROM eco_usage_records
WHERE eco_id = 'eco_usr_123';

-- Expected: api_calls incremented
```

#### Test 4: Free Plan Blocking
```bash
# Simulate Free user hitting limit
# (Set subscription to 'free' plan in DB)

# Make 1001st request
curl -H "Authorization: ApiKey eco_api_free.secret" \
  http://localhost:3000/api/test

# Expected: 429 Too Many Requests
# {
#   "error": "API limit exceeded",
#   "current_usage": 1001,
#   "limit": 1000,
#   "upgrade_url": "/dashboard/billing"
# }
```

#### Test 5: Pro Plan Overage
```bash
# Simulate Pro user exceeding limit
# (100,001st request)

# Expected: 200 OK (request allowed)
# Console log: "User eco_usr_pro in overage: 1 calls"
```

---

### Step 4: Add Rate Limit Headers Test

**File**: `packages/auth/__tests__/api-key-middleware.test.ts` (optional)

```typescript
describe('withApiKey with usage tracking', () => {
  test('should add X-RateLimit-* headers', async () => {
    const req = createMockRequest({
      headers: { Authorization: 'ApiKey eco_api_test.secret123' },
    });

    const handler = jest.fn().mockResolvedValue(
      NextResponse.json({ success: true })
    );

    const response = await withApiKey(req, handler);

    expect(response.headers.get('X-RateLimit-Limit')).toBe('100000');
    expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
    expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
  });

  test('should block Free plan when limit exceeded', async () => {
    // Mock user with Free plan, 1000+ calls
    const req = createMockRequest({
      headers: { Authorization: 'ApiKey eco_api_free.secret' },
    });

    const response = await withApiKey(req, mockHandler);

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain('API limit exceeded');
  });

  test('should allow Pro plan overage', async () => {
    // Mock user with Pro plan, 100,001+ calls
    const req = createMockRequest({
      headers: { Authorization: 'ApiKey eco_api_pro.secret' },
    });

    const response = await withApiKey(req, mockHandler);

    expect(response.status).toBe(200);
    // Overage logged but request allowed
  });
});
```

---

## ✅ Success Criteria

Task 3.4 считается завершенной когда:

- ✅ `withApiKey` middleware обновлен
- ✅ `withUsageTracking` интегрирован
- ✅ API key requests трекаются автоматически
- ✅ X-RateLimit-* headers добавляются
- ✅ Free plan блокируется при превышении (429)
- ✅ Pro plan разрешает overage
- ✅ Usage data пишется в eco_api_usage
- ✅ Counters обновляются в eco_usage_records
- ✅ Tests passed (manual or automated)

---

## 📊 Expected Results

### Before Task 3.4:
```bash
# API key request
curl -H "Authorization: ApiKey test.secret" /api/test
# ❌ No tracking
# ❌ No rate limit headers
# ❌ No limit enforcement
```

### After Task 3.4:
```bash
# API key request
curl -H "Authorization: ApiKey test.secret" /api/test
# ✅ Usage tracked in database
# ✅ X-RateLimit-* headers present
# ✅ Free plan blocked at limit
# ✅ Pro plan allows overage
```

---

## 🔍 Troubleshooting

### Issue 1: Headers Not Appearing
**Symptom**: X-RateLimit-* headers missing

**Debug**:
```typescript
// Add logging in withUsageTracking
console.log('Adding rate limit headers:', {
  limit: usage.limit,
  remaining: usage.limit - usage.apiCalls,
  reset: usage.periodEnd
});
```

**Solution**: Verify `tracker.getCurrentUsage()` returns data

---

### Issue 2: Tracking Not Working
**Symptom**: No rows in eco_api_usage

**Debug**:
```typescript
// Check if tracker.track() is called
console.log('Tracking usage:', {
  eco_id: context.ecoId,
  endpoint: url.pathname,
  method: req.method
});
```

**Solution**: Verify batch flushing works (wait 5 seconds or 100 records)

---

### Issue 3: Free Plan Not Blocked
**Symptom**: Free user can make 1001+ requests

**Debug**:
```sql
-- Check subscription plan
SELECT plan, status FROM eco_subscriptions
WHERE eco_id = 'eco_usr_test';

-- Check usage record
SELECT api_calls, overage_calls
FROM eco_usage_records
WHERE eco_id = 'eco_usr_test';
```

**Solution**: Verify `hasExceededLimit()` logic

---

## 💡 Tips

### Performance:
- ✅ Usage tracking is async (non-blocking)
- ✅ Batch flushing prevents DB overload
- ✅ Headers added after handler execution

### Error Handling:
- ✅ If tracking fails, request still proceeds
- ✅ Graceful degradation
- ✅ Errors logged to console

### Testing:
- ✅ Use test API keys
- ✅ Check database directly
- ✅ Monitor console logs
- ✅ Verify headers with curl -v

---

## 📚 Reference

**Full spec**: `CODEX_PHASE_3_USAGE_ANALYTICS.md` (lines 550-650)

**Key Files**:
- `packages/auth/src/api-key-middleware.ts` - Update this
- `packages/usage/src/middleware.ts` - Already done (Task 3.1)
- `@nexus/usage` - Import from here

---

## 🚀 After Task 3.4

После завершения интеграции:

### 1. Test with Real API Keys
```bash
# Generate API key
POST /api/keys/generate

# Use key to make requests
curl -H "Authorization: ApiKey <key>" /api/test

# Check usage
GET /api/usage/current
```

### 2. Verify Rate Limiting
```bash
# Make 1001 requests as Free user
for i in {1..1001}; do
  curl -H "Authorization: ApiKey free_key" /api/test
done

# 1001st should return 429
```

### 3. Move to Task 3.5
```
Task 3.5: Overage Billing
- OverageService class
- Stripe invoice items
- Cron job for daily processing
```

---

## 📊 Progress

**Phase 3 Progress**: 50% → 65% (after Task 3.4)

| Task | Status | Duration |
|------|--------|----------|
| 3.1 Foundation | ✅ | 4-5h |
| 3.2 Database | ✅ | 2-3h |
| 3.3 Analytics API | ✅ | 3-4h |
| 3.4 Integration | 🚧 | 2-3h |
| 3.5 Overage | ⏳ | 3-4h |
| 3.6 Admin | ⏳ | 3-4h |

**Total**: 18-22h (estimated)
**Completed**: ~10h
**Remaining**: ~8-12h

---

## 🎯 Quick Start

1. Open `packages/auth/src/api-key-middleware.ts`
2. Import `withUsageTracking` from `@nexus/usage`
3. Wrap handler call
4. Test with curl
5. Verify in database
6. Update in dashboard

---

**You're doing great, Codex!** 💪

Половина Phase 3 завершена! Еще 3 задачи и готово! 🚀

---

**Prepared by**: Claude (Tech Architect)
**Date**: 2025-10-14
**Next Task**: Task 3.4 - Integration (2-3 hours)

---

*"Integration brings everything together."* 🔗✨
