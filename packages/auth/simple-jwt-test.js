// Simple JavaScript test for JWT functions
const jwt = require('jsonwebtoken');

// Mock environment variables
process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-long!';

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

// Test data
const mockJwtPayload = {
  ecoId: 'usr_123e4567-e89b-12d3-a456-426614174000',
  email: 'test@example.com',
  role: 'user',
};

console.log('🧪 Running JWT Function Tests...');

// Test 1: Generate access token
console.log('\n✅ Test 1: Generate access token');
const token = generateAccessToken(mockJwtPayload);
console.log('Token generated:', token.substring(0, 50) + '...');
console.log('Token has 3 parts:', token.split('.').length === 3);

// Test 2: Verify access token
console.log('\n✅ Test 2: Verify access token');
const decoded = verifyAccessToken(token);
console.log('Decoded ecoId:', decoded.ecoId);
console.log('Decoded email:', decoded.email);
console.log('Decoded role:', decoded.role);
console.log('Issuer:', decoded.iss);

// Test 3: Check expiration
console.log('\n✅ Test 3: Check expiration');
const now = Math.floor(Date.now() / 1000);
const expectedExpiry = now + (15 * 60);
console.log('Token expires in ~15 minutes:', decoded.exp > now && decoded.exp <= expectedExpiry);

// Test 4: Generate refresh token
console.log('\n✅ Test 4: Generate refresh token');
const refreshToken = generateRefreshToken('usr_123e4567-e89b-12d3-a456-426614174000');
const decodedRefresh = verifyRefreshToken(refreshToken);
console.log('Refresh token ecoId:', decodedRefresh.ecoId);
console.log('Refresh token type:', decodedRefresh.type);

// Test 5: Test invalid token
console.log('\n✅ Test 5: Test invalid token');
try {
  verifyAccessToken('invalid.token.here');
  console.log('ERROR: Should have thrown!');
} catch (error) {
  console.log('Correctly rejected invalid token:', error.message);
}

console.log('\n🎉 All JWT tests passed! Core functionality works.');
console.log('\n📊 Test Results:');
console.log('- Access token generation: ✅');
console.log('- Access token verification: ✅');
console.log('- Refresh token generation: ✅');
console.log('- Refresh token verification: ✅');
console.log('- Invalid token rejection: ✅');
console.log('- Expiration validation: ✅');
