import request from 'supertest';

// Note: You'll need to create a test server instance
// For now, assume app runs on localhost:3000

const API_URL = process.env.TEST_API_URL;
const SKIP = !API_URL;
const d = (SKIP ? describe.skip : describe);

d('Complete Authentication Flow', () => {
  const testUser = {
    email: `test_${Date.now()}@example.com`,
    password: 'SecurePassword123!',
    full_name: 'Integration Test User',
  };

  let accessToken: string;
  let refreshToken: string;

  test('Step 1: Register new user', async () => {
    const response = await request(API_URL as string)
      .post('/api/auth/register')
      .send(testUser)
      .expect(201);

    expect(response.body).toHaveProperty('message');
    expect(response.body.user.email).toBe(testUser.email);
  });

  test('Step 2: Login with credentials', async () => {
    const response = await request(API_URL as string)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    expect(response.body).toHaveProperty('message', 'Login successful');
    expect(response.body.user.email).toBe(testUser.email);

    // Extract cookies
    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();

    // Parse tokens from cookies
    const tokenCookie = cookies.find((c: string) => c.startsWith('nexus_token='));
    const refreshCookie = cookies.find((c: string) => c.startsWith('nexus_refresh_token='));

    expect(tokenCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();

    accessToken = tokenCookie.split(';')[0].split('=')[1];
    refreshToken = refreshCookie.split(';')[0].split('=')[1];
  });

  test('Step 3: Access protected route with token', async () => {
    // Assuming you have a protected route /api/user/profile
    const response = await request(API_URL as string)
      .get('/api/user/profile')
      .set('Cookie', [`nexus_token=${accessToken}`])
      .expect(200);

    expect(response.body.user.email).toBe(testUser.email);
  });

  test('Step 4: Refresh access token', async () => {
    const response = await request(API_URL as string)
      .post('/api/auth/refresh')
      .set('Cookie', [`nexus_refresh_token=${refreshToken}`])
      .expect(200);

    expect(response.body).toHaveProperty('message');

    // Should receive new access token
    const cookies = response.headers['set-cookie'];
    const newTokenCookie = cookies.find((c: string) => c.startsWith('nexus_token='));
    const newAccessToken = newTokenCookie.split(';')[0].split('=')[1];

    expect(newAccessToken).toBeDefined();
    expect(newAccessToken).not.toBe(accessToken); // New token
  });

  test('Step 5: Logout', async () => {
    const response = await request(API_URL)
      .post('/api/auth/logout')
      .set('Cookie', [`nexus_token=${accessToken}`])
      .expect(200);

    expect(response.body).toHaveProperty('message');

    // Cookies should be cleared
    const cookies = response.headers['set-cookie'];
    expect(cookies.some((c: string) => c.includes('nexus_token=;'))).toBe(true);
  });

  test('Step 6: Cannot access protected route after logout', async () => {
    await request(API_URL as string)
      .get('/api/user/profile')
      .set('Cookie', [`nexus_token=${accessToken}`]) // Old token
      .expect(401);
  });
});
