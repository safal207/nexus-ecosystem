# 🌐 Nexus Ecosystem - Unified ID & Integration Architecture

**Created:** 2025-10-10
**Status:** Design Phase
**Version:** 1.0.0

---

## 📊 Executive Summary

Nexus Ecosystem serves as the **central identity and orchestration layer** for 7 interconnected projects, providing:
- ✅ **Single Sign-On (SSO)** across all platforms
- ✅ **Unified API Gateway** with centralized authentication
- ✅ **Shared billing & subscription management**
- ✅ **Cross-platform analytics dashboard**
- ✅ **Microservices architecture** with independent deployment

**Target valuation:** $20-50M in 3 years

---

## 🏗️ Ecosystem Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    NEXUS ECOSYSTEM HUB                       │
│    🔐 JWT Auth • 🚪 API Gateway • 💳 Billing • 📊 Analytics  │
│                  (nexus-ecosystem core)                       │
└──────────────────────────────────────────────────────────────┘
                           ↓ SSO + API
         ┌─────────────────┼─────────────────┐
         ↓                 ↓                  ↓
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  NEXUS SALES    │ │  DREAM PEOPLE   │ │  TESTING HUB    │
│  💼 CRM & Leads │ │  💰 Portfolio   │ │  🧪 QA Services │
│  Port: 3001     │ │  Management     │ │  (AlexB)        │
│                 │ │  Port: 3002     │ │  Port: 3010     │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         ↓                 ↓                  ↓
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ LIMINAL 2.0     │ │ RESONANCE       │ │ AGI SAFETY      │
│ 🌌 Psychology   │ │ 🧠 Consciousness│ │ 🤖 Research     │
│ Platform        │ │ Research        │ │ Framework       │
│ Port: 3003      │ │ Port: 3004      │ │ Port: 3005      │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         ↓
┌─────────────────┐
│ LIMINAL SHELTER │
│ 🏠 Community    │
│ Port: 3006      │
└─────────────────┘
```

---

## 🎯 Project Integration Map

### 1️⃣ **Nexus Ecosystem Hub** (Central ID Layer)
- **Path:** `C:\Users\safal\OneDrive\Documente\GitHub\nexus-ecosystem`
- **Role:** Identity Provider, API Gateway, Billing, Analytics Aggregator
- **Stack:** Next.js 15, Turborepo, Supabase, Stripe
- **Port:** 3000 (main landing) + 3100 (admin panel)

**Services:**
```typescript
- /api/auth/* → JWT authentication (access + refresh tokens)
- /api/gateway/* → Reverse proxy to all sub-projects
- /api/billing/* → Stripe subscriptions & invoicing
- /api/analytics/* → Unified metrics from all projects
- /api/webhooks/* → Event bus for cross-project communication
```

**Database Schema (Supabase):**
```sql
-- Central user table (shared across all projects)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API keys for programmatic access
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  key_hash TEXT UNIQUE NOT NULL,
  name TEXT,
  environment TEXT CHECK (environment IN ('test', 'live')),
  rate_limit INTEGER DEFAULT 100,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

-- Subscriptions (unified billing)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  plan TEXT NOT NULL, -- 'free', 'pro', 'business', 'enterprise'
  status TEXT NOT NULL, -- 'active', 'canceled', 'past_due'
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  mrr NUMERIC(10,2) -- Monthly Recurring Revenue
);

-- Project access control
CREATE TABLE project_access (
  user_id UUID REFERENCES users(id),
  project_name TEXT NOT NULL, -- 'nexus-sales', 'dream-people', etc.
  role TEXT NOT NULL, -- 'admin', 'user', 'read_only'
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, project_name)
);
```

---

### 2️⃣ **Nexus Sales** (CRM)
- **Path:** `C:\Users\safal\OneDrive\Documente\GitHub\nexus-sales`
- **Role:** Sales pipeline, lead management, deal tracking
- **Stack:** Next.js, Turbo, shadcn/ui
- **Port:** 3001
- **Status:** ⚠️ In Development (Qwen assigned)

**Integration Points:**
```typescript
// Auth: Uses nexus-ecosystem JWT tokens
import { verifyJWT } from '@nexus/auth';

// API: Exposes endpoints via API Gateway
GET  /api/leads        → List user's leads
POST /api/leads        → Create new lead
GET  /api/deals        → Sales pipeline view
POST /api/deals/:id/convert → Convert lead to customer

// Webhooks: Sends events to event bus
emit('lead.created', { leadId, userId, source });
emit('deal.won', { dealId, value, closedAt });
```

**Revenue Model:**
- **Free:** 50 leads/month
- **Pro ($29/mo):** 500 leads + automation
- **Business ($99/mo):** Unlimited + team features

---

### 3️⃣ **Dream People** (Financial Portfolio)
- **Path:** `C:\Users\safal\OneDrive\Documente\GitHub\nexus-ecosystem\apps\dream-people` (to be created)
- **Role:** Portfolio management with Human Capital valuation
- **Stack:** Next.js, Recharts, OpenAI API
- **Port:** 3002
- **Status:** 🔥 Priority MVP (Week 4-6)

**Unique Value Proposition:**
- Traditional assets (stocks, bonds, crypto)
- **Human Capital** valuation (future earnings)
- **Intellectual Property** (patents, brands, content)
- AI-powered rebalancing recommendations

**Integration Points:**
```typescript
// Auth: SSO from nexus-ecosystem
const user = await verifyToken(req.cookies.nexus_token);

// API: Cross-project data
GET /api/portfolio/:userId → Total net worth
GET /api/human-capital/:userId → Earning potential

// Webhooks: Financial events
emit('portfolio.rebalanced', { userId, oldAllocation, newAllocation });
emit('milestone.reached', { userId, milestone: '100k', value: 100000 });
```

**Revenue Model:**
- **Free:** Basic portfolio tracking
- **Pro ($19/mo):** Human capital calculator
- **Business ($49/mo):** AI recommendations + export

---

### 4️⃣ **Testing Hub** (AlexB Personal Hub)
- **Path:** `C:\Users\safal\OneDrive\Documente\GitHub\AlexB\personal-hub-alexey`
- **Role:** QA services landing page, lead generation, Express Audit sales
- **Stack:** Next.js 15, Supabase, Stripe, TailwindCSS 4
- **Port:** 3010
- **Status:** ✅ Production (Active)

**Integration Points:**
```typescript
// Auth: Currently standalone → Migrate to nexus-ecosystem SSO
// Migration plan:
// 1. Keep existing Supabase auth as fallback
// 2. Add nexus JWT validation middleware
// 3. Sync users to central DB on signup

// API: Service offerings
GET  /api/services → QA packages list
POST /api/express-audit → Purchase Express Audit (€24)
GET  /api/projects → Portfolio of completed QA projects

// Webhooks: Sales events
emit('audit.purchased', { userId, package: 'express', amount: 24 });
emit('project.completed', { projectId, deliverable });
```

**Revenue Model:**
- **Express Audit:** €24 (one-time)
- **Full QA Package:** €500-€2000/project
- **Retainer:** €2000-€5000/month

**Dependencies:**
```json
{
  "@repo/ui": "file:../../nexus-sales/packages/ui", // Shared UI components
  "@supabase/supabase-js": "^2.58.0",
  "stripe": "^14.25.0"
}
```

---

### 5️⃣ **Liminal 2.0 - For People**
- **Path:** `C:\Users\safal\OneDrive\Documente\GitHub\Liminal-2.0.-For-people`
- **Role:** Psychology & self-development platform
- **Stack:** Next.js, Prisma, Playwright
- **Port:** 3003
- **Status:** 🔄 Active Development

**Integration Points:**
```typescript
// Auth: SSO from nexus-ecosystem
// User profile: Pull from central DB
// Cross-sell: Link to Dream People (financial wellness)

// API: Psychology tools
GET  /api/assessments → Personality tests
POST /api/sessions/:id → Therapy session notes
GET  /api/progress/:userId → Growth metrics

// Webhooks: User events
emit('assessment.completed', { userId, type: 'personality', score });
emit('milestone.achieved', { userId, milestone: '30_days_streak' });
```

**Monetization Analysis (from file):**
- Market fit: High demand for mental health tools
- Revenue potential: $20-50/mo subscription
- Target: 10k users → $200-500k MRR

---

### 6️⃣ **Resonance Liminal**
- **Path:** `C:\Users\safal\OneDrive\Documente\GitHub\resonance-liminal`
- **Role:** Consciousness research & AI safety experiments
- **Stack:** Python, Clojure, React
- **Port:** 3004
- **Status:** 🧪 Research Phase

**Integration Points:**
```python
# Auth: API key-based (research project)
headers = {'Authorization': f'Bearer {nexus_api_key}'}

# API: Research data
GET  /api/experiments → List experiments
POST /api/experiments/:id/run → Execute experiment
GET  /api/results/:id → Download results

# Webhooks: Experiment events
emit('experiment.completed', {'id': exp_id, 'status': 'success'})
```

**Monetization:**
- **Open-source core**
- **Enterprise license:** $5000-$50k/year for companies
- **Consulting:** AGI safety audits

---

### 7️⃣ **AGI Consciousness Safety**
- **Path:** `C:\Users\safal\OneDrive\Documente\GitHub\agi-consciousness-safety`
- **Role:** AI safety framework & research
- **Stack:** Python, pytest
- **Port:** 3005
- **Status:** 🔬 Research Phase

**Integration Points:**
```python
# Auth: API key or OAuth for researchers
# Data sharing: Anonymous safety metrics

# API: Safety tools
GET  /api/safety/models → List evaluated models
POST /api/safety/evaluate → Submit model for evaluation
GET  /api/metrics/:model_id → Safety scores

# Webhooks: Safety alerts
emit('safety.alert', {'model': 'gpt-5', 'risk_level': 'high'})
```

**Revenue Model:**
- **Free:** Basic safety tools
- **Pro ($99/mo):** Advanced evaluations
- **Enterprise:** Custom audits ($10k-$100k)

---

### 8️⃣ **Liminal Shelter**
- **Path:** `C:\Users\safal\OneDrive\Documente\GitHub\liminal-shelter`
- **Role:** Community platform (future)
- **Port:** 3006
- **Status:** 📝 Concept Phase

**Planned Features:**
- Forum for consciousness researchers
- Private channels for mental health community
- Integration with Liminal 2.0

---

## 🔐 Authentication Flow (SSO)

### High-Level Flow

```
┌────────┐          ┌─────────────┐          ┌────────────┐
│ User   │─Login───▶│ Nexus Hub   │◀────────▶│ Supabase   │
│ Browser│          │ (Auth)      │          │ (User DB)  │
└────────┘          └─────────────┘          └────────────┘
    │                      │
    │ JWT Token            │ Token Valid?
    ↓                      ↓
┌──────────────────────────────────────────┐
│ All Sub-Projects (Nexus Sales, Dream     │
│ People, Testing Hub, Liminal, etc.)      │
│                                           │
│ Middleware: verifyJWT(token)             │
│ ✅ Valid → Allow access                  │
│ ❌ Invalid → Redirect to /login          │
└──────────────────────────────────────────┘
```

### Implementation Details

**Step 1: User Login**
```typescript
// nexus-ecosystem/packages/auth/src/jwt.ts

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const JWT_SECRET = process.env.JWT_SECRET!; // Shared across all projects

export async function login(email: string, password: string) {
  // 1. Fetch user from Supabase
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !user) throw new Error('User not found');

  // 2. Verify password
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Invalid password');

  // 3. Generate JWT tokens
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken, user };
}
```

**Step 2: Token Validation Middleware**
```typescript
// nexus-ecosystem/packages/auth/src/middleware.ts

import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET!;

export function verifyJWT(req: NextRequest) {
  const token = req.cookies.get('nexus_token')?.value ||
                req.headers.get('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Attach user to request
    (req as any).user = decoded;
    return NextResponse.next();
  } catch (error) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
}
```

**Step 3: Usage in Sub-Projects**
```typescript
// nexus-sales/apps/web/middleware.ts
import { verifyJWT } from '@nexus/auth';

export function middleware(req: NextRequest) {
  // Protect all /dashboard routes
  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    return verifyJWT(req);
  }
}

// AlexB personal-hub-alexey/middleware.ts (after migration)
import { verifyJWT } from '@nexus/auth';

export function middleware(req: NextRequest) {
  // Existing Supabase auth as fallback
  const nexusToken = req.cookies.get('nexus_token');
  if (nexusToken) {
    return verifyJWT(req); // Use central auth
  } else {
    // Fall back to Supabase auth (for gradual migration)
    return supabaseAuthCheck(req);
  }
}
```

---

## 🚪 API Gateway Architecture

### Gateway Routes

```typescript
// nexus-ecosystem/apps/hub/src/app/api/gateway/[...path]/route.ts

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const [project, ...rest] = params.path;
  const targetUrl = getProjectUrl(project, rest);

  // Forward request with JWT token
  const response = await fetch(targetUrl, {
    headers: {
      ...req.headers,
      'X-Nexus-User-Id': req.user.id, // From JWT
      'X-Nexus-Tenant': req.user.tenantId,
    },
  });

  return response;
}

function getProjectUrl(project: string, path: string[]): string {
  const projectPorts = {
    'sales': 3001,
    'dream-people': 3002,
    'testing': 3010,
    'liminal': 3003,
    'resonance': 3004,
    'agi-safety': 3005,
  };

  const port = projectPorts[project];
  return `http://localhost:${port}/api/${path.join('/')}`;
}
```

### Example API Calls

```bash
# Direct call (old way)
GET http://localhost:3001/api/leads
Authorization: Bearer <nexus-sales-specific-token>

# Via API Gateway (new way)
GET https://nexus.com/api/gateway/sales/leads
Authorization: Bearer <nexus-unified-jwt>

# Gateway benefits:
# ✅ Single authentication layer
# ✅ Rate limiting across all projects
# ✅ Unified logging & monitoring
# ✅ Easier to add new projects
```

---

## 💳 Unified Billing System

### Subscription Tiers

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | • 50 leads/month (Sales)<br>• Basic portfolio (Dream People)<br>• 1 Express Audit discount (Testing) |
| **Pro** | $49/mo | • 500 leads + automation (Sales)<br>• Human capital calc (Dream People)<br>• Priority support (Testing)<br>• All Liminal features |
| **Business** | $149/mo | • Unlimited leads + team (Sales)<br>• AI portfolio advisor (Dream People)<br>• Monthly QA retainer credit (Testing)<br>• White-label options |
| **Enterprise** | Custom | • Dedicated support<br>• Custom integrations<br>• On-premise deployment<br>• SLA guarantees |

### Implementation

```typescript
// nexus-ecosystem/packages/billing/src/subscription.ts

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createSubscription(userId: string, plan: 'pro' | 'business') {
  const priceIds = {
    pro: 'price_1234', // $49/mo
    business: 'price_5678', // $149/mo
  };

  const subscription = await stripe.subscriptions.create({
    customer: userId, // Stripe customer ID
    items: [{ price: priceIds[plan] }],
    metadata: {
      nexus_user_id: userId,
      projects_access: 'all', // Grant access to all projects
    },
  });

  // Update access in central DB
  await grantProjectAccess(userId, ['sales', 'dream-people', 'testing', 'liminal']);

  return subscription;
}

async function grantProjectAccess(userId: string, projects: string[]) {
  for (const project of projects) {
    await supabase.from('project_access').upsert({
      user_id: userId,
      project_name: project,
      role: 'user',
    });
  }
}
```

---

## 📊 Analytics Dashboard (Unified View)

### Dashboard Components

```typescript
// nexus-ecosystem/apps/hub/src/app/dashboard/page.tsx

export default async function UnifiedDashboard() {
  const user = await getUser();

  // Fetch data from all projects in parallel
  const [salesData, portfolioData, testingData] = await Promise.all([
    fetch('/api/gateway/sales/summary'),
    fetch('/api/gateway/dream-people/portfolio'),
    fetch('/api/gateway/testing/health'),
  ]);

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Sales CRM Card */}
      <Card>
        <h3>Sales Pipeline</h3>
        <Metric value={salesData.leads} label="Active Leads" />
        <Metric value={salesData.deals} label="Open Deals" />
        <Link href="/sales/dashboard">View CRM →</Link>
      </Card>

      {/* Portfolio Card */}
      <Card>
        <h3>Portfolio Value</h3>
        <Metric value={portfolioData.totalValue} label="Net Worth" format="currency" />
        <Metric value={portfolioData.humanCapital} label="Human Capital" format="currency" />
        <Link href="/dream-people/dashboard">Manage →</Link>
      </Card>

      {/* Testing Hub Card */}
      <Card>
        <h3>QA Services</h3>
        <Metric value={testingData.activeProjects} label="Active Projects" />
        <Metric value={testingData.revenue} label="Monthly Revenue" format="currency" />
        <Link href="/testing/projects">View Projects →</Link>
      </Card>
    </div>
  );
}
```

---

## 🔄 Event Bus (Webhooks)

### Architecture

```typescript
// nexus-ecosystem/packages/webhooks/src/event-bus.ts

type Event = {
  source: string; // 'nexus-sales', 'dream-people', etc.
  type: string; // 'lead.created', 'portfolio.rebalanced'
  userId: string;
  data: Record<string, any>;
  timestamp: Date;
};

export class EventBus {
  async emit(event: Event) {
    // 1. Store event in database (audit log)
    await supabase.from('events').insert({
      source: event.source,
      type: event.type,
      user_id: event.userId,
      data: event.data,
      created_at: event.timestamp,
    });

    // 2. Notify subscribed webhooks
    const webhooks = await getWebhooksForEvent(event.type);
    for (const webhook of webhooks) {
      await sendWebhook(webhook.url, event);
    }

    // 3. Trigger cross-project automation
    if (event.type === 'deal.won') {
      // Automatically update user's portfolio
      await fetch('/api/gateway/dream-people/transactions', {
        method: 'POST',
        body: JSON.stringify({
          userId: event.userId,
          type: 'income',
          amount: event.data.dealValue,
          source: 'sales_commission',
        }),
      });
    }
  }
}
```

### Event Types

```typescript
// Cross-project events

// Sales → Dream People
'deal.won' → Update portfolio with commission income
'lead.qualified' → Track business development progress

// Dream People → Sales
'milestone.reached' → Trigger upsell campaign (e.g., user hit $100k)
'portfolio.at_risk' → Offer financial consultation

// Testing Hub → Sales
'audit.completed' → Add testimonial to CRM
'project.won' → Update revenue in Dream People

// Liminal → Dream People
'assessment.completed' → Suggest financial wellness next steps
'streak.achieved' → Gamification rewards
```

---

## 🛠️ Development Setup

### Prerequisites

```bash
# Node.js 20+
node --version  # v20.x.x

# pnpm (recommended for monorepo)
npm install -g pnpm

# Docker (for local databases)
docker --version
```

### Installation

```bash
# 1. Clone nexus-ecosystem
cd C:\Users\safal\OneDrive\Documente\GitHub\nexus-ecosystem
git pull origin main

# 2. Install dependencies
pnpm install

# 3. Setup environment variables
cp .env.example .env.local

# Required env vars:
# JWT_SECRET=<generate-random-32-char-string>
# SUPABASE_URL=<your-supabase-project-url>
# SUPABASE_KEY=<your-supabase-anon-key>
# STRIPE_SECRET_KEY=<stripe-test-key>

# 4. Start all projects
pnpm dev

# This starts:
# - nexus-ecosystem hub (port 3000)
# - nexus-sales (port 3001)
# - dream-people (port 3002)
```

### Individual Project Setup

```bash
# AlexB Testing Hub (standalone, to be integrated)
cd C:\Users\safal\OneDrive\Documente\GitHub\AlexB\personal-hub-alexey
npm install
npm run dev  # Port 3010

# Liminal 2.0
cd C:\Users\safal\OneDrive\Documente\GitHub\Liminal-2.0.-For-people
npm install
npm run dev  # Port 3003
```

---

## 🚀 Migration Plan (Phase by Phase)

### Phase 1: Central Auth (Weeks 1-3) ✅
- [x] Setup nexus-ecosystem monorepo
- [x] Implement JWT auth system
- [x] Create Supabase central database
- [ ] Deploy to Vercel (staging)
- [ ] **Next:** Qwen implements Task 1.1 (JWT)

### Phase 2: SSO Integration (Weeks 4-6)
- [ ] Migrate AlexB Testing Hub to nexus SSO
- [ ] Setup API Gateway
- [ ] Implement rate limiting
- [ ] Cross-project session management
- [ ] **Assignee:** Qwen (Week 7-8)

### Phase 3: Dream People MVP (Weeks 4-6)
- [ ] Database schema for portfolios
- [ ] Human capital calculator
- [ ] Basic dashboard UI
- [ ] Integration with nexus auth
- [ ] **Assignee:** Qwen (Task 2.1-2.4)

### Phase 4: Unified Billing (Weeks 7-9)
- [ ] Stripe subscription setup
- [ ] Pricing page (nexus-ecosystem hub)
- [ ] Access control based on plans
- [ ] Webhook integration
- [ ] **Assignee:** Qwen (Week 11)

### Phase 5: Analytics Dashboard (Weeks 10-12)
- [ ] Data aggregation API
- [ ] Unified dashboard UI
- [ ] Real-time metrics
- [ ] Export functionality
- [ ] **Assignee:** Qwen (Task 3.2)

### Phase 6: Liminal Integration (Month 4)
- [ ] Migrate Liminal 2.0 to nexus auth
- [ ] Cross-sell flows (Liminal → Dream People)
- [ ] Shared user profiles
- [ ] Community platform (Liminal Shelter)

### Phase 7: Research Projects (Month 5+)
- [ ] API key auth for Resonance Liminal
- [ ] AGI Safety framework integration
- [ ] Enterprise licensing system
- [ ] White-label options

---

## 📈 Success Metrics

### Technical KPIs
- **Uptime:** 99.9% (target)
- **API Response Time:** <200ms p95
- **Test Coverage:** >85%
- **Security:** 0 critical vulnerabilities

### Business KPIs
- **Month 1:** 100 signups, 5 paid ($245 MRR)
- **Month 3:** 500 users, 50 paid ($2,450 MRR)
- **Month 6:** 2,000 users, 200 paid ($9,800 MRR)
- **Month 12:** 10,000 users, 1,000 paid ($49,000 MRR)

### User Engagement
- **Cross-project usage:** 30% of users use 2+ projects
- **Retention:** 60% monthly active users
- **NPS Score:** >50

---

## 🤝 Team & Responsibilities

| Role | Person | Responsibilities |
|------|--------|------------------|
| **Architect** | Claude | System design, documentation, code reviews |
| **Developer** | Qwen | Auth system, Dream People, API Gateway |
| **Tester** | Grok | All testing (unit, integration, E2E, security) |
| **Product Owner** | Alexey | Vision, prioritization, user feedback |

---

## 📞 Next Steps

### Immediate Actions (Week 1)

**For Qwen:**
1. ✅ Read this document
2. Start Task 1.1: JWT Authentication (`packages/auth/src/jwt.ts`)
3. Create test user in Supabase
4. Document auth API endpoints

**For Grok:**
1. ✅ Read this document
2. Start Task T1.1: Auth test suite setup
3. Create test fixtures
4. Setup CI/CD for automated testing

**For Claude:**
1. ✅ Complete this integration map
2. Create GitHub issues from tasks
3. Setup project board
4. Weekly check-ins with team

---

## 📚 Resources

- **Main Plan:** `C:\Users\safal\OneDrive\Documente\GitHub\AlexB\NEXUS_ECOSYSTEM_PLAN.md`
- **Qwen Tasks:** `C:\Users\safal\OneDrive\Documente\GitHub\AlexB\QWEN_TASKS.md`
- **Grok Tasks:** `C:\Users\safal\OneDrive\Documente\GitHub\AlexB\GROK_TASKS.md`
- **Nexus Sales:** `C:\Users\safal\OneDrive\Documente\GitHub\nexus-sales`
- **AlexB Testing:** `C:\Users\safal\OneDrive\Documente\GitHub\AlexB\personal-hub-alexey`

---

## 🔥 Let's Build the Future!

**Target:** $50M valuation
**Timeline:** 36 months
**Status:** 🚀 Ready to launch Phase 1

**Questions?** → Create GitHub issue or ping in Discord

