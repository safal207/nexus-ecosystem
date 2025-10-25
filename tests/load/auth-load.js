import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp up to 50 users
    { duration: '1m', target: 100 },   // Stay at 100 users
    { duration: '30s', target: 200 },  // Spike to 200 users
    { duration: '1m', target: 100 },   // Down to 100 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    errors: ['rate<0.1'],             // Error rate must be below 10%
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:3000';

export default function () {
  // Test registration
  const email = `load_test_${Date.now()}_${Math.random()}@example.com`;
  const registerPayload = JSON.stringify({
    email,
    password: 'LoadTest123!',
    full_name: 'Load Test User',
  });

  let response = http.post(
    `${API_URL}/api/auth/register`,
    registerPayload,
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(response, {
    'registration status is 201': (r) => r.status === 201,
    'registration completes in <500ms': (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  sleep(1);

  // Test login
  const loginPayload = JSON.stringify({
    email,
    password: 'LoadTest123!',
  });

  response = http.post(
    `${API_URL}/api/auth/login`,
    loginPayload,
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(response, {
    'login status is 200': (r) => r.status === 200,
    'login completes in <300ms': (r) => r.timings.duration < 300,
    'returns access token': (r) => r.headers['Set-Cookie'].includes('nexus_token'),
  }) || errorRate.add(1);

  sleep(1);
}
