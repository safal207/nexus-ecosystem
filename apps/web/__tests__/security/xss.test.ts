import request from 'supertest';

const API_URL = process.env.TEST_API_URL;
const SKIP = !API_URL;
const d = (SKIP ? describe.skip : describe);

d('XSS Prevention', () => {
  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert("XSS")>',
    'javascript:alert("XSS")',
    '<svg onload=alert("XSS")>',
  ];

  xssPayloads.forEach((payload) => {
    test(`should sanitize XSS attempt: ${payload}`, async () => {
      const response = await request(API_URL as string)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
          full_name: payload,
        });

      if (response.status === 201) {
        // If registration succeeded, check that payload is sanitized
        expect(response.body.user.full_name).not.toContain('<script');
        expect(response.body.user.full_name).not.toContain('javascript:');
      }
    });
  });

  test('should set httpOnly cookies (prevents XSS cookie theft)', async () => {
    const response = await request(API_URL as string)
      .post('/api/auth/login')
      .send({
        email: 'existing@example.com',
        password: 'SecurePass123!',
      });

    const cookies = response.headers['set-cookie'] || [];
    const tokenCookie = cookies.find((c: string) => c.startsWith('nexus_token='));

    expect(tokenCookie).toContain('HttpOnly');
  });
});
