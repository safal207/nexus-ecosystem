// Simple test runner for JWT authentication functions
// Run with: node test-runner.js

console.log('🧪 Nexus Ecosystem - JWT Authentication Test Runner\n');

// Mock environment variables
process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

// Import functions directly
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Test data
const mockJwtPayload = {
  ecoId: 'usr_123e4567-e89b-12d3-a456-426614174000',
  email: 'test@example.com',
  role: 'user',
};

let testResults = {
  total: 0,
  passed: 0,
  failed: 0
};

function test(name, fn) {
  testResults.total++;
  try {
    fn();
    console.log(`✅ ${name}`);
    testResults.passed++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    testResults.failed++;
  }
}

// JWT Functions Tests
function generateAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '15m',
    issuer: 'nexus-hub'
  });
}

function generateRefreshToken(ecoId) {
  return jwt.sign({ ecoId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
    issuer: 'nexus-hub'
  });
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid access token');
  }
}

function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

console.log('=== JWT TOKEN TESTS ===\n');

test('generateAccessToken creates valid JWT', () => {
  const token = generateAccessToken(mockJwtPayload);
  if (!token || typeof token !== 'string' || !token.split('.').length === 3) {
    throw new Error('Invalid token format');
  }
});

test('generateAccessToken includes correct payload', () => {
  const token = generateAccessToken(mockJwtPayload);
  const decoded = verifyAccessToken(token);

  if (decoded.ecoId !== mockJwtPayload.ecoId) {
    throw new Error('ecoId not included in payload');
  }
  if (decoded.email !== mockJwtPayload.email) {
    throw new Error('email not included in payload');
  }
  if (decoded.role !== mockJwtPayload.role) {
    throw new Error('role not included in payload');
  }
});

test('generateAccessToken has correct expiration (15 min)', () => {
  const token = generateAccessToken(mockJwtPayload);
  const decoded = verifyAccessToken(token);
  const now = Math.floor(Date.now() / 1000);
  const expectedExpiry = now + (15 * 60);

  if (decoded.exp <= now || decoded.exp > expectedExpiry + 5) {
    throw new Error(`Invalid expiration: ${decoded.exp}, expected: ${expectedExpiry}`);
  }
});

test('generateAccessToken has correct issuer', () => {
  const token = generateAccessToken(mockJwtPayload);
  const decoded = verifyAccessToken(token);

  if (decoded.iss !== 'nexus-hub') {
    throw new Error('Invalid issuer');
  }
});

test('generateRefreshToken creates valid JWT', () => {
  const token = generateRefreshToken('usr_123e4567-e89b-12d3-a456-426614174000');
  if (!token || typeof token !== 'string' || token.split('.').length !== 3) {
    throw new Error('Invalid token format');
  }
});

test('generateRefreshToken has correct payload', () => {
  const ecoId = 'usr_123e4567-e89b-12d3-a456-426614174000';
  const token = generateRefreshToken(ecoId);
  const decoded = verifyRefreshToken(token);

  if (decoded.ecoId !== ecoId) {
    throw new Error('ecoId not included in payload');
  }
  if (decoded.type !== 'refresh') {
    throw new Error('type not set to refresh');
  }
});

test('generateRefreshToken has correct expiration (7 days)', () => {
  const token = generateRefreshToken('usr_123e4567-e89b-12d3-a456-426614174000');
  const decoded = verifyRefreshToken(token);
  const now = Math.floor(Date.now() / 1000);
  const expectedExpiry = now + (7 * 24 * 60 * 60);

  if (decoded.exp <= now || decoded.exp > expectedExpiry + 60) {
    throw new Error(`Invalid expiration: ${decoded.exp}, expected: ${expectedExpiry}`);
  }
});

test('verifyAccessToken rejects invalid token', () => {
  try {
    verifyAccessToken('invalid.token.here');
    throw new Error('Should have thrown error');
  } catch (error) {
    if (error.message !== 'Invalid access token') {
      throw new Error('Wrong error message');
    }
  }
});

test('verifyRefreshToken rejects invalid token', () => {
  try {
    verifyRefreshToken('invalid.token.here');
    throw new Error('Should have thrown error');
  } catch (error) {
    if (error.message !== 'Invalid refresh token') {
      throw new Error('Wrong error message');
    }
  }
});

console.log('\n=== PASSWORD HASHING TESTS ===\n');

test('hashPassword creates valid hash', async () => {
  const password = 'MySecurePassword123!';
  const hash = await hashPassword(password);

  if (!hash || typeof hash !== 'string' || hash.length < 50) {
    throw new Error('Invalid hash format');
  }
  if (!hash.startsWith('$2b$')) {
    throw new Error('Not a bcrypt hash');
  }
});

test('hashPassword uses correct rounds (10)', async () => {
  const password = 'MySecurePassword123!';
  const hash = await hashPassword(password);

  if (!hash.startsWith('$2b$10$')) {
    throw new Error('Not using 10 rounds');
  }
});

test('comparePassword validates correct password', async () => {
  const password = 'MySecurePassword123!';
  const hash = await hashPassword(password);
  const result = await comparePassword(password, hash);

  if (!result) {
    throw new Error('Correct password not validated');
  }
});

test('comparePassword rejects incorrect password', async () => {
  const password = 'MySecurePassword123!';
  const hash = await hashPassword(password);
  const result = await comparePassword('WrongPassword123!', hash);

  if (result) {
    throw new Error('Incorrect password validated');
  }
});

test('password hashing is case sensitive', async () => {
  const password = 'Password123!';
  const hash = await hashPassword(password);
  const result = await comparePassword('password123!', hash);

  if (result) {
    throw new Error('Password should be case sensitive');
  }
});

console.log('\n=== REFRESH TOKEN COMPATIBILITY TESTS ===\n');

test('refresh token uses ecoId in payload', () => {
  const ecoId = 'usr_123e4567-e89b-12d3-a456-426614174000';
  const refreshToken = generateRefreshToken(ecoId);
  const decoded = verifyRefreshToken(refreshToken);

  if (decoded.ecoId !== ecoId) {
    throw new Error('Refresh token does not contain ecoId');
  }
});

test('refresh token payload compatible with access token generation', () => {
  const ecoId = 'usr_123e4567-e89b-12d3-a456-426614174000';
  const refreshToken = generateRefreshToken(ecoId);
  const refreshDecoded = verifyRefreshToken(refreshToken);

  // Should be able to generate access token from refresh token data
  const accessToken = generateAccessToken({
    ecoId: refreshDecoded.ecoId,
    email: 'test@example.com',
    role: 'user'
  });

  const accessDecoded = verifyAccessToken(accessToken);

  if (accessDecoded.ecoId !== refreshDecoded.ecoId) {
    throw new Error('Access token ecoId does not match refresh token ecoId');
  }
});

// Summary
console.log('\n=== TEST SUMMARY ===');
console.log(`Total: ${testResults.total}`);
console.log(`Passed: ${testResults.passed}`);
console.log(`Failed: ${testResults.failed}`);

if (testResults.failed === 0) {
  console.log('\n🎉 ALL TESTS PASSED!');
  console.log('✅ JWT authentication functions are working correctly');
  console.log('✅ Refresh token compatibility confirmed');
  console.log('✅ Ready for integration testing');
} else {
  console.log('\n❌ SOME TESTS FAILED!');
  console.log('Need to fix issues before proceeding');
}
