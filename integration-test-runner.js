// Simple integration test runner for auth endpoints
// Run with: node integration-test-runner.js

const http = require('http');

const API_URL = 'http://localhost:3000';
let testResults = {
  total: 0,
  passed: 0,
  failed: 0
};

function test(name, fn) {
  testResults.total++;
  return new Promise((resolve) => {
    try {
      fn(resolve);
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
      testResults.failed++;
      resolve();
    }
  });
}

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const jsonBody = body ? JSON.parse(body) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: jsonBody
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function runIntegrationTests() {
  console.log('🧪 Nexus Ecosystem - Integration Test Runner\n');
  console.log('Testing API endpoints...\n');

  // Test data
  const testUser = {
    email: `integration_test_${Date.now()}@example.com`,
    password: 'SecurePassword123!',
    full_name: 'Integration Test User'
  };

  let accessToken = '';
  let refreshToken = '';

  // Test 1: Register new user
  await test('POST /api/auth/register - User registration', async (done) => {
    try {
      const url = new URL('/api/auth/register', API_URL);
      const response = await makeRequest({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      }, testUser);

      if (response.status === 201 && response.body.message && response.body.user.email === testUser.email) {
        console.log(`✅ POST /api/auth/register - User registration`);
        testResults.passed++;
      } else {
        throw new Error(`Unexpected response: ${response.status} - ${JSON.stringify(response.body)}`);
      }
      done();
    } catch (error) {
      console.log(`❌ POST /api/auth/register - User registration: ${error.message}`);
      testResults.failed++;
      done();
    }
  });

  // Test 2: Login with credentials
  await test('POST /api/auth/login - User login', async (done) => {
    try {
      const url = new URL('/api/auth/login', API_URL);
      const response = await makeRequest({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      }, {
        email: testUser.email,
        password: testUser.password
      });

      if (response.status === 200 && response.body.message === 'Login successful') {
        console.log(`✅ POST /api/auth/login - User login`);

        // Extract tokens from cookies
        const cookies = response.headers['set-cookie'] || [];
        const tokenCookie = cookies.find(c => c.startsWith('nexus_token='));
        const refreshCookie = cookies.find(c => c.startsWith('nexus_refresh_token='));

        if (tokenCookie && refreshCookie) {
          accessToken = tokenCookie.split(';')[0].split('=')[1];
          refreshToken = refreshCookie.split(';')[0].split('=')[1];
          testResults.passed++;
        } else {
          throw new Error('Tokens not found in cookies');
        }
      } else {
        throw new Error(`Unexpected response: ${response.status} - ${JSON.stringify(response.body)}`);
      }
      done();
    } catch (error) {
      console.log(`❌ POST /api/auth/login - User login: ${error.message}`);
      testResults.failed++;
      done();
    }
  });

  // Test 3: Access protected route (skip if login failed)
  if (accessToken) {
    await test('GET /api/user/profile - Protected route access', async (done) => {
      try {
        const url = new URL('/api/user/profile', API_URL);
        const response = await makeRequest({
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'GET',
          headers: {
            'Cookie': `nexus_token=${accessToken}`
          }
        });

        if (response.status === 200 && response.body.user && response.body.user.email === testUser.email) {
          console.log(`✅ GET /api/user/profile - Protected route access`);
          testResults.passed++;
        } else {
          throw new Error(`Unexpected response: ${response.status} - ${JSON.stringify(response.body)}`);
        }
        done();
      } catch (error) {
        console.log(`❌ GET /api/user/profile - Protected route access: ${error.message}`);
        testResults.failed++;
        done();
      }
    });
  }

  // Test 4: Refresh token (skip if refresh token not available)
  if (refreshToken) {
    await test('POST /api/auth/refresh - Token refresh', async (done) => {
      try {
        const url = new URL('/api/auth/refresh', API_URL);
        const response = await makeRequest({
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Cookie': `nexus_refresh_token=${refreshToken}`
          }
        });

        if (response.status === 200 && response.body.message) {
          console.log(`✅ POST /api/auth/refresh - Token refresh`);

          // Check for new access token in cookies
          const cookies = response.headers['set-cookie'] || [];
          const newTokenCookie = cookies.find(c => c.startsWith('nexus_token='));

          if (newTokenCookie) {
            const newAccessToken = newTokenCookie.split(';')[0].split('=')[1];
            if (newAccessToken && newAccessToken !== accessToken) {
              testResults.passed++;
            } else {
              throw new Error('New access token not generated');
            }
          } else {
            throw new Error('New access token cookie not found');
          }
        } else {
          throw new Error(`Unexpected response: ${response.status} - ${JSON.stringify(response.body)}`);
        }
        done();
      } catch (error) {
        console.log(`❌ POST /api/auth/refresh - Token refresh: ${error.message}`);
        testResults.failed++;
        done();
      }
    });
  }

  // Test 5: Logout
  if (accessToken) {
    await test('POST /api/auth/logout - User logout', async (done) => {
      try {
        const url = new URL('/api/auth/logout', API_URL);
        const response = await makeRequest({
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Cookie': `nexus_token=${accessToken}`
          }
        });

        if (response.status === 200 && response.body.message) {
          console.log(`✅ POST /api/auth/logout - User logout`);
          testResults.passed++;
        } else {
          throw new Error(`Unexpected response: ${response.status} - ${JSON.stringify(response.body)}`);
        }
        done();
      } catch (error) {
        console.log(`❌ POST /api/auth/logout - User logout: ${error.message}`);
        testResults.failed++;
        done();
      }
    });
  }

  // Test 6: Access protected route after logout (should fail)
  await test('GET /api/user/profile - Access after logout (should fail)', async (done) => {
    try {
      const url = new URL('/api/user/profile', API_URL);
      const response = await makeRequest({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        headers: {
          'Cookie': `nexus_token=${accessToken}`
        }
      });

      if (response.status === 401) {
        console.log(`✅ GET /api/user/profile - Access after logout (should fail)`);
        testResults.passed++;
      } else {
        throw new Error(`Expected 401, got ${response.status}`);
      }
      done();
    } catch (error) {
      console.log(`❌ GET /api/user/profile - Access after logout (should fail): ${error.message}`);
      testResults.failed++;
      done();
    }
  });

  // Test 7: Register validation - weak password
  await test('POST /api/auth/register - Weak password validation', async (done) => {
    try {
      const url = new URL('/api/auth/register', API_URL);
      const response = await makeRequest({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      }, {
        email: `weak_test_${Date.now()}@example.com`,
        password: '12345', // Too weak
        full_name: 'Weak Password User'
      });

      if (response.status === 400 && response.body.error.includes('Password')) {
        console.log(`✅ POST /api/auth/register - Weak password validation`);
        testResults.passed++;
      } else {
        throw new Error(`Expected 400 with password error, got ${response.status}`);
      }
      done();
    } catch (error) {
      console.log(`❌ POST /api/auth/register - Weak password validation: ${error.message}`);
      testResults.failed++;
      done();
    }
  });

  // Test 8: Login with invalid credentials
  await test('POST /api/auth/login - Invalid credentials', async (done) => {
    try {
      const url = new URL('/api/auth/login', API_URL);
      const response = await makeRequest({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      }, {
        email: 'nonexistent@example.com',
        password: 'WrongPassword123!'
      });

      if (response.status === 401 && response.body.error.includes('Invalid')) {
        console.log(`✅ POST /api/auth/login - Invalid credentials`);
        testResults.passed++;
      } else {
        throw new Error(`Expected 401, got ${response.status}`);
      }
      done();
    } catch (error) {
      console.log(`❌ POST /api/auth/login - Invalid credentials: ${error.message}`);
      testResults.failed++;
      done();
    }
  });

  // Summary
  console.log('\n=== INTEGRATION TEST SUMMARY ===');
  console.log(`Total: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);

  if (testResults.failed === 0) {
    console.log('\n🎉 ALL INTEGRATION TESTS PASSED!');
    console.log('✅ Authentication flow working correctly');
    console.log('✅ Token refresh working');
    console.log('✅ Security validations working');
  } else {
    console.log('\n⚠️ SOME TESTS FAILED - Check server status and configuration');
  }
}

// Run tests
runIntegrationTests().catch(console.error);
