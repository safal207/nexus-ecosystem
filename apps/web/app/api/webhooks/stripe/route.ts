// apps/web/app/api/webhooks/stripe/route.ts

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { SubscriptionService } from '../../../../../../packages/billing/src/subscription-service';
import { createClient } from '@supabase/supabase-js';
import type { SubscriptionStatus, PlanCode } from '../../../../../../packages/billing/src/types';

// Validate required env vars early
function validateWebhookEnv(): void {
  const required = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variables for webhooks: ${missing.join(', ')}`
    );
  }
}

validateWebhookEnv();

// Initialize Stripe (keep singleton per worker)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-11-20.acacia' as any,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

// Initialize services
const subscriptionService = new SubscriptionService(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_KEY as string
);

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_KEY as string
);

/**
 * Log Stripe event for idempotency and audit trail
 * Returns false if event already logged
 */
async function logStripeEvent(event: Stripe.Event): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .from('eco_stripe_events')
      .select('id, processed')
      .eq('id', event.id)
      .single();

    if (existing) {
      console.log(`[Webhook] Event ${event.id} already logged, processed: ${existing.processed}`);
      return false;
    }

    const { error } = await supabase.from('eco_stripe_events').insert({
      id: event.id,
      type: event.type,
      data: (event.data as any).object,
      processed: false,
    });
    if (error) throw error;
    console.log(`[Webhook] Event ${event.id} logged: ${event.type}`);
    return true;
  } catch (error) {
    console.error('[Webhook] Error in logStripeEvent:', error);
    throw error;
  }
}

/** Mark event as processed (optionally with error) */
async function markEventProcessed(eventId: string, error?: string): Promise<void> {
  try {
    await supabase
      .from('eco_stripe_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        error: error || null,
      })
      .eq('id', eventId);
  } catch (err) {
    console.error('[Webhook] Failed to mark event processed:', err);
  }
}

/** Get eco_id from Stripe object metadata */
function getEcoIdFromMetadata(obj: any): string | null {
  return obj?.metadata?.eco_id || null;
}

/** Handle checkout.session.completed: activate subscription */
async function handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const ecoId = getEcoIdFromMetadata(session);
  const plan = (session.metadata?.plan as PlanCode) || null;

  if (!ecoId) throw new Error('Missing eco_id in session metadata');
  if (!plan || !['pro', 'enterprise'].includes(plan)) {
    throw new Error(`Invalid plan in session metadata: ${plan}`);
  }

  // Subscription ID from session
  const subscriptionId = session.subscription as string;
  if (!subscriptionId) throw new Error('No subscription ID in checkout session');

  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);

  await subscriptionService.updateSubscription(ecoId, {
    plan,
    status: stripeSub.status as SubscriptionStatus,
    stripe_subscription_id: subscriptionId,
    current_period_start: new Date((stripeSub.current_period_start || 0) * 1000).toISOString(),
    current_period_end: new Date((stripeSub.current_period_end || 0) * 1000).toISOString(),
    cancel_at_period_end: false,
  });
}

/** Handle customer.subscription.updated */
async function handleSubscriptionUpdated(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const ecoId = getEcoIdFromMetadata(subscription);
  if (!ecoId) {
    console.warn('[Webhook] No eco_id in subscription metadata, skipping');
    return;
  }

  await subscriptionService.updateSubscription(ecoId, {
    status: subscription.status as SubscriptionStatus,
    current_period_start: new Date((subscription.current_period_start || 0) * 1000).toISOString(),
    current_period_end: new Date((subscription.current_period_end || 0) * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : undefined,
  });
}

/** Handle customer.subscription.deleted: downgrade to free */
async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const ecoId = getEcoIdFromMetadata(subscription);
  if (!ecoId) {
    console.warn('[Webhook] No eco_id in subscription metadata, skipping');
    return;
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await subscriptionService.updateSubscription(ecoId, {
    plan: 'free',
    status: 'active',
    stripe_subscription_id: undefined,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: false,
    canceled_at: subscription.ended_at
      ? new Date(subscription.ended_at * 1000).toISOString()
      : undefined,
  });
}

/** Handle invoice.payment_failed: mark past_due */
async function handlePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;

  const { data: sub } = await supabase
    .from('eco_subscriptions')
    .select('eco_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!sub) {
    console.warn(`[Webhook] No subscription found for customer ${customerId}`);
    return;
  }

  await subscriptionService.updateSubscription(sub.eco_id, { status: 'past_due' });
}

/** Handle invoice.payment_succeeded: set active if needed */
async function handlePaymentSucceeded(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;

  const { data: sub } = await supabase
    .from('eco_subscriptions')
    .select('eco_id, status')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!sub) {
    console.warn(`[Webhook] No subscription found for customer ${customerId}`);
    return;
  }

  if (['past_due', 'incomplete', 'unpaid'].includes(sub.status)) {
    await subscriptionService.updateSubscription(sub.eco_id, { status: 'active' });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('[Webhook] Signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log(`[Webhook] Received event: ${event.type} (${event.id})`);

    // Idempotency check
    const isNewEvent = await logStripeEvent(event);
    if (!isNewEvent) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event);
          break;
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event);
          break;
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event);
          break;
        case 'invoice.payment_failed':
          await handlePaymentFailed(event);
          break;
        case 'invoice.payment_succeeded':
          await handlePaymentSucceeded(event);
          break;
        default:
          console.log(`[Webhook] Unhandled event type: ${event.type}`);
      }

      await markEventProcessed(event.id);
      return NextResponse.json({ received: true, processed: true });
    } catch (handlerError: any) {
      await markEventProcessed(event.id, handlerError.message || 'handler error');
      throw handlerError;
    }
  } catch (error: any) {
    console.error('[Webhook] Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error.message || String(error) },
      { status: 500 }
    );
  }
}

// App Router hints
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

