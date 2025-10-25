# 🚀 Codex - Phase 3: Usage Analytics & Rate Limiting

**Дата выдачи**: 2025-10-14
**Приоритет**: HIGH
**Estimated Duration**: 18-22 часа
**Цель**: Production-ready система трекинга использования API и enforcement лимитов

---

## 🎯 Обзор задачи

Привет, Codex! Отличная работа в Phase 2 - биллинг система готова! 🏆

Теперь нужно реализовать **Usage Analytics & Rate Limiting** - систему, которая:
1. Отслеживает каждый API call пользователя
2. Применяет лимиты по тарифным планам
3. Рассчитывает overage (превышение лимитов)
4. Предоставляет analytics dashboard
5. Интегрируется с billing системой

**Контекст**:
- ✅ Billing система работает (Free, Pro, Enterprise)
- ✅ API Keys с базовым rate limiting
- ✅ EcoID для каждого пользователя
- 🆕 Нужен точный учет API calls
- 🆕 Enforcement лимитов по планам
- 🆕 Usage-based billing для overage

**Бизнес-логика**:
- **Free**: 1,000 API calls/month → блокировка при превышении
- **Pro**: 100,000 API calls/month → $0.001 за каждый overage call
- **Enterprise**: Unlimited API calls

---

## 📋 Задачи (Tasks 3.1 - 3.6)

### Task 3.1: Usage Tracking Middleware (4-5 часов)

**Цель**: Создать middleware для автоматического трекинга API calls

**Deliverables**:

#### 1. Usage Tracking Service

```typescript
// packages/usage/src/usage-tracker.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface UsageRecord {
  eco_id: string;
  endpoint: string;
  method: string;
  timestamp: Date;
  response_time_ms: number;
  status_code: number;
  api_key_id?: string;
}

export class UsageTracker {
  private sb: SupabaseClient;
  private batchQueue: UsageRecord[] = [];
  private batchSize = 100;
  private flushInterval = 5000; // 5 seconds

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.sb = createClient(supabaseUrl, supabaseKey);
    this.startBatchFlush();
  }

  /**
   * Track a single API call
   */
  async track(record: UsageRecord): Promise<void> {
    this.batchQueue.push(record);

    // Flush if batch is full
    if (this.batchQueue.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Start periodic batch flush
   */
  private startBatchFlush(): void {
    setInterval(() => {
      if (this.batchQueue.length > 0) {
        this.flush().catch(console.error);
      }
    }, this.flushInterval);
  }

  /**
   * Flush batch to database
   */
  private async flush(): Promise<void> {
    if (this.batchQueue.length === 0) return;

    const batch = [...this.batchQueue];
    this.batchQueue = [];

    try {
      // Insert batch into eco_api_usage table
      const { error } = await this.sb.from('eco_api_usage').insert(
        batch.map(record => ({
          eco_id: record.eco_id,
          endpoint: record.endpoint,
          method: record.method,
          timestamp: record.timestamp.toISOString(),
          response_time_ms: record.response_time_ms,
          status_code: record.status_code,
          api_key_id: record.api_key_id,
        }))
      );

      if (error) {
        console.error('Failed to flush usage batch:', error);
        // Re-queue failed records
        this.batchQueue.unshift(...batch);
      }

      // Update current period usage count
      await this.updateCurrentPeriodUsage(batch);
    } catch (error) {
      console.error('Batch flush error:', error);
    }
  }

  /**
   * Update current billing period usage count
   */
  private async updateCurrentPeriodUsage(batch: UsageRecord[]): Promise<void> {
    // Group by eco_id
    const usageByUser = batch.reduce((acc, record) => {
      acc[record.eco_id] = (acc[record.eco_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Update eco_usage_records for each user
    for (const [ecoId, count] of Object.entries(usageByUser)) {
      await this.sb.rpc('increment_api_calls', {
        p_eco_id: ecoId,
        p_increment: count,
      });
    }
  }

  /**
   * Get current usage for a user
   */
  async getCurrentUsage(ecoId: string): Promise<{
    apiCalls: number;
    periodStart: Date;
    periodEnd: Date;
    limit: number;
    overageCalls: number;
  }> {
    // Get current subscription
    const { data: subscription } = await this.sb
      .from('eco_subscriptions')
      .select('plan, current_period_start, current_period_end')
      .eq('eco_id', ecoId)
      .single();

    if (!subscription) {
      throw new Error('No subscription found');
    }

    // Get usage for current period
    const { data: usage } = await this.sb
      .from('eco_usage_records')
      .select('api_calls, overage_calls')
      .eq('eco_id', ecoId)
      .eq('billing_period_start', subscription.current_period_start)
      .single();

    // Determine limit based on plan
    const limits = {
      free: 1000,
      pro: 100000,
      enterprise: -1, // unlimited
    };

    const limit = limits[subscription.plan as keyof typeof limits];
    const apiCalls = usage?.api_calls || 0;
    const overageCalls = usage?.overage_calls || 0;

    return {
      apiCalls,
      periodStart: new Date(subscription.current_period_start),
      periodEnd: new Date(subscription.current_period_end),
      limit,
      overageCalls,
    };
  }

  /**
   * Check if user has exceeded their limit
   */
  async hasExceededLimit(ecoId: string): Promise<boolean> {
    const usage = await this.getCurrentUsage(ecoId);

    // Unlimited plan
    if (usage.limit === -1) return false;

    return usage.apiCalls >= usage.limit;
  }
}
```

#### 2. Usage Tracking Middleware

```typescript
// packages/usage/src/middleware.ts

import { NextRequest, NextResponse } from 'next/server';
import { UsageTracker } from './usage-tracker';

const tracker = new UsageTracker(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export interface UsageContext {
  ecoId: string;
  apiKeyId?: string;
}

/**
 * Middleware to track API usage
 */
export async function withUsageTracking(
  req: NextRequest,
  context: UsageContext,
  handler: (req: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Check if user has exceeded limit
    const exceeded = await tracker.hasExceededLimit(context.ecoId);

    if (exceeded) {
      // Get current usage to provide details
      const usage = await tracker.getCurrentUsage(context.ecoId);

      // For Free plan: block the request
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

      // For Pro plan: allow but track overage
      console.log(`User ${context.ecoId} in overage: ${usage.overageCalls} calls`);
    }

    // Execute the actual API handler
    const response = await handler(req);

    // Track usage
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

    // Add usage headers to response
    const usage = await tracker.getCurrentUsage(context.ecoId);
    response.headers.set('X-RateLimit-Limit', usage.limit.toString());
    response.headers.set('X-RateLimit-Remaining', Math.max(0, usage.limit - usage.apiCalls).toString());
    response.headers.set('X-RateLimit-Reset', usage.periodEnd.toISOString());

    return response;
  } catch (error) {
    console.error('Usage tracking error:', error);
    // Don't block request if tracking fails
    return handler(req);
  }
}
```

**Success Criteria**:
- ✅ UsageTracker class создан
- ✅ Batch processing реализован (100 records / 5 seconds)
- ✅ Middleware отслеживает все API calls
- ✅ Rate limit headers добавлены
- ✅ Free plan блокируется при превышении
- ✅ Pro plan разрешает overage

---

### Task 3.2: Database Schema для Usage Tracking (2-3 часа)

**Цель**: Расширить DB схему для детального трекинга

**Deliverables**:

```sql
-- supabase/migrations/005_usage_tracking.sql

-- Detailed API usage log (for analytics)
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

    -- API key tracking (if request used API key)
    api_key_id TEXT REFERENCES eco_api_keys(id) ON DELETE SET NULL,

    -- Metadata
    user_agent TEXT,
    ip_address INET,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Partition by month for performance
CREATE INDEX idx_api_usage_eco_id_timestamp ON eco_api_usage(eco_id, timestamp DESC);
CREATE INDEX idx_api_usage_timestamp ON eco_api_usage(timestamp DESC);
CREATE INDEX idx_api_usage_endpoint ON eco_api_usage(endpoint);
CREATE INDEX idx_api_usage_status ON eco_api_usage(status_code);

-- Function to increment API calls in current period
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
        WHEN 'enterprise' THEN -1 -- unlimited
    END;

    -- Get or create usage record for current period
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
                WHEN v_plan_limit = -1 THEN 0 -- unlimited
                WHEN p_increment > v_plan_limit THEN p_increment - v_plan_limit
                ELSE 0
            END,
            CASE
                WHEN v_plan_limit = -1 THEN 0
                WHEN p_increment > v_plan_limit THEN (p_increment - v_plan_limit) * 10 -- $0.001 = 10 cents per 100 calls
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

-- Daily aggregation table (for fast analytics)
CREATE TABLE eco_usage_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eco_id TEXT NOT NULL REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Aggregated metrics
    total_calls INTEGER NOT NULL DEFAULT 0,
    successful_calls INTEGER NOT NULL DEFAULT 0, -- 2xx status
    failed_calls INTEGER NOT NULL DEFAULT 0, -- 4xx/5xx status
    avg_response_time_ms INTEGER NOT NULL DEFAULT 0,

    -- Top endpoints
    top_endpoints JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

    CONSTRAINT unique_usage_daily UNIQUE (eco_id, date)
);

CREATE INDEX idx_usage_daily_eco_id_date ON eco_usage_daily(eco_id, date DESC);

-- Function to aggregate daily usage
CREATE OR REPLACE FUNCTION aggregate_daily_usage(p_date DATE) RETURNS VOID AS $$
BEGIN
    INSERT INTO eco_usage_daily (eco_id, date, total_calls, successful_calls, failed_calls, avg_response_time_ms, top_endpoints)
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

**Success Criteria**:
- ✅ `eco_api_usage` таблица создана
- ✅ `eco_usage_daily` таблица создана
- ✅ `increment_api_calls()` функция работает
- ✅ `aggregate_daily_usage()` функция работает
- ✅ Индексы оптимизированы

---

### Task 3.3: Usage Analytics API (3-4 часа)

**Цель**: API endpoints для получения analytics данных

**Deliverables**:

```typescript
// apps/web/app/api/usage/current/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '../../../../../packages/auth/src/middleware';
import { UsageTracker } from '../../../../../packages/usage/src/usage-tracker';

const tracker = new UsageTracker(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const auth = verifyJWT(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const usage = await tracker.getCurrentUsage(auth.user.ecoId);

    return NextResponse.json({
      api_calls: usage.apiCalls,
      limit: usage.limit,
      remaining: usage.limit === -1 ? -1 : Math.max(0, usage.limit - usage.apiCalls),
      overage_calls: usage.overageCalls,
      period_start: usage.periodStart,
      period_end: usage.periodEnd,
      usage_percentage: usage.limit === -1 ? 0 : (usage.apiCalls / usage.limit) * 100,
    });
  } catch (error: any) {
    console.error('Get usage error:', error);
    return NextResponse.json({ error: 'Failed to get usage' }, { status: 500 });
  }
}
```

```typescript
// apps/web/app/api/usage/history/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '../../../../../packages/auth/src/middleware';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const auth = verifyJWT(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '30');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get daily aggregated data
    const { data, error } = await supabase
      .from('eco_usage_daily')
      .select('*')
      .eq('eco_id', auth.user.ecoId)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      history: data,
      period_days: days,
    });
  } catch (error: any) {
    console.error('Get usage history error:', error);
    return NextResponse.json({ error: 'Failed to get usage history' }, { status: 500 });
  }
}
```

```typescript
// apps/web/app/api/usage/endpoints/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '../../../../../packages/auth/src/middleware';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const auth = verifyJWT(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '7');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get endpoint usage stats
    const { data, error } = await supabase
      .from('eco_api_usage')
      .select('endpoint, method, status_code, response_time_ms')
      .eq('eco_id', auth.user.ecoId)
      .gte('timestamp', startDate.toISOString());

    if (error) throw error;

    // Aggregate by endpoint
    const endpointStats = data.reduce((acc, record) => {
      const key = `${record.method} ${record.endpoint}`;
      if (!acc[key]) {
        acc[key] = {
          endpoint: record.endpoint,
          method: record.method,
          total_calls: 0,
          success_rate: 0,
          avg_response_time: 0,
          response_times: [],
        };
      }

      acc[key].total_calls++;
      acc[key].response_times.push(record.response_time_ms);

      return acc;
    }, {} as Record<string, any>);

    // Calculate stats
    const stats = Object.values(endpointStats).map((stat: any) => ({
      endpoint: stat.endpoint,
      method: stat.method,
      total_calls: stat.total_calls,
      avg_response_time: Math.round(
        stat.response_times.reduce((a: number, b: number) => a + b, 0) / stat.response_times.length
      ),
      p95_response_time: Math.round(
        stat.response_times.sort((a: number, b: number) => a - b)[Math.floor(stat.response_times.length * 0.95)]
      ),
    }));

    // Sort by total calls
    stats.sort((a, b) => b.total_calls - a.total_calls);

    return NextResponse.json({
      endpoints: stats.slice(0, 50), // Top 50
      period_days: days,
    });
  } catch (error: any) {
    console.error('Get endpoint stats error:', error);
    return NextResponse.json({ error: 'Failed to get endpoint stats' }, { status: 500 });
  }
}
```

**API Endpoints Summary**:
- `GET /api/usage/current` - Current period usage
- `GET /api/usage/history?days=30` - Historical usage (daily aggregates)
- `GET /api/usage/endpoints?days=7` - Endpoint statistics

**Success Criteria**:
- ✅ Все 3 endpoint'а созданы
- ✅ JWT authentication работает
- ✅ Aggregation работает корректно
- ✅ Performance оптимизирован

---

### Task 3.4: Integration с API Key Middleware (2-3 часа)

**Цель**: Интегрировать usage tracking в существующий API key middleware

**Deliverables**:

```typescript
// packages/auth/src/api-key-middleware.ts (UPDATE)

import { NextRequest, NextResponse } from 'next/server';
import { withUsageTracking } from '../../usage/src/middleware';

export async function withApiKey(
  req: NextRequest,
  handler: (req: NextRequest, context: { ecoId: string; apiKeyId: string }) => Promise<NextResponse>
): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('ApiKey ')) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
  }

  const apiKey = authHeader.replace('ApiKey ', '');
  const [keyId, secret] = apiKey.split('.');

  if (!keyId || !secret) {
    return NextResponse.json({ error: 'Invalid API key format' }, { status: 401 });
  }

  // Verify API key (existing logic)
  const { valid, ecoId } = await verifyApiKey(keyId, secret);

  if (!valid || !ecoId) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  // Wrap handler with usage tracking
  return withUsageTracking(
    req,
    { ecoId, apiKeyId: keyId },
    (req) => handler(req, { ecoId, apiKeyId: keyId })
  );
}
```

**Example Usage**:

```typescript
// apps/web/app/api/example/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { withApiKey } from '../../../../packages/auth/src/api-key-middleware';

export async function GET(req: NextRequest) {
  return withApiKey(req, async (req, context) => {
    // Your API logic here
    // context.ecoId - user's EcoID
    // context.apiKeyId - API key ID used

    return NextResponse.json({
      message: 'Success',
      eco_id: context.ecoId
    });
  });
}
```

**Success Criteria**:
- ✅ API key middleware обновлен
- ✅ Usage tracking автоматически работает
- ✅ Rate limiting работает
- ✅ Headers добавляются корректно

---

### Task 3.5: Overage Billing Calculation (3-4 часа)

**Цель**: Автоматический расчет overage costs для биллинга

**Deliverables**:

```typescript
// packages/billing/src/overage-service.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

export class OverageService {
  private sb: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.sb = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Calculate overage cost for a billing period
   */
  async calculateOverageCost(ecoId: string, periodStart: string): Promise<number> {
    const { data: usage } = await this.sb
      .from('eco_usage_records')
      .select('overage_calls')
      .eq('eco_id', ecoId)
      .eq('billing_period_start', periodStart)
      .single();

    if (!usage || usage.overage_calls === 0) return 0;

    // $0.001 per overage call = 10 cents per 100 calls
    // overage_cost is stored in cents
    return Math.ceil((usage.overage_calls * 10) / 100);
  }

  /**
   * Create Stripe invoice item for overage
   */
  async chargeOverage(ecoId: string, periodStart: string): Promise<void> {
    const overageCost = await this.calculateOverageCost(ecoId, periodStart);

    if (overageCost === 0) {
      console.log(`No overage for ${ecoId}`);
      return;
    }

    // Get Stripe customer ID
    const { data: subscription } = await this.sb
      .from('eco_subscriptions')
      .select('stripe_customer_id')
      .eq('eco_id', ecoId)
      .single();

    if (!subscription?.stripe_customer_id) {
      console.error(`No Stripe customer for ${ecoId}`);
      return;
    }

    // Create invoice item
    await stripe.invoiceItems.create({
      customer: subscription.stripe_customer_id,
      amount: overageCost,
      currency: 'usd',
      description: `API overage charges for period starting ${periodStart}`,
      metadata: {
        eco_id: ecoId,
        period_start: periodStart,
        type: 'api_overage',
      },
    });

    console.log(`Created overage invoice item for ${ecoId}: $${overageCost / 100}`);
  }

  /**
   * Process overage for all Pro users at period end
   */
  async processMonthlyOverage(): Promise<void> {
    // Get all Pro subscriptions ending today
    const today = new Date().toISOString().split('T')[0];

    const { data: subscriptions } = await this.sb
      .from('eco_subscriptions')
      .select('eco_id, current_period_start, current_period_end')
      .eq('plan', 'pro')
      .gte('current_period_end', today)
      .lt('current_period_end', `${today}T23:59:59`);

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No subscriptions ending today');
      return;
    }

    console.log(`Processing overage for ${subscriptions.length} subscriptions`);

    for (const sub of subscriptions) {
      try {
        await this.chargeOverage(sub.eco_id, sub.current_period_start);
      } catch (error) {
        console.error(`Failed to charge overage for ${sub.eco_id}:`, error);
      }
    }
  }
}
```

```typescript
// scripts/process-monthly-overage.ts

import { OverageService } from '../packages/billing/src/overage-service';

const overageService = new OverageService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  console.log('Processing monthly overage...');
  await overageService.processMonthlyOverage();
  console.log('Done!');
}

main().catch(console.error);
```

**Cron Job Setup** (Vercel Cron or similar):

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/process-overage",
      "schedule": "0 0 * * *"
    }
  ]
}
```

```typescript
// apps/web/app/api/cron/process-overage/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { OverageService } from '../../../../../packages/billing/src/overage-service';

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const overageService = new OverageService(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    await overageService.processMonthlyOverage();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Overage processing error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

**Success Criteria**:
- ✅ OverageService создан
- ✅ Overage calculation корректен
- ✅ Stripe invoice items создаются
- ✅ Cron job настроен
- ✅ Error handling реализован

---

### Task 3.6: Admin Analytics Dashboard API (3-4 часа)

**Цель**: API для admin dashboard с системными метриками

**Deliverables**:

```typescript
// apps/web/app/api/admin/analytics/overview/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '../../../../../../packages/auth/src/middleware';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Verify admin access
    const auth = verifyJWT(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // TODO: Check if user is admin
    // For now, allow all authenticated users

    // Get system-wide metrics
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().substring(0, 7);

    // Total users by plan
    const { data: planDistribution } = await supabase
      .from('eco_subscriptions')
      .select('plan')
      .eq('status', 'active');

    const planCounts = planDistribution?.reduce((acc, sub) => {
      acc[sub.plan] = (acc[sub.plan] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Total API calls today
    const { count: callsToday } = await supabase
      .from('eco_api_usage')
      .select('*', { count: 'exact', head: true })
      .gte('timestamp', `${today}T00:00:00`)
      .lt('timestamp', `${today}T23:59:59`);

    // Total API calls this month
    const { count: callsThisMonth } = await supabase
      .from('eco_api_usage')
      .select('*', { count: 'exact', head: true })
      .gte('timestamp', `${thisMonth}-01T00:00:00`);

    // Total overage revenue this month
    const { data: overageData } = await supabase
      .from('eco_usage_records')
      .select('overage_cost')
      .gte('billing_period_start', `${thisMonth}-01T00:00:00`);

    const totalOverageRevenue = overageData?.reduce((sum, record) => sum + record.overage_cost, 0) || 0;

    // Total MRR (Monthly Recurring Revenue)
    const mrr = (planCounts?.pro || 0) * 29 + (planCounts?.enterprise || 0) * 299;

    return NextResponse.json({
      users: {
        free: planCounts?.free || 0,
        pro: planCounts?.pro || 0,
        enterprise: planCounts?.enterprise || 0,
        total: planDistribution?.length || 0,
      },
      api_calls: {
        today: callsToday || 0,
        this_month: callsThisMonth || 0,
      },
      revenue: {
        mrr: mrr,
        overage_this_month: totalOverageRevenue / 100, // Convert cents to dollars
      },
    });
  } catch (error: any) {
    console.error('Admin analytics error:', error);
    return NextResponse.json({ error: 'Failed to get analytics' }, { status: 500 });
  }
}
```

```typescript
// apps/web/app/api/admin/analytics/users/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '../../../../../../packages/auth/src/middleware';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const auth = verifyJWT(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get users with their usage stats
    const { data: users, error } = await supabase
      .from('eco_subscriptions')
      .select(`
        eco_id,
        plan,
        status,
        current_period_start,
        current_period_end,
        created_at
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Get usage for each user
    const usersWithUsage = await Promise.all(
      users.map(async (user) => {
        const { data: usage } = await supabase
          .from('eco_usage_records')
          .select('api_calls, overage_calls, overage_cost')
          .eq('eco_id', user.eco_id)
          .eq('billing_period_start', user.current_period_start)
          .single();

        return {
          ...user,
          usage: usage || { api_calls: 0, overage_calls: 0, overage_cost: 0 },
        };
      })
    );

    return NextResponse.json({
      users: usersWithUsage,
      pagination: {
        limit,
        offset,
        total: users.length,
      },
    });
  } catch (error: any) {
    console.error('Admin users error:', error);
    return NextResponse.json({ error: 'Failed to get users' }, { status: 500 });
  }
}
```

**API Endpoints Summary**:
- `GET /api/admin/analytics/overview` - System overview metrics
- `GET /api/admin/analytics/users?limit=50&offset=0` - User list with usage

**Success Criteria**:
- ✅ Admin analytics endpoints созданы
- ✅ Metrics корректно агрегируются
- ✅ Performance оптимизирован
- ✅ Pagination работает

---

## 📊 Success Criteria (Phase 3)

- ✅ Usage tracking middleware реализован
- ✅ Database schema расширена
- ✅ Usage analytics API создан
- ✅ API key middleware интегрирован
- ✅ Overage billing работает
- ✅ Admin dashboard API готов
- ✅ Cron jobs настроены
- ✅ Tests написаны (>85% coverage)
- ✅ Документация обновлена

---

## 📚 Documentation Updates

Создать/обновить документы:

1. **USAGE_TRACKING.md**
   - Архитектура трекинга
   - Batch processing strategy
   - Rate limiting logic
   - Overage calculation

2. **ANALYTICS_API.md**
   - Все analytics endpoints
   - Query parameters
   - Response formats
   - Performance considerations

3. **ADMIN_GUIDE.md**
   - Admin dashboard API
   - Cron jobs setup
   - Monitoring & alerts
   - Troubleshooting

---

## 🧪 Testing Tasks (for Claude)

### Task T3.1: Usage Tracker Tests (4-5 часов)

```typescript
// packages/usage/__tests__/usage-tracker.test.ts

describe('UsageTracker', () => {
  describe('track', () => {
    test('should add record to batch queue');
    test('should flush when batch is full');
    test('should update current period usage');
  });

  describe('getCurrentUsage', () => {
    test('should return correct usage for free plan');
    test('should return correct usage for pro plan');
    test('should handle unlimited enterprise plan');
  });

  describe('hasExceededLimit', () => {
    test('should return true when free plan limit exceeded');
    test('should return false for enterprise plan');
    test('should return false when under limit');
  });
});
```

### Task T3.2: Middleware Tests (3-4 часов)

```typescript
// packages/usage/__tests__/middleware.test.ts

describe('withUsageTracking', () => {
  test('should track successful API call');
  test('should block free plan when limit exceeded');
  test('should allow pro plan overage');
  test('should add rate limit headers');
  test('should handle tracking errors gracefully');
});
```

### Task T3.3: Analytics API Tests (3-4 часов)

```typescript
// apps/web/__tests__/api/usage.test.ts

describe('Usage Analytics API', () => {
  describe('GET /api/usage/current', () => {
    test('should return current usage for authenticated user');
    test('should return 401 for unauthenticated');
    test('should calculate usage percentage correctly');
  });

  describe('GET /api/usage/history', () => {
    test('should return daily usage for specified period');
    test('should default to 30 days');
  });

  describe('GET /api/usage/endpoints', () => {
    test('should return top endpoints with stats');
    test('should calculate p95 response time');
  });
});
```

### Task T3.4: Overage Service Tests (3-4 часов)

```typescript
// packages/billing/__tests__/overage-service.test.ts

describe('OverageService', () => {
  describe('calculateOverageCost', () => {
    test('should calculate correct cost for overage calls');
    test('should return 0 when no overage');
  });

  describe('chargeOverage', () => {
    test('should create Stripe invoice item');
    test('should skip when no overage');
    test('should handle missing customer gracefully');
  });

  describe('processMonthlyOverage', () => {
    test('should process all subscriptions ending today');
    test('should handle errors for individual subscriptions');
  });
});
```

---

## 🚀 Next Steps After Completion

1. **Run tests and verify coverage >85%**
2. **Deploy to staging**
3. **Test with real usage data**
4. **Setup monitoring & alerts**
5. **Performance testing**
6. **Production deployment**

---

## 💡 Tips & Best Practices

1. **Batch Processing**:
   - Always batch database writes
   - Flush periodically (5 seconds is good)
   - Handle flush failures gracefully

2. **Rate Limiting**:
   - Add X-RateLimit-* headers
   - Provide clear error messages
   - Include upgrade URLs for free users

3. **Analytics**:
   - Use daily aggregation for historical data
   - Index frequently queried columns
   - Consider partitioning large tables

4. **Overage Billing**:
   - Run cron jobs with retry logic
   - Log all overage charges
   - Send notifications to users

5. **Performance**:
   - Use database functions for aggregation
   - Cache frequently accessed data
   - Monitor query performance

---

## 🔗 Useful Resources

- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
- [Stripe Invoice Items](https://stripe.com/docs/api/invoiceitems)
- [PostgreSQL Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)

---

## 📞 Questions?

If you have questions or encounter blockers:
1. Check PostgreSQL documentation for aggregation
2. Review existing rate limiting code
3. Test with small batches first
4. Escalate to Claude/Alexey if needed

---

**Let's build the usage analytics system and unlock data-driven growth!** 🚀📊

Good luck, Codex! You've got this! 🏆
