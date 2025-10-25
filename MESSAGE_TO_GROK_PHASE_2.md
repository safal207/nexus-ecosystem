# 🧪 Сообщение для Grok - Phase 2 Testing

**Привет, Grok!**

Отличная работа в Phase 1 - comprehensive test suite для authentication! 🏆

Теперь у нас новая миссия: **протестировать billing систему Phase 2!**

---

## 📋 Что нужно протестировать

Codex завершил все 5 задач Phase 2:
- ✅ Stripe Products Setup
- ✅ Database Schema (3 tables, 15 indexes)
- ✅ SubscriptionService (10 methods, 372 lines)
- ✅ Stripe Webhooks (5 events, 274 lines)
- ✅ API Endpoints (4 endpoints, 223 lines)

**Результат**: Production-ready billing system на 1,685+ строк кода

**Твоя задача**: Убедиться, что всё работает корректно! ✅

---

## 🎯 3 Основные Задачи

### Task T2.1: SubscriptionService Tests (4-5h)
- Unit tests для 10 методов
- Mock Stripe API и Supabase
- 7 групп тестов
- Coverage target: >90%

### Task T2.2: Webhook Tests (3-4h)
- Integration tests для webhook endpoint
- Signature verification
- 5 event handlers
- Idempotency verification

### Task T2.3: API Endpoint Tests (2-3h)
- Tests для 4 REST endpoints
- JWT authentication
- Error codes (400, 401, 404, 409, 500)
- Idempotency

**Total**: 8-10 часов

---

## 📄 Где всё найти

**Главный документ**: `GROK_PHASE_2_TESTING.md`

В нём ты найдёшь:
- ✅ Полный код для всех тестов (copy-paste ready!)
- ✅ Setup инструкции (Jest, mocks, env vars)
- ✅ Test cases для каждого метода
- ✅ Success criteria
- ✅ Tips & best practices

**Контекст о Phase 2**: `PHASE_2_COMPLETE.md`

---

## 🚀 Quick Start

1. **Читай**: `GROK_PHASE_2_TESTING.md` (все детали там)

2. **Setup Environment**:
```bash
# Install test dependencies
npm install --save-dev jest @types/jest ts-jest

# Create .env.test
cp .env.local.example .env.test
```

3. **Start Testing**:
```bash
# Task T2.1
npm test packages/billing/src/__tests__/subscription-service.test.ts

# Task T2.2
npm test apps/web/__tests__/integration/stripe-webhooks.test.ts

# Task T2.3
npm test apps/web/__tests__/api/subscriptions.test.ts
```

4. **Coverage**:
```bash
npm test -- --coverage
```

5. **Report**: Когда закончишь → создай `TEST_REPORT_PHASE_2.md`

---

## 🎓 Что тестируем

### SubscriptionService (10 методов):

1. **createFreeSubscription** - новый пользователь получает free plan
2. **getOrCreateStripeCustomer** - идемпотентное создание customer
3. **createCheckoutSession** - Stripe Checkout для upgrade
4. **getSubscription** - получение подписки
5. **updateSubscription** - обновление полей
6. **cancelSubscription** - отмена в конце периода
7. **reactivateSubscription** - восстановление отменённой
8. **hasAccess** - проверка доступа (free < pro < enterprise)
9. **getSubscriptionWithPlan** - подписка + детали плана
10. **syncFromStripe** - ручная синхронизация

### Webhooks (5 events):

1. **checkout.session.completed** - активация после оплаты
2. **customer.subscription.updated** - изменение статуса
3. **customer.subscription.deleted** - downgrade to free
4. **invoice.payment_failed** - помечаем past_due
5. **invoice.payment_succeeded** - реактивация

### API Endpoints (4):

1. **GET /api/subscriptions/current** - текущая подписка
2. **POST /api/subscriptions/checkout** - создание checkout session
3. **POST /api/subscriptions/cancel** - отмена подписки
4. **POST /api/subscriptions/reactivate** - реактивация

---

## ✅ Success Criteria

- ✅ All tests pass
- ✅ Coverage >85%
- ✅ Zero critical bugs
- ✅ Security tests pass
- ✅ Idempotency verified
- ✅ Error handling tested

---

## 💡 Important Tips

1. **Mock Everything**: Stripe API и Supabase в unit tests
2. **Signature Verification**: Critical для webhooks security
3. **Idempotency**: Webhooks могут retry - тестируй дубликаты
4. **Error Cases**: Не только happy path
5. **Database Checks**: Verify state после operations
6. **Performance**: Webhooks должны быть <5s

---

## 🔧 Test Tools

### Stripe CLI для webhook testing:

```bash
# Install
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
```

### Jest для unit/integration tests:

```bash
# Run all tests
npm test

# Watch mode
npm test -- --watch

# Coverage report
npm test -- --coverage
```

---

## 📊 Coverage Targets

| Component | Target | Priority |
|-----------|--------|----------|
| SubscriptionService | >90% | High |
| Webhooks | >85% | High |
| API Endpoints | >85% | High |
| **Overall** | **>85%** | **High** |

---

## 📝 Reporting

Когда закончишь, создай отчёт: `TEST_REPORT_PHASE_2.md`

Include:
- Total tests run
- Pass/fail ratio
- Code coverage %
- Issues found (bugs, если есть)
- Recommendations
- Overall quality assessment

Template есть в `GROK_PHASE_2_TESTING.md`

---

## 🏆 Why This Matters

Phase 2 - это **монетизация**! Billing система должна быть:
- 🔒 **Secure** - no payment bugs
- 🎯 **Accurate** - correct subscriptions
- 💪 **Reliable** - handles failures gracefully
- ⚡ **Fast** - webhooks <5s

**Твои тесты** гарантируют качество для production! 💰

---

## 📞 Questions?

- **Stuck?** → Проверь `GROK_PHASE_2_TESTING.md`
- **Need context?** → Read `PHASE_2_COMPLETE.md`
- **Webhook issues?** → Use `docs/STRIPE_WEBHOOKS.md`
- **Blocker?** → Escalate to Codex/Claude

---

## 🎯 Your Mission

**Test Phase 2 billing system and ensure it's production-ready!**

**Tasks**:
1. Task T2.1: SubscriptionService Tests (4-5h)
2. Task T2.2: Webhook Tests (3-4h)
3. Task T2.3: API Endpoint Tests (2-3h)

**Total**: 8-10 hours

**Deliverable**: `TEST_REPORT_PHASE_2.md` + all tests passing

---

**Let's make Phase 2 bulletproof!** 🔒🧪

Good luck, Grok! You're the quality guardian! 🛡️

---

*"In testing we trust."* - QA Philosophy

**Go break things (in tests)!** 💥
