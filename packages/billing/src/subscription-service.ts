import Stripe from 'stripe';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Subscription,
  SubscriptionStatus,
  PlanCode,
  PLANS,
  requirePriceId,
} from './types';

// Initialize Stripe with API version
const getStripeClient = (): Stripe => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || secretKey === 'sk_test_your_key_here') {
    throw new Error(
      'STRIPE_SECRET_KEY not configured. Please add your Stripe test key to .env.local'
    );
  }
  return new Stripe(secretKey, {
    apiVersion: '2024-11-20.acacia' as any,
    typescript: true,
  });
};

export class SubscriptionService {
  private sb: SupabaseClient;
  private stripe: Stripe;

  constructor(supabaseUrl: string, supabaseKey: string) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and key are required');
    }
    this.sb = createClient(supabaseUrl, supabaseKey);
    this.stripe = getStripeClient();
  }

  /**
   * Create a free subscription for a new user
   * Called during user registration
   */
  async createFreeSubscription(ecoId: string): Promise<Subscription> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const { data, error } = await this.sb
      .from('eco_subscriptions')
      .insert({
        eco_id: ecoId,
        plan: 'free',
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create free subscription:', error);
      throw new Error(`Failed to create free subscription: ${error.message}`);
    }

    return data as Subscription;
  }

  /**
   * Get or create Stripe customer for an EcoID
   * Idempotent - returns existing customer if already created
   */
  async getOrCreateStripeCustomer(ecoId: string, email: string): Promise<string> {
    // Check if customer already exists in our DB
    const { data: existing } = await this.sb
      .from('eco_subscriptions')
      .select('stripe_customer_id')
      .eq('eco_id', ecoId)
      .single();

    if (existing?.stripe_customer_id) {
      // Verify customer still exists in Stripe
      try {
        await this.stripe.customers.retrieve(existing.stripe_customer_id);
        return existing.stripe_customer_id;
      } catch (err) {
        console.warn(
          `Stripe customer ${existing.stripe_customer_id} not found, creating new one`
        );
      }
    }

    // Create new Stripe customer
    const customer = await this.stripe.customers.create({
      email,
      metadata: { eco_id: ecoId },
    });

    // Update subscription with customer ID (idempotent)
    await this.sb
      .from('eco_subscriptions')
      .update({ stripe_customer_id: customer.id })
      .eq('eco_id', ecoId);

    return customer.id;
  }

  /**
   * Create Stripe checkout session for upgrading to paid plan
   * Returns session ID and URL for redirect
   */
  async createCheckoutSession(
    ecoId: string,
    email: string,
    plan: 'pro' | 'enterprise',
    successUrl: string,
    cancelUrl: string
  ): Promise<{ sessionId: string; url: string }> {
    // Validate plan exists
    const planConfig = PLANS[plan];
    if (!planConfig) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    // Ensure price ID is configured
    const priceId = requirePriceId(planConfig);

    // Get or create Stripe customer
    const customerId = await this.getOrCreateStripeCustomer(ecoId, email);

    // Check if user already has an active subscription to this plan
    const currentSub = await this.getSubscription(ecoId);
    if (currentSub?.plan === plan && currentSub?.status === 'active') {
      throw new Error(`User already has an active ${plan} subscription`);
    }

    // Create checkout session
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        eco_id: ecoId,
        plan: plan,
      },
      subscription_data: {
        metadata: {
          eco_id: ecoId,
          plan: plan,
        },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new Error('Failed to create checkout session URL');
    }

    return {
      sessionId: session.id,
      url: session.url,
    };
  }

  /**
   * Get current subscription for a user
   * Returns null if no subscription exists
   */
  async getSubscription(ecoId: string): Promise<Subscription | null> {
    const { data, error } = await this.sb
      .from('eco_subscriptions')
      .select('*')
      .eq('eco_id', ecoId)
      .single();

    if (error) {
      if ((error as any).code === 'PGRST116') {
        // No rows returned - user has no subscription
        return null;
      }
      console.error('Failed to get subscription:', error);
      throw new Error(`Failed to get subscription: ${error.message}`);
    }

    return data as Subscription;
  }

  /**
   * Update subscription fields
   * Used by webhook handlers to sync with Stripe
   */
  async updateSubscription(
    ecoId: string,
    updates: {
      plan?: PlanCode;
      status?: SubscriptionStatus;
      stripe_subscription_id?: string;
      current_period_start?: string;
      current_period_end?: string;
      cancel_at_period_end?: boolean;
      canceled_at?: string | null;
      trial_start?: string;
      trial_end?: string;
    }
  ): Promise<Subscription> {
    const { data, error } = await this.sb
      .from('eco_subscriptions')
      .update(updates)
      .eq('eco_id', ecoId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update subscription:', error);
      throw new Error(`Failed to update subscription: ${error.message}`);
    }

    return data as Subscription;
  }

  /**
   * Cancel subscription at period end
   * User keeps access until current period expires
   */
  async cancelSubscription(ecoId: string): Promise<Subscription> {
    const subscription = await this.getSubscription(ecoId);
    if (!subscription) {
      throw new Error('No subscription found for user');
    }

    // If it's a free plan, nothing to cancel
    if (subscription.plan === 'free') {
      throw new Error('Cannot cancel free plan');
    }

    // If already canceled, return current state
    if (subscription.cancel_at_period_end) {
      return subscription;
    }

    // Cancel in Stripe if exists
    if (subscription.stripe_subscription_id) {
      try {
        await this.stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: true,
        });
      } catch (err: any) {
        console.error('Failed to cancel in Stripe:', err);
        throw new Error(`Failed to cancel subscription in Stripe: ${err.message}`);
      }
    }

    // Update our DB
    return await this.updateSubscription(ecoId, {
      cancel_at_period_end: true,
      canceled_at: new Date().toISOString(),
    });
  }

  /**
   * Reactivate a canceled subscription
   * Only works if subscription hasn't ended yet
   */
  async reactivateSubscription(ecoId: string): Promise<Subscription> {
    const subscription = await this.getSubscription(ecoId);
    if (!subscription) {
      throw new Error('No subscription found for user');
    }

    // Check if subscription is actually canceled
    if (!subscription.cancel_at_period_end) {
      return subscription; // Already active
    }

    // Check if period has ended
    const periodEnd = new Date(subscription.current_period_end);
    if (periodEnd < new Date()) {
      throw new Error('Subscription period has ended, please create a new subscription');
    }

    // Reactivate in Stripe if exists
    if (subscription.stripe_subscription_id) {
      try {
        await this.stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: false,
        });
      } catch (err: any) {
        console.error('Failed to reactivate in Stripe:', err);
        throw new Error(`Failed to reactivate subscription in Stripe: ${err.message}`);
      }
    }

    // Update our DB
    return await this.updateSubscription(ecoId, {
      cancel_at_period_end: false,
      canceled_at: null,
    });
  }

  /**
   * Check if user has access based on their plan
   * Used for authorization checks
   */
  async hasAccess(ecoId: string, requiredPlan: PlanCode): Promise<boolean> {
    const subscription = await this.getSubscription(ecoId);

    // No subscription means no access
    if (!subscription) return false;

    // Check if subscription is active
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return false;
    }

    // Check plan hierarchy: free < pro < enterprise
    const planHierarchy: PlanCode[] = ['free', 'pro', 'enterprise'];
    const userPlanIndex = planHierarchy.indexOf(subscription.plan);
    const requiredPlanIndex = planHierarchy.indexOf(requiredPlan);

    return userPlanIndex >= requiredPlanIndex;
  }

  /**
   * Get subscription with plan details
   * Combines subscription data with plan configuration
   */
  async getSubscriptionWithPlan(
    ecoId: string
  ): Promise<{ subscription: Subscription; planDetails: (typeof PLANS)[PlanCode] } | null> {
    const subscription = await this.getSubscription(ecoId);
    if (!subscription) return null;

    return {
      subscription,
      planDetails: PLANS[subscription.plan],
    } as any;
  }

  /**
   * Sync subscription from Stripe
   * Useful for manual reconciliation or debugging
   */
  async syncFromStripe(ecoId: string): Promise<Subscription> {
    const subscription = await this.getSubscription(ecoId);
    if (!subscription?.stripe_subscription_id) {
      throw new Error('No Stripe subscription to sync');
    }

    // Fetch from Stripe
    const stripeSub = await this.stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id
    );

    // Map Stripe status to our status
    const status = stripeSub.status as SubscriptionStatus;

    // Update our DB
    return await this.updateSubscription(ecoId, {
      status,
      current_period_start: new Date((stripeSub.current_period_start || 0) * 1000).toISOString(),
      current_period_end: new Date((stripeSub.current_period_end || 0) * 1000).toISOString(),
      cancel_at_period_end: stripeSub.cancel_at_period_end || false,
    });
  }
}

