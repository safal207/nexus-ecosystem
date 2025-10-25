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
    const email = auth.user.email;

    const body = await req.json();
    const { plan } = body || {};

    if (!plan || !['pro', 'enterprise'].includes(plan)) {
      return NextResponse.json(
        { error: 'Invalid plan. Must be "pro" or "enterprise"' },
        { status: 400 }
      );
    }

    const origin = req.headers.get('origin') || 'http://localhost:3000';
    const successUrl = `${origin}/dashboard/billing?success=true&plan=${plan}`;
    const cancelUrl = `${origin}/dashboard/billing?canceled=true`;

    const session = await subscriptionService.createCheckoutSession(
      ecoId,
      email,
      plan as 'pro' | 'enterprise',
      successUrl,
      cancelUrl
    );

    return NextResponse.json({ sessionId: session.sessionId, url: session.url });
  } catch (error: any) {
    console.error('[API] Checkout error:', error);

    if (error.message?.includes('already has an active')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error.message?.includes('not configured')) {
      return NextResponse.json(
        { error: 'Billing system not configured. Please contact support.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create checkout session', details: error.message },
      { status: 500 }
    );
  }
}

