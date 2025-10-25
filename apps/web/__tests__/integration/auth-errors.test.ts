import request from 'supertest';

const API_URL = process.env.TEST_API_URL;
const SKIP = !API_URL;
const d = (SKIP ? describe.skip : describe);

d('Authentication Error Handling', () => {
  describe('POST /api/auth/register', () => {
    test('should return 400 for missing email', async () => {
      const response = await request(API_URL as string)
        .post('/api/auth/register')
        .send({ password: 'SecurePass123!' })
        .expect(400);

      expect(response.body.error).toContain('Email');
    });

    test('should return 400 for missing password', async () => {
      const response = await request(API_URL as string)
        .post('/api/auth/register')
        .send({ email: 'test@example.com' })
        .expect(400);

      expect(response.body.error).toContain('password');
    });

    test('should return 400 for invalid email format', async () => {
      const response = await request(API_URL as string)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'SecurePass123!',
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid email');
    });

    test('should return 400 for weak password', async () => {
      const response = await request(API_URL as string)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: '12345', // Too weak
        })
        .expect(400);

      expect(response.body.error).toContain('Password must be at least');
    });

    test('should return 409 for duplicate email', async () => {
      const user = {
        email: 'duplicate@example.com',
        password: 'SecurePass123!',
      };

      // Register once
      await request(API_URL as string).post('/api/auth/register').send(user).expect(201);

      // Try again
      const response = await request(API_URL as string)
        .post('/api/auth/register')
        .send(user)
        .expect(409);

      expect(response.body.error).toContain('already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    test('should return 401 for invalid credentials', async () => {
      const response = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'AnyPassword123!',
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid');
    });

    test('should return 400 for missing email', async () => {
      await request(API_URL as string)
        .post('/api/auth/login')
        .send({ password: 'Pass123!' })
        .expect(400);
    });
  });

  describe('POST /api/auth/refresh', () => {
    test('should return 401 for missing refresh token', async () => {
      await request(API_URL as string)
        .post('/api/auth/refresh')
        .expect(401);
    });

    test('should return 401 for invalid refresh token', async () => {
      await request(API_URL as string)
        .post('/api/auth/refresh')
        .set('Cookie', ['nexus_refresh_token=invalid.token.here'])
        .expect(401);
    });
  });
});
