# 🚀 Message to Codex - Task 3.2 Ready

**Дата**: 2025-10-14
**От**: Claude (Tech Architect)
**Кому**: Codex (Backend Developer)

---

## 🎉 Task 3.1: EXCELLENT WORK!

Привет, Codex!

Task 3.1 завершен на **отлично**! 🏆

**Grade**: **A+ (97/100)**

**Что выполнено**:
- ✅ Package `@nexus/usage` создан
- ✅ Batch processing (100 records / 5s)
- ✅ Repository pattern с Prisma
- ✅ Middleware wrapper
- ✅ App integration (workspace setup)
- ✅ Type safety (clean compilation)

**Подробный feedback**: `CODEX_FEEDBACK_PHASE_3_TASK_3.1.md`

---

## 🎯 Next: Task 3.2 - Database Schema

**Приоритет**: HIGH
**Duration**: 2-3 часа
**Цель**: Создать tables и functions для usage tracking

---

## 📋 Task 3.2 Checklist

### 1. Create Migration File
```bash
supabase/migrations/005_usage_tracking.sql
```

### 2. Tables to Create

#### ✅ Table 1: `eco_api_usage`
Detailed log каждого API call:
```sql
CREATE TABLE eco_api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eco_id TEXT NOT NULL REFERENCES eco_identities(eco_id) ON DELETE CASCADE,

    -- Request details
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Performance metrics
    response_time_ms INTEGER NOT NULL,
    status_code INTEGER NOT NULL,

    -- API key tracking
    api_key_id TEXT REFERENCES eco_api_keys(id) ON DELETE SET NULL,

    -- Metadata
    user_agent TEXT,
    ip_address INET,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```

**Indexes**:
```sql
CREATE INDEX idx_api_usage_eco_id_timestamp ON eco_api_usage(eco_id, timestamp DESC);
CREATE INDEX idx_api_usage_timestamp ON eco_api_usage(timestamp DESC);
CREATE INDEX idx_api_usage_endpoint ON eco_api_usage(endpoint);
CREATE INDEX idx_api_usage_status ON eco_api_usage(status_code);
```

---

#### ✅ Table 2: `eco_usage_daily`
Daily aggregation для fast analytics:
```sql
CREATE TABLE eco_usage_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eco_id TEXT NOT NULL REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Aggregated metrics
    total_calls INTEGER NOT NULL DEFAULT 0,
    successful_calls INTEGER NOT NULL DEFAULT 0,  -- 2xx
    failed_calls INTEGER NOT NULL DEFAULT 0,      -- 4xx/5xx
    avg_response_time_ms INTEGER NOT NULL DEFAULT 0,

    -- Top endpoints (JSONB)
    top_endpoints JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

    CONSTRAINT unique_usage_daily UNIQUE (eco_id, date)
);
```

**Index**:
```sql
CREATE INDEX idx_usage_daily_eco_id_date ON eco_usage_daily(eco_id, date DESC);
```

---

### 3. Functions to Create

#### ✅ Function 1: `increment_api_calls()`
Обновляет счетчики в `eco_usage_records`:

```sql
CREATE OR REPLACE FUNCTION increment_api_calls(
    p_eco_id TEXT,
    p_increment INTEGER
) RETURNS VOID AS $$
DECLARE
    v_subscription RECORD;
    v_usage_record RECORD;
    v_plan_limit INTEGER;
BEGIN
    -- Get current subscription
    SELECT plan, current_period_start, current_period_end
    INTO v_subscription
    FROM eco_subscriptions
    WHERE eco_id = p_eco_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No subscription found for eco_id: %', p_eco_id;
    END IF;

    -- Determine plan limit
    v_plan_limit := CASE v_subscription.plan
        WHEN 'free' THEN 1000
        WHEN 'pro' THEN 100000
        WHEN 'enterprise' THEN -1  -- unlimited
    END;

    -- Get or create usage record
    SELECT *
    INTO v_usage_record
    FROM eco_usage_records
    WHERE eco_id = p_eco_id
      AND billing_period_start = v_subscription.current_period_start;

    IF NOT FOUND THEN
        -- Create new usage record
        INSERT INTO eco_usage_records (
            eco_id,
            subscription_id,
            api_calls,
            billing_period_start,
            billing_period_end,
            overage_calls,
            overage_cost
        )
        SELECT
            p_eco_id,
            id,
            p_increment,
            current_period_start,
            current_period_end,
            CASE
                WHEN v_plan_limit = -1 THEN 0
                WHEN p_increment > v_plan_limit THEN p_increment - v_plan_limit
                ELSE 0
            END,
            CASE
                WHEN v_plan_limit = -1 THEN 0
                WHEN p_increment > v_plan_limit THEN (p_increment - v_plan_limit) * 10
                ELSE 0
            END
        FROM eco_subscriptions
        WHERE eco_id = p_eco_id;
    ELSE
        -- Update existing usage record
        UPDATE eco_usage_records
        SET
            api_calls = api_calls + p_increment,
            overage_calls = CASE
                WHEN v_plan_limit = -1 THEN 0
                WHEN api_calls + p_increment > v_plan_limit THEN (api_calls + p_increment) - v_plan_limit
                ELSE 0
            END,
            overage_cost = CASE
                WHEN v_plan_limit = -1 THEN 0
                WHEN api_calls + p_increment > v_plan_limit THEN ((api_calls + p_increment) - v_plan_limit) * 10
                ELSE 0
            END,
            updated_at = NOW()
        WHERE eco_id = p_eco_id
          AND billing_period_start = v_subscription.current_period_start;
    END IF;
END;
$$ LANGUAGE plpgsql;
```

---

#### ✅ Function 2: `aggregate_daily_usage()`
Создает daily summary:

```sql
CREATE OR REPLACE FUNCTION aggregate_daily_usage(p_date DATE) RETURNS VOID AS $$
BEGIN
    INSERT INTO eco_usage_daily (
        eco_id,
        date,
        total_calls,
        successful_calls,
        failed_calls,
        avg_response_time_ms,
        top_endpoints
    )
    SELECT
        eco_id,
        p_date,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300) as successful_calls,
        COUNT(*) FILTER (WHERE status_code >= 400) as failed_calls,
        AVG(response_time_ms)::INTEGER as avg_response_time_ms,
        jsonb_agg(
            jsonb_build_object('endpoint', endpoint, 'count', endpoint_count)
            ORDER BY endpoint_count DESC
        ) FILTER (WHERE endpoint_rank <= 10) as top_endpoints
    FROM (
        SELECT
            eco_id,
            endpoint,
            COUNT(*) as endpoint_count,
            ROW_NUMBER() OVER (PARTITION BY eco_id ORDER BY COUNT(*) DESC) as endpoint_rank,
            status_code,
            response_time_ms
        FROM eco_api_usage
        WHERE timestamp::DATE = p_date
        GROUP BY eco_id, endpoint, status_code, response_time_ms
    ) subquery
    GROUP BY eco_id
    ON CONFLICT (eco_id, date)
    DO UPDATE SET
        total_calls = EXCLUDED.total_calls,
        successful_calls = EXCLUDED.successful_calls,
        failed_calls = EXCLUDED.failed_calls,
        avg_response_time_ms = EXCLUDED.avg_response_time_ms,
        top_endpoints = EXCLUDED.top_endpoints;
END;
$$ LANGUAGE plpgsql;
```

---

### 4. Updated Timestamp Triggers

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- No trigger needed for eco_api_usage (insert-only)
-- Trigger already exists for eco_usage_records (from Phase 2)
```

---

## ✅ Success Criteria

Task 3.2 считается завершенной когда:

- ✅ Migration `005_usage_tracking.sql` создана
- ✅ Table `eco_api_usage` создана с indexes
- ✅ Table `eco_usage_daily` создана с indexes
- ✅ Function `increment_api_calls()` работает
- ✅ Function `aggregate_daily_usage()` работает
- ✅ Migration применена к Supabase
- ✅ Все таблицы и функции протестированы

---

## 🔍 Testing Checklist

После создания migration:

### 1. Apply Migration
```bash
cd supabase
npx supabase migration up
```

### 2. Test Tables
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('eco_api_usage', 'eco_usage_daily');

-- Check indexes
SELECT indexname FROM pg_indexes
WHERE tablename IN ('eco_api_usage', 'eco_usage_daily');
```

### 3. Test Functions
```sql
-- Test increment_api_calls
SELECT increment_api_calls('eco_usr_test123', 10);

-- Verify usage_records updated
SELECT * FROM eco_usage_records WHERE eco_id = 'eco_usr_test123';

-- Test aggregate_daily_usage
SELECT aggregate_daily_usage(CURRENT_DATE);

-- Verify daily usage created
SELECT * FROM eco_usage_daily WHERE date = CURRENT_DATE;
```

---

## 📚 Reference

**Full spec**: `CODEX_PHASE_3_USAGE_ANALYTICS.md` (lines 222-314)

**Key Points**:
- Tables должны быть optimized для high-write volume
- Indexes критичны для analytics queries
- Functions должны быть idempotent
- JSONB для flexible top_endpoints storage

---

## 💡 Tips

### Performance Optimization
- ✅ Use `timestamp DESC` indexes для recent queries
- ✅ Partition `eco_api_usage` by month (optional, для scale)
- ✅ JSONB index для `top_endpoints` (если нужно query)

### Data Integrity
- ✅ Foreign keys для referential integrity
- ✅ NOT NULL для critical fields
- ✅ Constraints для data validation

### Error Handling
- ✅ `RAISE EXCEPTION` для invalid data
- ✅ Transaction safety в functions
- ✅ Graceful degradation если subscription не найдена

---

## 🚀 After Task 3.2

После завершения миграции:

### 1. Update Repository
```typescript
// packages/usage/src/repository.ts
// Calls должны работать с новыми tables
```

### 2. Test Integration
```typescript
// apps/web/src/lib/usage/tracker.ts
// Verify batch writes to DB
```

### 3. Move to Task 3.3
```
Task 3.3: Usage Analytics API
- GET /api/usage/current
- GET /api/usage/history
- GET /api/usage/endpoints
```

---

## 📊 Progress

**Phase 3 Progress**: 20% → 35% (after Task 3.2)

| Task | Status | Duration |
|------|--------|----------|
| 3.1 Foundation | ✅ | 4-5h |
| 3.2 Database | 🚧 | 2-3h |
| 3.3 Analytics API | ⏳ | 3-4h |
| 3.4 Integration | ⏳ | 2-3h |
| 3.5 Overage | ⏳ | 3-4h |
| 3.6 Admin | ⏳ | 3-4h |

**Total**: 18-22h (estimated)
**Completed**: ~5h
**Remaining**: ~13-17h

---

## 🎯 Quick Start

1. Create file: `supabase/migrations/005_usage_tracking.sql`
2. Copy SQL from spec (Task 3.2 section)
3. Apply migration: `npx supabase migration up`
4. Test functions with sample data
5. Update in dashboard
6. Move to Task 3.3

---

**You've got this, Codex!** 💪

Foundation отличная, теперь нужна database layer. После этого всё заработает! 🚀

---

**Prepared by**: Claude (Tech Architect)
**Date**: 2025-10-14
**Next Task**: Task 3.2 - Database Schema (2-3 hours)

---

*"Good architecture needs good data structures."* 🏗️📊
