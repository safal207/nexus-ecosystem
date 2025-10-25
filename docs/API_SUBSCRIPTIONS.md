Subscription API Endpoints

Base URL: /api

All endpoints require JWT header: Authorization: Bearer <token>

GET /subscriptions/current
- Returns current subscription and plan details
- 404 if no subscription

POST /subscriptions/checkout
- Body: { "plan": "pro" | "enterprise" }
- Returns Stripe Checkout sessionId and url
- 409 if already on active same plan

POST /subscriptions/cancel
- Cancels at period end
- 400 if free plan; 404 if no subscription

POST /subscriptions/reactivate
- Reactivates a canceled subscription before period end
- 400 if period ended; 404 if no subscription

Error Codes
- 200, 400, 401, 404, 409, 500, 503
