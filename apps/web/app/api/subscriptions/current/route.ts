import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '../../../../../../packages/auth/src/middleware';
import { SubscriptionService } from '../../../../../../packages/billing/src/subscription-service';

const subscriptionService = new SubscriptionService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function planName(code: 'free' | 'pro' | 'enterprise') {
  return code.charAt(0).toUpperCase() + code.slice(1);
}

export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const auth = verifyJWT(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ecoId = auth.user.ecoId;

    // Get subscription with plan details
    const result = await subscriptionService.getSubscriptionWithPlan(ecoId);
    if (!result) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }

    const { subscription, planDetails } = result as any;
    const priceCents = Math.round((planDetails.priceMonthlyUsd || 0) * 100);

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        eco_id: subscription.eco_id,
        plan: subscription.plan,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at,
        trial_start: subscription.trial_start,
        trial_end: subscription.trial_end,
        created_at: subscription.created_at,
        updated_at: subscription.updated_at,
      },
      plan: {
        name: planName(subscription.plan),
        price: priceCents,
        apiCallsIncluded: planDetails.apiCallsIncluded,
        features: planDetails.features,
      },
    });
  } catch (error: any) {
    console.error('[API] Get subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to get subscription', details: error.message },
      { status: 500 }
    );
  }
}

