#!/usr/bin/env tsx
import { resolve } from 'path';
import { existsSync } from 'fs';
import Stripe from 'stripe';

// Load .env.local if present
try {
  const dotenv = require('dotenv');
  const envPath = resolve(process.cwd(), '.env.local');
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else if (existsSync(resolve(process.cwd(), '.env'))) {
    dotenv.config();
  }
} catch {}

function assertStripeKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === 'sk_test_your_key_here') {
    console.error('❌ Error: Please configure STRIPE_SECRET_KEY in .env.local');
    console.log('📝 Steps:');
    console.log('1. Create Stripe account at https://stripe.com');
    console.log('2. Get test API keys from Dashboard');
    console.log('3. Add STRIPE_SECRET_KEY to .env.local');
    process.exit(1);
  }
  return key;
}

async function main() {
  const secretKey = assertStripeKey();
  const stripe = new Stripe(secretKey, {
    // Use a recent API version
    apiVersion: '2024-06-20',
  });

  console.log('🚀 Creating Stripe products and prices (Pro, Enterprise)...');

  // Helper to find existing price by lookup_key
  async function findPriceByLookupKey(lookupKey: string) {
    // Note: prices.list doesn't filter by lookup_key directly in API types; fetch and filter locally
    const prices = await stripe.prices.list({ limit: 100, active: true });
    return prices.data.find((p) => (p.lookup_key as string | undefined) === lookupKey);
  }

  // PRO plan
  const proLookup = 'nexus_pro_monthly';
  let proPrice = await findPriceByLookupKey(proLookup);
  if (!proPrice) {
    const proProduct = await stripe.products.create({
      name: 'Nexus Pro',
      description: 'Professional plan with 100,000 API calls/month',
      metadata: { plan_code: 'pro', api_calls_included: '100000', eco_tier: 'pro' },
    });
    proPrice = await stripe.prices.create({
      currency: 'usd',
      unit_amount: 2900,
      recurring: { interval: 'month' },
      product: proProduct.id,
      lookup_key: proLookup,
      nickname: 'Pro Monthly',
    });
    console.log(`✅ Created Pro price: ${proPrice.id}`);
  } else {
    console.log(`ℹ️ Pro price already exists: ${proPrice.id}`);
  }

  // ENTERPRISE plan
  const entLookup = 'nexus_enterprise_monthly';
  let entPrice = await findPriceByLookupKey(entLookup);
  if (!entPrice) {
    const entProduct = await stripe.products.create({
      name: 'Nexus Enterprise',
      description: 'Enterprise plan with unlimited usage and 24/7 support',
      metadata: { plan_code: 'enterprise', api_calls_included: 'unlimited', eco_tier: 'enterprise' },
    });
    entPrice = await stripe.prices.create({
      currency: 'usd',
      unit_amount: 29900,
      recurring: { interval: 'month' },
      product: entProduct.id,
      lookup_key: entLookup,
      nickname: 'Enterprise Monthly',
    });
    console.log(`✅ Created Enterprise price: ${entPrice.id}`);
  } else {
    console.log(`ℹ️ Enterprise price already exists: ${entPrice.id}`);
  }

  console.log('\n📌 Add these to your .env.local:');
  console.log(`STRIPE_PRICE_PRO=${proPrice!.id}`);
  console.log(`STRIPE_PRICE_ENTERPRISE=${entPrice!.id}`);
  console.log('\n🎉 Done. You can now use these price IDs in your billing code.');
}

main().catch((err) => {
  console.error('❌ Stripe setup failed:', err.message || err);
  process.exit(1);
});

