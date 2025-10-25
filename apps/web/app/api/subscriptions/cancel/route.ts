import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '../../../../../../packages/auth/src/middleware';
import { SubscriptionService } from '../../../../../../packages/billing/src/subscription-service';

const subscriptionService = new SubscriptionService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const auth = verifyJWT(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ecoId = auth.user.ecoId;

    const subscription = await subscriptionService.cancelSubscription(ecoId);

    return NextResponse.json({
      message: 'Subscription will be canceled at the end of the billing period',
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at,
        current_period_end: subscription.current_period_end,
      },
    });
  } catch (error: any) {
    console.error('[API] Cancel subscription error:', error);

    if (error.message?.includes('No subscription found')) {
      return NextResponse.json({ error: 'No active subscription to cancel' }, { status: 404 });
    }
    if (error.message?.includes('Cannot cancel free plan')) {
      return NextResponse.json({ error: 'Free plan cannot be canceled' }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to cancel subscription', details: error.message },
      { status: 500 }
    );
  }
}

