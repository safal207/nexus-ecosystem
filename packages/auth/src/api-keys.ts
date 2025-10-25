import { createHash, randomBytes } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { EcoIDGenerator } from '@nexus/eco-id';
import { ApiKey } from './types';

// Default rate limit for API keys (requests per minute)
const DEFAULT_RATE_LIMIT = 1000;

// Rate limiter interface
export interface RateLimiter {
  isAllowed(keyId: string, maxPerMinute: number): Promise<boolean>;
  recordUsage(keyId: string): Promise<void>;
}

// Redis-based rate limiter implementation
export class RedisRateLimiter implements RateLimiter {
  private client: any; // Redis client type will be defined based on ioredis

  constructor() {
    // Dynamically import ioredis to avoid requiring it in environments without Redis
    const Redis = require('ioredis');
    this.client = new Redis(process.env.REDIS_URL);
  }

  async isAllowed(keyId: string, maxPerMinute: number): Promise<boolean> {
    try {
      const windowStart = Math.floor(Date.now() / 60000) * 60000; // Start of current minute in ms
      const windowKey = `rl:${keyId}:${Math.floor(windowStart / 60000)}`; // Using minute timestamp
      
      // Get current count for this window
      const currentCount = await this.client.get(windowKey);
      const count = currentCount ? parseInt(currentCount) : 0;
      
      // Check if rate limit is exceeded
      if (count >= maxPerMinute) {
        return false;
      }
      
      // Set the key with expiration of 60 seconds to track the window
      await this.client.setex(windowKey, 60, (count + 1).toString());
      return true;
    } catch (error) {
      console.error('Redis rate limit error:', error);
      // Fail open if Redis is unavailable
      return true;
    }
  }

  async recordUsage(keyId: string): Promise<void> {
    // Usage is recorded during isAllowed call, so this is a no-op for Redis
    // The incremented count is already recorded by isAllowed
  }
}

// DB-based rate limiter (existing implementation as fallback)
export class DbWindowRateLimiter implements RateLimiter {
  async isAllowed(keyId: string, maxPerMinute: number): Promise<boolean> {
    const sb = getSupabase();
    const windowStart = new Date(Date.now() - 60 * 1000).toISOString();
    
    try {
      const { data, error } = await sb
        .from('eco_api_usage')
        .select('count, timestamp')
        .eq('key_id', keyId);
        
      if (error) {
        console.error('DB rate limit query error:', error);
        return true; // fail-open
      }
      
      const recent = (data || []).filter((r: any) => r.timestamp >= windowStart);
      const used = recent.reduce((sum: number, r: any) => sum + (r.count || 1), 0);
      
      if (used >= maxPerMinute) return false;
      
      // Record the usage
      await this.recordUsage(keyId);
      return true;
    } catch (error) {
      console.error('DB rate limit error:', error);
      return true; // fail-open
    }
  }

  async recordUsage(keyId: string): Promise<void> {
    try {
      const sb = getSupabase();
      await sb.from('eco_api_usage').insert({ 
        key_id: keyId, 
        timestamp: new Date().toISOString(), 
        count: 1 
      });
    } catch (error) {
      console.error('Failed to record API usage:', error);
    }
  }
}

// Select the appropriate rate limiter based on environment
export function getRateLimiter(): RateLimiter {
  if (process.env.REDIS_URL) {
    try {
      return new RedisRateLimiter();
    } catch (error) {
      console.warn('Failed to initialize Redis rate limiter, falling back to DB:', error);
      return new DbWindowRateLimiter();
    }
  } else {
    return new DbWindowRateLimiter();
  }
}

/** Generate a random Base62 string */
function generateBase62String(length: number): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) result += chars[bytes[i] % chars.length];
  return result;
}

/** SHA-256 hex digest */
function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Module-level Supabase client (for functional API)
let supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  }
  return supabase;
}

/**
 * Generates a new API key with format eco_api_<22 base62 characters>
 */
export async function generateApiKey(
  ecoId: string,
  name: string,
  scopes: string[] = [],
  testMode: boolean = false
): Promise<{ apiKey: ApiKey; plainKey: string }> {
  if (!ecoId || !name) throw new Error('ecoId and name are required');

  // Key identifier (not secret)
  const keyId = EcoIDGenerator.generate('api'); // eco_api_<22>
  // Secret shown once. Combine with id to avoid guessable secrets.
  const secretPart = generateBase62String(22);
  const plainKey = `${keyId}.${secretPart}`;
  const keyHash = sha256Hex(plainKey);

  const { data, error } = await getSupabase()
    .from('eco_api_keys')
    .insert({
      id: keyId,
      eco_id: ecoId,
      key_hash: keyHash,
      name,
      scopes,
      status: 'active',
      test_mode: testMode,
    })
    .select('id, eco_id, key_hash, name, scopes, status, test_mode, last_used_at, created_at')
    .single();

  if (error) throw error;
  return { apiKey: data as unknown as ApiKey, plainKey };
}

/**
 * Verifies an API key by looking it up by its hash
 */
export async function verifyApiKey(plainKey: string): Promise<ApiKey | null> {
  try {
    // Create SHA-256 hash of the provided plain key and look it up
    const keyHash = sha256Hex(plainKey);
    const { data, error } = await getSupabase()
      .from('eco_api_keys')
      .select('id, eco_id, key_hash, name, scopes, status, test_mode, last_used_at, created_at')
      .eq('key_hash', keyHash)
      .single();

    if (error || !data) return null;
    if (data.status !== 'active') return null;

    await getSupabase()
      .from('eco_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id);

    return data as unknown as ApiKey;
  } catch (error) {
    console.error('Failed to verify API key:', error);
    return null;
  }
}

/**
 * Revokes an API key
 */
export async function revokeApiKey(keyId: string): Promise<boolean> {
  try {
    const { error } = await getSupabase()
      .from('eco_api_keys')
      .update({ status: 'revoked' })
      .eq('id', keyId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Failed to revoke API key:', error);
    return false;
  }
}

/**
 * Lists all API keys for an EcoID
 */
export async function listKeys(ecoId: string): Promise<ApiKey[]> {
  try {
    const { data, error } = await getSupabase()
      .from('eco_api_keys')
      .select('id, eco_id, key_hash, name, scopes, status, test_mode, last_used_at, created_at')
      .eq('eco_id', ecoId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as unknown as ApiKey[];
  } catch (error) {
    console.error('Failed to list API keys:', error);
    return [];
  }
}

/**
 * Check rate limit for an API key
 * This is a stub implementation that will be completed later
 */
export async function checkRateLimit(keyId: string, maxPerMinute = DEFAULT_RATE_LIMIT): Promise<boolean> {
  const rateLimiter = getRateLimiter();
  return await rateLimiter.isAllowed(keyId, maxPerMinute);
}

export type ApiKeyAuthResult = { ok: true; key: ApiKey } | { ok: false; status: number; error: string };

export async function authenticateApiKey(authorizationHeader?: string, opts?: { rateLimit?: number }): Promise<ApiKeyAuthResult> {
  if (!authorizationHeader) return { ok: false, status: 401, error: 'Missing Authorization' };
  const [scheme, token] = authorizationHeader.split(' ');
  if (!token || scheme !== 'ApiKey') return { ok: false, status: 401, error: 'Invalid Authorization header' };
  const key = await verifyApiKey(token);
  if (!key) return { ok: false, status: 401, error: 'Invalid API key' };
  const allowed = await checkRateLimit(key.id, opts?.rateLimit ?? DEFAULT_RATE_LIMIT);
  if (!allowed) return { ok: false, status: 429, error: 'Rate limit exceeded' };
  return { ok: true, key };
}

// Class API for routes
export class ApiKeyService {
  private sb: SupabaseClient;
  constructor(url: string, key: string) {
    this.sb = createClient(url, key);
  }
  async generateApiKey(ecoId: string, name: string, scopes: string[] = [], testMode = false) {
    if (!ecoId || !name) throw new Error('ecoId and name are required');
    const id = EcoIDGenerator.generate('api');
    const secretPart = generateBase62String(22);
    const plainKey = `${id}.${secretPart}`;
    const keyHash = sha256Hex(plainKey);
    const { error } = await this.sb.from('eco_api_keys').insert({
      id,
      eco_id: ecoId,
      key_hash: keyHash,
      name,
      scopes,
      status: 'active',
      test_mode: testMode,
    });
    if (error) throw error;
    return { key_id: id, key: plainKey, name, scopes, test_mode: testMode };
  }
  async listKeys(ecoId: string): Promise<ApiKey[]> {
    const { data, error } = await this.sb
      .from('eco_api_keys')
      .select('id, eco_id, key_hash, name, scopes, status, test_mode, last_used_at, created_at')
      .eq('eco_id', ecoId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as unknown as ApiKey[];
  }
  async revokeApiKey(keyId: string): Promise<boolean> {
    const { error } = await this.sb.from('eco_api_keys').update({ status: 'revoked' }).eq('id', keyId);
    if (error) throw error;
    return true;
  }
  async verifyApiKey(plainKey: string): Promise<ApiKey | null> {
    const hash = sha256Hex(plainKey);
    const { data, error } = await this.sb
      .from('eco_api_keys')
      .select('id, eco_id, key_hash, name, scopes, status, test_mode, last_used_at, created_at')
      .eq('key_hash', hash)
      .single();
    if (error || !data) return null;
    if (data.status !== 'active') return null;
    await this.sb.from('eco_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
    return data as unknown as ApiKey;
  }
}

/**
 * Rotates an API key by generating a new secret for the same key_id
 * @param keyId The ID of the key to rotate
 * @param requestingEcoId The EcoID of the user requesting the rotation (for authorization check)
 * @returns Success result with new key details or error result
 */
export async function rotateApiKey(keyId: string, requestingEcoId: string): Promise<{ success: boolean; key_id?: string; new_key?: string; error?: string; status?: number }> {
  try {
    const sb = getSupabase();
    
    // First, verify that the key exists and belongs to the requesting user
    const { data: existingKey, error: lookupError } = await sb
      .from('eco_api_keys')
      .select('id, eco_id, name, scopes, status, test_mode')
      .eq('id', keyId)
      .eq('eco_id', requestingEcoId)
      .single();
    
    if (lookupError || !existingKey) {
      return { 
        success: false, 
        error: 'API key not found or does not belong to user', 
        status: 404 
      };
    }
    
    if (existingKey.status !== 'active') {
      return { 
        success: false, 
        error: 'Cannot rotate inactive key', 
        status: 400 
      };
    }
    
    // Generate new secret part
    const newSecretPart = generateBase62String(22);
    const newPlainKey = `${keyId}.${newSecretPart}`;
    const newKeyHash = sha256Hex(newPlainKey);
    
    // Update the key hash in the database (effectively revoking the old secret)
    const { error: updateError } = await sb
      .from('eco_api_keys')
      .update({ 
        key_hash: newKeyHash,
        last_used_at: null // Reset last used since it's a new key
      })
      .eq('id', keyId);
    
    if (updateError) {
      console.error('Error updating key hash:', updateError);
      return { 
        success: false, 
        error: 'Failed to update key', 
        status: 500 
      };
    }
    
    // Return the new key (only the new secret part needs to be returned since key_id stays the same)
    return { 
      success: true, 
      key_id: keyId, 
      new_key: newPlainKey 
    };
  } catch (error) {
    console.error('Error rotating API key:', error);
    return { 
      success: false, 
      error: 'Internal error during key rotation', 
      status: 500 
    };
  }
}