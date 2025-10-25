import request from 'supertest';

const API_URL = process.env.TEST_API_URL;
const SKIP = !API_URL;
const d = (SKIP ? describe.skip : describe);

d('SQL Injection Prevention', () => {
  const sqlInjectionPayloads = [
    "'; DROP TABLE users; --",
    "admin' OR '1'='1",
    "' OR 1=1 --",
    "admin' --",
    "' UNION SELECT NULL, NULL, NULL --",
  ];

  sqlInjectionPayloads.forEach((payload) => {
    test(`should block SQL injection attempt: ${payload}`, async () => {
      const response = await request(API_URL as string)
        .post('/api/auth/login')
        .send({
          email: payload,
          password: 'any password',
        });

      // Should return 400 or 401, NOT 500 (which indicates SQL error)
      expect([400, 401]).toContain(response.status);
      expect(response.body.error).not.toContain('SQL');
      expect(response.body.error).not.toContain('syntax');
    });
  });

  test('should safely handle special characters in email', async () => {
    const response = await request(API_URL as string)
      .post('/api/auth/register')
      .send({
        email: "test+special'chars@example.com",
        password: 'SecurePass123!',
      });

    // Should either accept (if valid email) or reject gracefully
    expect([201, 400]).toContain(response.status);
  });
});
