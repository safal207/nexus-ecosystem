import request from 'supertest';
import jwt from 'jsonwebtoken';

const API_URL = process.env.TEST_API_URL;
const SKIP = !API_URL;
const d = (SKIP ? describe.skip : describe);

d('JWT Security', () => {
  test('should reject tampered JWT', async () => {
    // Create valid token
    const validPayload = {
      ecoId: 'usr_123',
      email: 'test@example.com',
      role: 'user',
    };
    const validToken = jwt.sign(validPayload, process.env.JWT_SECRET!, { expiresIn: '15m' });

    // Tamper with token (change role to admin)
    const tamperedPayload = {
      ecoId: 'usr_123',
      email: 'test@example.com',
      role: 'admin', // ← Changed!
    };
    const tamperedToken = jwt.sign(tamperedPayload, 'wrong-secret', { expiresIn: '15m' });

    // Try to access with tampered token
    const response = await request(API_URL as string)
      .get('/api/user/profile')
      .set('Cookie', [`nexus_token=${tamperedToken}`]);

    expect([401, 403]).toContain(response.status);
  });

  test('should reject expired JWT', async () => {
    const expiredPayload = {
      ecoId: 'usr_123',
      email: 'test@example.com',
    };
    const expiredToken = jwt.sign(expiredPayload, process.env.JWT_SECRET!, { expiresIn: '-1h' });

    const response = await request(API_URL as string)
      .get('/api/user/profile')
      .set('Cookie', [`nexus_token=${expiredToken}`]);

    expect(response.status).toBe(401);
  });

  test('should use secure cookies in production', async () => {
    // Mock production environment
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const response = await request(API_URL as string)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

    const cookies = response.headers['set-cookie'] || [];
    const tokenCookie = cookies.find((c: string) => c.startsWith('nexus_token='));

    expect(tokenCookie).toContain('Secure'); // HTTPS only in production

    process.env.NODE_ENV = oldEnv;
  });

  test('should use sameSite protection', async () => {
    const response = await request(API_URL as string)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

    const cookies = response.headers['set-cookie'] || [];
    const tokenCookie = cookies.find((c: string) => c.startsWith('nexus_token='));

    expect(tokenCookie).toContain('SameSite=Strict');
  });
});
