// nexus-ecosystem/packages/auth/src/jwt.ts

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { EcoIDService, CreateEcoIDParams, EcoIdentity } from '@nexus/eco-id';
import { JwtTokens, LoginCredentials, RegisterData, User } from './types';

// Initialize EcoID service
const ecoIdService = new EcoIDService(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

/**
 * Hashes a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Compares a plain password with a hashed password
 */
export async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Generates an access token with 15 minute expiry
 */
export function generateAccessToken(payload: any): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '15m',
    issuer: 'nexus-hub'
  });
}

/**
 * Generates a refresh token with 7 day expiry
 */
export function generateRefreshToken(ecoId: string): string {
  return jwt.sign({ ecoId, type: 'refresh' }, JWT_REFRESH_SECRET, {
    expiresIn: '7d',
    issuer: 'nexus-hub'
  });
}

/**
 * Verifies an access token
 */
export function verifyAccessToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch (error) {
    throw new Error('Invalid access token');
  }
}

/**
 * Verifies a refresh token
 */
export function verifyRefreshToken(token: string): any {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as any;
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
}

/**
 * Authenticates a user with email and password
 */
export async function login(credentials: LoginCredentials): Promise<JwtTokens> {
  const { email, password } = credentials;

  // Verify credentials via EcoID service
  const ecoId = await ecoIdService.verifyCredentials(email, password);

  if (!ecoId) {
    throw new Error('Invalid credentials');
  }

  // Get full identity
  const identity = await ecoIdService.getIdentity(ecoId);

  // Generate JWT tokens with EcoID in payload
  const accessToken = generateAccessToken({
    ecoId: identity.ecoId,
    email: identity.email,
    role: 'user',
  });

  const refreshToken = generateRefreshToken(identity.ecoId);

  // Update last seen timestamp
  await ecoIdService.updateLastSeen(identity.ecoId);

  // Create user object to maintain compatibility
  const user: User = {
    id: identity.ecoId,
    email: identity.email || email,
    password_hash: '', // Not returned for security
    full_name: identity.displayName || undefined,
    avatar_url: undefined,
    created_at: identity.createdAt.toISOString(),
    updated_at: identity.createdAt.toISOString(),
  };

  return { accessToken, refreshToken, user };
}

/**
 * Registers a new user
 */
export async function register(userData: RegisterData): Promise<User> {
  const { email, password, full_name } = userData;

  // Use EcoID service to create user
  const identity = await ecoIdService.createUser({
    type: 'usr',
    email,
    password,
    displayName: full_name,
  });

  // Create user object to maintain compatibility
  const user: User = {
    id: identity.ecoId,
    email: identity.email || email,
    password_hash: '', // Not returned for security
    full_name: identity.displayName || undefined,
    avatar_url: undefined,
    created_at: identity.createdAt.toISOString(),
    updated_at: identity.createdAt.toISOString(),
  };

  return user;
}

/**
 * Logs out a user
 */
export async function logout(ecoId: string, refreshToken?: string): Promise<void> {
  // In a future implementation, we could mark refresh tokens as invalid
  console.log(`User ${ecoId} logged out`);
}