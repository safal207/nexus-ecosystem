# 🚀 Message to Codex - Task 3.6 Ready (FINAL!)

**Дата**: 2025-10-15
**От**: Claude (Tech Architect)
**Кому**: Codex (Backend Developer)

---

## 🎉 Task 3.5: OUTSTANDING WORK!

Привет, Codex!

Task 3.5 завершен **безупречно**! 🏆

**Grade**: **A+ (99/100)**

**Что выполнено**:
- ✅ `OverageService` class с batch processing
- ✅ Идемпотентный billing (no double-charging)
- ✅ Cron endpoint с защитой
- ✅ User-facing API для transparency
- ✅ Stripe invoice items integration
- ✅ Raw Prisma queries (pragmatic!)
- ✅ Migration с overage tracking

**Подробный feedback**: `CODEX_FEEDBACK_PHASE_3_TASK_3.5.md`

---

## 🎯 FINAL TASK: 3.6 - Admin Analytics Dashboard

**Приоритет**: HIGH
**Duration**: 3-4 часа
**Цель**: Создать admin endpoints для system-wide analytics

**🎊 THIS IS THE LAST TASK IN PHASE 3!** 🎊

---

## 📋 Task 3.6 Overview

### Goal:
Создать admin API endpoints для system-wide analytics, которые показывают:
- Общую статистику по системе (users, revenue, API calls)
- Breakdown по планам (Free, Pro, Enterprise)
- User list с usage данными
- MRR (Monthly Recurring Revenue) tracking
- Overage revenue tracking

### Current State:
- ✅ Usage tracking работает (Task 3.1)
- ✅ Database со всеми данными (Tasks 3.2)
- ✅ User analytics API (Task 3.3)
- ✅ Overage billing (Task 3.5)
- ⏳ Admin endpoints НЕ созданы

### Target State:
- ✅ Admin может видеть system-wide metrics
- ✅ Breakdown по plans (Free/Pro/Enterprise)
- ✅ User list с usage и revenue данными
- ✅ MRR + overage tracking
- ✅ Protected admin endpoints (admin-only access)

---

## 🔧 Implementation Guide

### Step 1: Create Admin Analytics Overview Endpoint

**File**: `apps/web/src/app/api/admin/analytics/overview/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/app/api/admin/_lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * GET /api/admin/analytics/overview
 *
 * System-wide analytics overview for admins
 *
 * Response:
 * {
 *   total_users: number,
 *   users_by_plan: { free: number, pro: number, enterprise: number },
 *   total_api_calls_this_month: number,
 *   mrr: number,
 *   overage_revenue_this_month: number,
 *   total_revenue_this_month: number,
 *   top_users_by_usage: Array<{ eco_id, api_calls, plan }>,
 *   timestamp: string
 * }
 */
export async function GET(req: NextRequest) {
  // 1. Verify admin access
  await requireAdminAuth(req);

  const supabase = getSupabaseAdmin();

  try {
    // 2. Get total users and breakdown by plan
    const { data: subscriptions, error: subError } = await supabase
      .from('eco_subscriptions')
      .select('plan, status')
      .eq('status', 'active');

    if (subError) throw subError;

    const usersByPlan = {
      free: subscriptions.filter((s) => s.plan === 'free').length,
      pro: subscriptions.filter((s) => s.plan === 'pro').length,
      enterprise: subscriptions.filter((s) => s.plan === 'enterprise').length,
    };

    const totalUsers = subscriptions.length;

    // 3. Calculate MRR (Monthly Recurring Revenue)
    // Free: $0, Pro: $49, Enterprise: custom (assume $500 for calculation)
    const mrr =
      usersByPlan.free * 0 +
      usersByPlan.pro * 49 +
      usersByPlan.enterprise * 500;

    // 4. Get total API calls this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: usageRecords, error: usageError } = await supabase
      .from('eco_usage_records')
      .select('api_calls, overage_cost')
      .gte('billing_period_start', startOfMonth.toISOString());

    if (usageError) throw usageError;

    const totalApiCalls = usageRecords.reduce(
      (sum, r) => sum + r.api_calls,
      0
    );
    const overageRevenue = usageRecords.reduce(
      (sum, r) => sum + r.overage_cost,
      0
    );

    // 5. Get top 10 users by usage
    const { data: topUsers, error: topUsersError } = await supabase
      .from('eco_usage_records')
      .select('eco_id, api_calls, subscription:eco_subscriptions(plan)')
      .gte('billing_period_start', startOfMonth.toISOString())
      .order('api_calls', { ascending: false })
      .limit(10);

    if (topUsersError) throw topUsersError;

    // 6. Return overview
    return NextResponse.json({
      total_users: totalUsers,
      users_by_plan: usersByPlan,
      total_api_calls_this_month: totalApiCalls,
      mrr: mrr,
      mrr_usd: `$${mrr.toLocaleString()}`,
      overage_revenue_this_month: overageRevenue / 100, // cents to USD
      overage_revenue_usd: `$${(overageRevenue / 100).toFixed(2)}`,
      total_revenue_this_month: mrr + overageRevenue / 100,
      total_revenue_usd: `$${(mrr + overageRevenue / 100).toFixed(2)}`,
      top_users_by_usage: topUsers.map((u) => ({
        eco_id: u.eco_id,
        api_calls: u.api_calls,
        plan: u.subscription?.plan || 'unknown',
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin] Overview error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch overview',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
```

---

### Step 2: Create Admin User List Endpoint

**File**: `apps/web/src/app/api/admin/analytics/users/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/app/api/admin/_lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * GET /api/admin/analytics/users?page=1&limit=50&plan=pro&sort=usage
 *
 * Paginated user list with usage and billing data
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 50, max: 100)
 * - plan: 'free' | 'pro' | 'enterprise' | 'all' (default: 'all')
 * - sort: 'usage' | 'overage' | 'revenue' | 'created' (default: 'usage')
 *
 * Response:
 * {
 *   users: Array<{
 *     eco_id: string,
 *     email: string,
 *     plan: string,
 *     status: string,
 *     api_calls: number,
 *     overage_calls: number,
 *     overage_cost_usd: number,
 *     subscription_revenue: number,
 *     total_revenue: number,
 *     created_at: string,
 *     last_api_call: string
 *   }>,
 *   pagination: {
 *     page: number,
 *     limit: number,
 *     total: number,
 *     total_pages: number
 *   }
 * }
 */
export async function GET(req: NextRequest) {
  // 1. Verify admin access
  await requireAdminAuth(req);

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const plan = searchParams.get('plan') || 'all';
  const sort = searchParams.get('sort') || 'usage';

  const supabase = getSupabaseAdmin();

  try {
    // 2. Build query
    let query = supabase
      .from('eco_subscriptions')
      .select(
        `
        eco_id,
        plan,
        status,
        created_at,
        identity:eco_identities(email),
        usage:eco_usage_records(api_calls, overage_calls, overage_cost, billing_period_start)
      `,
        { count: 'exact' }
      )
      .eq('status', 'active');

    // Filter by plan
    if (plan !== 'all') {
      query = query.eq('plan', plan);
    }

    // 3. Get total count (for pagination)
    const { count, error: countError } = await query;
    if (countError) throw countError;

    // 4. Get paginated data
    const offset = (page - 1) * limit;
    const { data: subscriptions, error } = await query
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // 5. Calculate revenue for each user
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const users = subscriptions.map((sub: any) => {
      const currentUsage = sub.usage?.find(
        (u: any) => new Date(u.billing_period_start) >= startOfMonth
      ) || { api_calls: 0, overage_calls: 0, overage_cost: 0 };

      const subscriptionRevenue =
        sub.plan === 'free' ? 0 : sub.plan === 'pro' ? 49 : 500;

      return {
        eco_id: sub.eco_id,
        email: sub.identity?.email || 'unknown',
        plan: sub.plan,
        status: sub.status,
        api_calls: currentUsage.api_calls,
        overage_calls: currentUsage.overage_calls,
        overage_cost_usd: currentUsage.overage_cost / 100,
        subscription_revenue: subscriptionRevenue,
        total_revenue: subscriptionRevenue + currentUsage.overage_cost / 100,
        created_at: sub.created_at,
        last_api_call: null, // TODO: Add from eco_api_usage if needed
      };
    });

    // 6. Sort users
    users.sort((a, b) => {
      switch (sort) {
        case 'usage':
          return b.api_calls - a.api_calls;
        case 'overage':
          return b.overage_calls - a.overage_calls;
        case 'revenue':
          return b.total_revenue - a.total_revenue;
        case 'created':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return 0;
      }
    });

    // 7. Return response
    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('[Admin] User list error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch user list',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
```

---

### Step 3: Create Admin Auth Helper

**File**: `apps/web/src/app/api/admin/_lib/auth.ts`

```typescript
import { NextRequest } from 'next/server';
import { verifyJWT } from '@nexus/auth';

/**
 * Require admin authentication
 *
 * Throws error if:
 * - No JWT token
 * - Invalid JWT token
 * - User is not admin
 *
 * Returns: { ecoId: string, email: string }
 */
export async function requireAdminAuth(req: NextRequest): Promise<{
  ecoId: string;
  email: string;
}> {
  // 1. Extract JWT from Authorization header
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing authorization token');
  }

  const token = authHeader.replace('Bearer ', '');

  // 2. Verify JWT
  const payload = await verifyJWT(token);

  if (!payload) {
    throw new Error('Invalid token');
  }

  // 3. Check if user is admin
  // Option 1: Hardcode admin ecoIds (simple, for MVP)
  const adminEcoIds = (process.env.ADMIN_ECO_IDS || '').split(',');

  if (!adminEcoIds.includes(payload.ecoId)) {
    throw new Error('Forbidden: Admin access required');
  }

  // Option 2: Check database for admin role (future)
  // const { data } = await supabase
  //   .from('eco_identities')
  //   .select('role')
  //   .eq('eco_id', payload.ecoId)
  //   .single();
  //
  // if (data?.role !== 'admin') {
  //   throw new Error('Forbidden');
  // }

  return {
    ecoId: payload.ecoId,
    email: payload.email || 'unknown',
  };
}
```

**Environment Variable**:
```bash
# .env.local
ADMIN_ECO_IDS=eco_usr_admin123,eco_usr_admin456
```

---

### Step 4: Add Environment Variable

**File**: `.env.local` (and production environment)

```bash
# Existing
STRIPE_SECRET_KEY=sk_test_...
CRON_SECRET=...

# NEW: Admin user list
ADMIN_ECO_IDS=eco_usr_admin1,eco_usr_admin2
```

**How to set**:
1. Create admin user via registration
2. Get their `eco_id` from database
3. Add to `ADMIN_ECO_IDS` env var (comma-separated)

---

### Step 5: Create Admin Revenue Summary Endpoint (Optional)

**File**: `apps/web/src/app/api/admin/analytics/revenue/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/app/api/admin/_lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * GET /api/admin/analytics/revenue?months=12
 *
 * Monthly revenue breakdown (MRR + overage)
 *
 * Response:
 * {
 *   months: Array<{
 *     month: string, // "2025-10"
 *     mrr: number,
 *     overage_revenue: number,
 *     total_revenue: number,
 *     users_by_plan: { free, pro, enterprise }
 *   }>,
 *   totals: {
 *     total_mrr: number,
 *     total_overage: number,
 *     total_revenue: number
 *   }
 * }
 */
export async function GET(req: NextRequest) {
  // 1. Verify admin access
  await requireAdminAuth(req);

  const { searchParams } = new URL(req.url);
  const months = parseInt(searchParams.get('months') || '12');

  const supabase = getSupabaseAdmin();

  try {
    // 2. Get monthly data for last N months
    const results = [];
    const now = new Date();

    for (let i = 0; i < months; i++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = monthDate.toISOString().substring(0, 7); // "2025-10"

      // Get active subscriptions for this month
      const { data: subs, error: subsError } = await supabase
        .from('eco_subscriptions')
        .select('plan')
        .eq('status', 'active')
        .lte('created_at', new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).toISOString());

      if (subsError) throw subsError;

      const usersByPlan = {
        free: subs.filter((s) => s.plan === 'free').length,
        pro: subs.filter((s) => s.plan === 'pro').length,
        enterprise: subs.filter((s) => s.plan === 'enterprise').length,
      };

      const mrr = usersByPlan.pro * 49 + usersByPlan.enterprise * 500;

      // Get overage revenue for this month
      const { data: usage, error: usageError } = await supabase
        .from('eco_usage_records')
        .select('overage_cost')
        .gte('billing_period_start', monthDate.toISOString())
        .lt('billing_period_start', new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).toISOString());

      if (usageError) throw usageError;

      const overageRevenue = usage.reduce((sum, u) => sum + u.overage_cost, 0) / 100;

      results.push({
        month: monthStr,
        mrr,
        overage_revenue: overageRevenue,
        total_revenue: mrr + overageRevenue,
        users_by_plan: usersByPlan,
      });
    }

    // 3. Calculate totals
    const totals = results.reduce(
      (acc, month) => ({
        total_mrr: acc.total_mrr + month.mrr,
        total_overage: acc.total_overage + month.overage_revenue,
        total_revenue: acc.total_revenue + month.total_revenue,
      }),
      { total_mrr: 0, total_overage: 0, total_revenue: 0 }
    );

    return NextResponse.json({
      months: results.reverse(), // oldest first
      totals,
    });
  } catch (error) {
    console.error('[Admin] Revenue error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch revenue data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
```

---

## ✅ Success Criteria

Task 3.6 считается завершенной когда:

- ✅ `GET /api/admin/analytics/overview` создан
- ✅ `GET /api/admin/analytics/users` создан с pagination
- ✅ Admin auth helper `requireAdminAuth()` создан
- ✅ Environment variable `ADMIN_ECO_IDS` настроен
- ✅ System-wide metrics (users, MRR, API calls, overage)
- ✅ User list с usage и revenue данными
- ✅ Pagination и filtering работают
- ✅ Tests passed (manual или automated)
- ✅ (Optional) Revenue breakdown endpoint

---

## 🧪 Testing Guide

### Test 1: Admin Overview
```bash
# Get admin JWT token
export ADMIN_JWT="eyJ..."

# Call overview endpoint
curl -H "Authorization: Bearer $ADMIN_JWT" \
  http://localhost:3000/api/admin/analytics/overview

# Expected response:
# {
#   "total_users": 150,
#   "users_by_plan": { "free": 100, "pro": 45, "enterprise": 5 },
#   "total_api_calls_this_month": 5000000,
#   "mrr": 4705,
#   "mrr_usd": "$4,705",
#   "overage_revenue_this_month": 250.50,
#   "total_revenue_usd": "$4,955.50",
#   "top_users_by_usage": [...]
# }
```

### Test 2: User List (Paginated)
```bash
# Get first page
curl -H "Authorization: Bearer $ADMIN_JWT" \
  "http://localhost:3000/api/admin/analytics/users?page=1&limit=20"

# Expected response:
# {
#   "users": [
#     {
#       "eco_id": "eco_usr_123",
#       "email": "user@example.com",
#       "plan": "pro",
#       "api_calls": 120000,
#       "overage_calls": 20000,
#       "overage_cost_usd": 20.00,
#       "total_revenue": 69.00
#     },
#     ...
#   ],
#   "pagination": {
#     "page": 1,
#     "limit": 20,
#     "total": 150,
#     "total_pages": 8
#   }
# }
```

### Test 3: Filter by Plan
```bash
# Get only Pro users
curl -H "Authorization: Bearer $ADMIN_JWT" \
  "http://localhost:3000/api/admin/analytics/users?plan=pro&sort=overage"

# Expected: Only Pro users, sorted by overage_calls DESC
```

### Test 4: Admin Auth (Unauthorized)
```bash
# Try with non-admin token
curl -H "Authorization: Bearer $USER_JWT" \
  http://localhost:3000/api/admin/analytics/overview

# Expected: 403 Forbidden
# { "error": "Forbidden: Admin access required" }
```

### Test 5: Revenue Breakdown (Optional)
```bash
# Get 12-month revenue history
curl -H "Authorization: Bearer $ADMIN_JWT" \
  "http://localhost:3000/api/admin/analytics/revenue?months=12"

# Expected: Monthly breakdown with MRR + overage
```

---

## 📊 Expected Results

### Overview Response Example:
```json
{
  "total_users": 150,
  "users_by_plan": {
    "free": 100,
    "pro": 45,
    "enterprise": 5
  },
  "total_api_calls_this_month": 5000000,
  "mrr": 4705,
  "mrr_usd": "$4,705",
  "overage_revenue_this_month": 250.50,
  "overage_revenue_usd": "$250.50",
  "total_revenue_this_month": 4955.50,
  "total_revenue_usd": "$4,955.50",
  "top_users_by_usage": [
    {
      "eco_id": "eco_usr_top1",
      "api_calls": 250000,
      "plan": "enterprise"
    },
    ...
  ],
  "timestamp": "2025-10-15T12:00:00Z"
}
```

### User List Response Example:
```json
{
  "users": [
    {
      "eco_id": "eco_usr_123",
      "email": "poweruser@example.com",
      "plan": "pro",
      "status": "active",
      "api_calls": 120000,
      "overage_calls": 20000,
      "overage_cost_usd": 20.00,
      "subscription_revenue": 49,
      "total_revenue": 69.00,
      "created_at": "2025-09-01T00:00:00Z"
    },
    ...
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "total_pages": 3
  }
}
```

---

## 🔍 Troubleshooting

### Issue 1: 403 Forbidden
**Symptom**: Admin endpoint returns 403

**Debug**:
```bash
# Check ADMIN_ECO_IDS env var
echo $ADMIN_ECO_IDS

# Check JWT payload
# Decode token at jwt.io and verify ecoId matches
```

**Solution**: Add your `eco_id` to `ADMIN_ECO_IDS`

---

### Issue 2: No Usage Data
**Symptom**: `api_calls` shows 0 for all users

**Debug**:
```sql
-- Check eco_usage_records table
SELECT eco_id, api_calls, billing_period_start
FROM eco_usage_records
ORDER BY billing_period_start DESC
LIMIT 10;
```

**Solution**: Verify usage tracking is working (make API calls with keys)

---

### Issue 3: MRR Calculation Wrong
**Symptom**: MRR doesn't match expected value

**Debug**:
```typescript
// Check plan pricing
const prices = { free: 0, pro: 49, enterprise: 500 };
console.log('Users by plan:', usersByPlan);
console.log('Calculated MRR:', mrr);
```

**Solution**: Verify subscription plans in database

---

## 💡 Tips

### Performance:
- ✅ Use Supabase indexes for fast queries
- ✅ Pagination prevents large result sets
- ✅ Consider caching overview (Redis) for high traffic

### Security:
- ✅ Admin-only access via `requireAdminAuth()`
- ✅ JWT verification
- ✅ Environment-based admin list

### UX:
- ✅ Clear response formats
- ✅ Pagination metadata
- ✅ Sorting options
- ✅ Filter by plan

---

## 📚 Reference

**Full spec**: `CODEX_PHASE_3_USAGE_ANALYTICS.md` (lines 750-850)

**Key Files**:
- `apps/web/src/app/api/admin/analytics/overview/route.ts` - Create this
- `apps/web/src/app/api/admin/analytics/users/route.ts` - Create this
- `apps/web/src/app/api/admin/_lib/auth.ts` - Create this
- `apps/web/src/app/api/admin/analytics/revenue/route.ts` - Optional

---

## 🚀 After Task 3.6

После завершения admin dashboard:

### 1. Phase 3 Complete! 🎉
```
✅ Task 3.1: Usage Tracking Foundation
✅ Task 3.2: Database Schema
✅ Task 3.3: Analytics API
✅ Task 3.4: API Key Integration
✅ Task 3.5: Overage Billing
✅ Task 3.6: Admin Dashboard

PHASE 3: 100% COMPLETE! 🏆
```

### 2. Next: Comprehensive Testing
```
Claude will write tests for:
- UsageTracker class
- Analytics API endpoints
- OverageService class
- Admin endpoints
- Integration tests

Target: ~80+ test cases, >85% coverage
Duration: 15-18 hours
```

### 3. Then: Phase 4 (Frontend)
```
- Usage dashboard UI
- Billing page with overage display
- Admin analytics dashboard
- Charts and visualizations
```

---

## 📊 Progress

**Phase 3 Progress**: 83% → **100%** (after Task 3.6) 🎉

| Task | Status | Duration |
|------|--------|----------|
| 3.1 Foundation | ✅ A+ (97) | 4-5h |
| 3.2 Database | ✅ A+ (99) | 2-3h |
| 3.3 Analytics API | ✅ A+ (98) | 3-4h |
| 3.4 Integration | ✅ A+ (99) | 2-3h |
| 3.5 Overage | ✅ A+ (99) | 3-4h |
| 3.6 Admin | 🚧 | 3-4h |

**Total**: 18-22h (estimated)
**Completed**: ~15-18h
**Remaining**: 3-4h (THIS TASK!)

---

## 🎯 Quick Start

1. Create `apps/web/src/app/api/admin/analytics/overview/route.ts`
2. Create `apps/web/src/app/api/admin/analytics/users/route.ts`
3. Create `apps/web/src/app/api/admin/_lib/auth.ts`
4. Add `ADMIN_ECO_IDS` to environment variables
5. Test with admin JWT token
6. Verify pagination and filtering
7. (Optional) Create revenue breakdown endpoint

---

## 🎊 THIS IS IT, CODEX!

**THE FINAL TASK OF PHASE 3!** 🏁

После этой задачи:
- ✅ Phase 3: **100% COMPLETE**
- ✅ Usage analytics: **DONE**
- ✅ Rate limiting: **DONE**
- ✅ Overage billing: **DONE**
- ✅ Admin dashboard: **DONE**

**You've built a complete usage analytics & billing system!** 💪

---

**Amazing work throughout Phase 3, Codex!** 🏆

Let's finish strong! 🚀🔥

---

**Prepared by**: Claude (Tech Architect)
**Date**: 2025-10-15
**Next Task**: Task 3.6 - Admin Analytics Dashboard (FINAL!)

---

*"Finish what you started. Ship the feature."* 🎯✨
