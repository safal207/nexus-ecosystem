import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
} from '../src/jwt';
import { mockJwtPayload } from './fixtures';

describe('JWT Token Generation', () => {
  describe('generateAccessToken', () => {
    test('should generate valid access token', () => {
      const token = generateAccessToken(mockJwtPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    test('should include payload data in token', () => {
      const token = generateAccessToken(mockJwtPayload);
      const decoded = verifyAccessToken(token);

      expect(decoded.ecoId).toBe(mockJwtPayload.ecoId);
      expect(decoded.email).toBe(mockJwtPayload.email);
      expect(decoded.role).toBe(mockJwtPayload.role);
    });

    test('should set correct expiration (15 minutes)', () => {
      const token = generateAccessToken(mockJwtPayload);
      const decoded = verifyAccessToken(token);

      const now = Math.floor(Date.now() / 1000);
      const expectedExpiry = now + (15 * 60); // 15 minutes

      expect(decoded.exp).toBeGreaterThan(now);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 5); // 5s tolerance
    });

    test('should include issuer', () => {
      const token = generateAccessToken(mockJwtPayload);
      const decoded = verifyAccessToken(token);

      expect(decoded.iss).toBe('nexus-hub');
    });
  });

  describe('generateRefreshToken', () => {
    test('should generate valid refresh token', () => {
      const token = generateRefreshToken('usr_123e4567-e89b-12d3-a456-426614174000');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    test('should set 7 day expiration', () => {
      const token = generateRefreshToken('usr_123e4567-e89b-12d3-a456-426614174000');
      const decoded = verifyRefreshToken(token);

      const now = Math.floor(Date.now() / 1000);
      const expectedExpiry = now + (7 * 24 * 60 * 60); // 7 days

      expect(decoded.exp).toBeGreaterThan(now);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 60); // 1min tolerance
    });

    test('should mark token as refresh type', () => {
      const token = generateRefreshToken('usr_123e4567-e89b-12d3-a456-426614174000');
      const decoded = verifyRefreshToken(token);

      expect(decoded.type).toBe('refresh');
    });
  });

  describe('verifyAccessToken', () => {
    test('should verify valid token', () => {
      const token = generateAccessToken(mockJwtPayload);

      expect(() => verifyAccessToken(token)).not.toThrow();
    });

    test('should reject invalid token', () => {
      expect(() => verifyAccessToken('invalid.token.here')).toThrow('Invalid access token');
    });

    test('should reject expired token', async () => {
      // Mock token that expired 1 hour ago
      const expiredPayload = {
        ...mockJwtPayload,
        exp: Math.floor(Date.now() / 1000) - 3600,
      };

      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        expiredPayload,
        process.env.JWT_SECRET!,
        { expiresIn: '-1h' }
      );

      expect(() => verifyAccessToken(expiredToken)).toThrow();
    });

    test('should reject token with wrong signature', () => {
      const jwt = require('jsonwebtoken');
      const wrongToken = jwt.sign(mockJwtPayload, 'wrong-secret');

      expect(() => verifyAccessToken(wrongToken)).toThrow();
    });
  });
});