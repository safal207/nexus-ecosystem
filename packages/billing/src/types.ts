export type PlanCode = 'free' | 'pro' | 'enterprise';

export interface PlanFeatures {
  apiCallsIncluded: number;
  priceMonthlyUsd: number;
  features: string[];
}

export interface SubscriptionPlan extends PlanFeatures {
  code: PlanCode;
  stripePriceId?: string; // empty/undefined means not configured (e.g., Free plan or missing env)
}

const env = (name: string) => (typeof process !== 'undefined' ? process.env[name] || '' : '');

export const STRIPE_PRICE_PRO = env('STRIPE_PRICE_PRO');
export const STRIPE_PRICE_ENTERPRISE = env('STRIPE_PRICE_ENTERPRISE');

export const PLANS: Record<PlanCode, SubscriptionPlan> = {
  free: {
    code: 'free',
    apiCallsIncluded: 1000,
    priceMonthlyUsd: 0,
    features: ['Test mode only', 'Community support'],
    stripePriceId: '',
  },
  pro: {
    code: 'pro',
    apiCallsIncluded: 100000,
    priceMonthlyUsd: 29,
    features: ['Live mode', 'Analytics', 'Priority support'],
    stripePriceId: STRIPE_PRICE_PRO,
  },
  enterprise: {
    code: 'enterprise',
    apiCallsIncluded: Number.POSITIVE_INFINITY as unknown as number,
    priceMonthlyUsd: 299,
    features: ['Unlimited usage', '24/7 support', 'SLA'],
    stripePriceId: STRIPE_PRICE_ENTERPRISE,
  },
};

export function requirePriceId(plan: SubscriptionPlan): string {
  if (!plan.stripePriceId) {
    throw new Error(`Stripe price id is not configured for plan '${plan.code}'. Set STRIPE_PRICE_${
      plan.code === 'pro' ? 'PRO' : plan.code === 'enterprise' ? 'ENTERPRISE' : plan.code.toUpperCase()
    }`);
  }
  return plan.stripePriceId;
}

export function validatePlans(): { ok: boolean; missing: PlanCode[] } {
  const missing: PlanCode[] = [];
  (['pro', 'enterprise'] as PlanCode[]).forEach((code) => {
    if (!PLANS[code].stripePriceId) missing.push(code);
  });
  return { ok: missing.length === 0, missing };
}

// =========================
// Database-related Types
// =========================

export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'trialing'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

export interface Subscription {
  id: string;
  eco_id: string;
  plan: PlanCode;
  status: SubscriptionStatus;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  current_period_start: string; // ISO date
  current_period_end: string;   // ISO date
  cancel_at_period_end: boolean;
  canceled_at?: string;         // ISO date
  trial_start?: string;         // ISO date
  trial_end?: string;           // ISO date
  created_at: string;           // ISO date
  updated_at: string;           // ISO date
}

export interface UsageRecord {
  id: string;
  eco_id: string;
  subscription_id?: string;
  api_calls: number;
  billing_period_start: string; // ISO date
  billing_period_end: string;   // ISO date
  overage_calls: number;
  overage_cost: number; // in cents
  created_at: string;   // ISO date
  updated_at: string;   // ISO date
}

export interface StripeEvent {
  id: string; // evt_xxx
  type: string;
  data: any; // JSON from Stripe
  processed: boolean;
  processed_at?: string; // ISO date
  error?: string;
  created_at: string; // ISO date
}
