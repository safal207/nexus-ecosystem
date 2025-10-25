// nexus-ecosystem/packages/auth/src/types.ts

export interface User {
  id: string; // This will now be the EcoID
  email: string;
  password_hash: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface TokenPayload {
  ecoId: string;  // Changed from userId
  email: string;
  role?: 'admin' | 'user' | 'api_user';
}

export interface RefreshTokenPayload {
  ecoId: string;  // Changed from userId
  type: 'refresh';
}

export interface JwtTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface ApiKey {
  id: string;
  eco_id: string;
  key_hash: string;
  name: string;
  scopes: string[];
  status: 'active' | 'revoked' | 'expired';
  test_mode: boolean;
  last_used_at: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;  // This will be the EcoID
  plan: string;
  status: string;
  stripe_subscription_id?: string;
  current_period_end?: string;
  mrr?: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  full_name?: string;
}