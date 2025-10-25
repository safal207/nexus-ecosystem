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

    const subscription = await subscriptionService.reactivateSubscription(ecoId);

    return NextResponse.json({
      message: 'Subscription reactivated successfully',
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_end: subscription.current_period_end,
      },
    });
  } catch (error: any) {
    console.error('[API] Reactivate subscription error:', error);

    if (error.message?.includes('No subscription found')) {
      return NextResponse.json({ error: 'No subscription to reactivate' }, { status: 404 });
    }
    if (error.message?.includes('period has ended')) {
      return NextResponse.json(
        { error: 'Subscription period has ended. Please create a new subscription.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to reactivate subscription', details: error.message },
      { status: 500 }
    );
  }
}

