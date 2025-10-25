// nexus-ecosystem/packages/eco-id/src/service.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { EcoIDGenerator, EcoIDType } from './generator';
import bcrypt from 'bcryptjs';

export interface CreateEcoIDParams {
  type: EcoIDType;
  email?: string;
  password?: string;
  displayName?: string;
  metadata?: Record<string, any>;
}

export interface EcoIdentity {
  ecoId: string;
  entityType: EcoIDType;
  displayName: string | null;
  email?: string;
  verified: boolean;
  status: 'active' | 'suspended' | 'deleted';
  createdAt: Date;
}

export class EcoIDService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Create a new EcoID with credentials
   */
  async createUser(params: CreateEcoIDParams): Promise<EcoIdentity> {
    const { email, password, displayName } = params;

    if (!email || !password) {
      throw new Error('Email and password required for user creation');
    }

    // Check if email already exists
    const { data: existing } = await this.supabase
      .from('eco_credentials')
      .select('eco_id')
      .eq('email', email)
      .single();

    if (existing) {
      throw new Error('Email already registered');
    }

    // Generate EcoID
    const ecoId = EcoIDGenerator.generate('usr');

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create identity
    const { error: identityError } = await this.supabase
      .from('eco_identities')
      .insert({
        eco_id: ecoId,
        entity_type: 'usr',
        display_name: displayName || email.split('@')[0],
        status: 'active',
        verified: false,
      });

    if (identityError) throw identityError;

    // Create credentials
    const { error: credentialsError } = await this.supabase
      .from('eco_credentials')
      .insert({
        eco_id: ecoId,
        email,
        password_hash: passwordHash,
      });

    if (credentialsError) throw credentialsError;

    // Create profile
    await this.supabase.from('eco_profiles').insert({
      eco_id: ecoId,
    });

    // Grant default project access
    await this.grantProjectAccess(ecoId, 'nexus-hub', 'member');

    return this.getIdentity(ecoId);
  }

  /**
   * Get identity by EcoID
   */
  async getIdentity(ecoId: string): Promise<EcoIdentity> {
    const { data, error } = await this.supabase
      .from('eco_identities')
      .select('*')
      .eq('eco_id', ecoId)
      .single();

    if (error || !data) throw new Error('Identity not found');

    return {
      ecoId: data.eco_id,
      entityType: data.entity_type,
      displayName: data.display_name,
      verified: data.verified,
      status: data.status,
      createdAt: new Date(data.created_at),
    };
  }

  /**
   * Get identity by email
   */
  async getIdentityByEmail(email: string): Promise<EcoIdentity> {
    const { data, error } = await this.supabase
      .from('eco_credentials')
      .select('eco_id')
      .eq('email', email)
      .single();

    if (error || !data) throw new Error('User not found');

    return this.getIdentity(data.eco_id);
  }

  /**
   * Verify credentials
   */
  async verifyCredentials(email: string, password: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('eco_credentials')
      .select('eco_id, password_hash')
      .eq('email', email)
      .single();

    if (error || !data) return null;

    const valid = await bcrypt.compare(password, data.password_hash);
    return valid ? data.eco_id : null;
  }

  /**
   * Grant project access
   */
  async grantProjectAccess(
    ecoId: string,
    projectName: string,
    role: 'owner' | 'admin' | 'member' | 'read_only' | 'api_only'
  ): Promise<void> {
    const { error } = await this.supabase.from('eco_project_access').upsert({
      eco_id: ecoId,
      project_name: projectName,
      role,
    });

    if (error) throw error;
  }

  /**
   * Check project access
   */
  async hasProjectAccess(ecoId: string, projectName: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('eco_project_access')
      .select('role')
      .eq('eco_id', ecoId)
      .eq('project_name', projectName)
      .single();

    return !error && !!data;
  }

  /**
   * Get user's accessible projects
   */
  async getUserProjects(ecoId: string): Promise<Array<{ project: string; role: string }>> {
    const { data, error } = await this.supabase
      .from('eco_project_access')
      .select('project_name, role')
      .eq('eco_id', ecoId);

    if (error) throw error;

    return data.map((row) => ({
      project: row.project_name,
      role: row.role,
    }));
  }

  /**
   * Log activity (for audit trail)
   */
  async logActivity(
    ecoId: string,
    action: string,
    context: {
      projectName?: string;
      resourceType?: string;
      resourceId?: string;
      ipAddress?: string;
      userAgent?: string;
      status: 'success' | 'failure' | 'pending';
      errorMessage?: string;
    }
  ): Promise<void> {
    await this.supabase.from('eco_activity_log').insert({
      eco_id: ecoId,
      action,
      project_name: context.projectName,
      resource_type: context.resourceType,
      resource_id: context.resourceId,
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
      status: context.status,
      error_message: context.errorMessage,
    });
  }

  /**
   * Update last seen timestamp
   */
  async updateLastSeen(ecoId: string): Promise<void> {
    await this.supabase
      .from('eco_identities')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('eco_id', ecoId);
  }
}

// Usage example:
// const service = new EcoIDService(SUPABASE_URL, SUPABASE_KEY);
// const identity = await service.createUser({
//   type: 'usr',
//   email: 'john@example.com',
//   password: 'SecurePass123!',
//   displayName: 'John Smith',
// });