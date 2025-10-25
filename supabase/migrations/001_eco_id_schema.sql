-- Supabase migration for EcoID integration
-- This script creates all the necessary tables for the EcoID system

-- Create the main EcoID identities table
CREATE TABLE eco_identities (
  eco_id TEXT PRIMARY KEY CHECK (eco_id ~ '^eco_[a-z]{3}_[0-9a-zA-Z]{22}$'),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('usr', 'org', 'api', 'ses', 'txn', 'prj')),
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  timezone TEXT DEFAULT 'UTC',
  locale TEXT DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  security_level TEXT DEFAULT 'standard' CHECK (security_level IN ('standard', 'high', 'enterprise')),
  mfa_enabled BOOLEAN DEFAULT FALSE,
  gdpr_consent BOOLEAN DEFAULT FALSE,
  gdpr_consent_at TIMESTAMPTZ,
  data_retention_days INTEGER DEFAULT 365
);

CREATE INDEX idx_eco_identities_entity_type ON eco_identities(entity_type);
CREATE INDEX idx_eco_identities_status ON eco_identities(status);
CREATE INDEX idx_eco_identities_created_at ON eco_identities(created_at DESC);

-- Create the credentials table
CREATE TABLE eco_credentials (
  eco_id TEXT PRIMARY KEY REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_changed_at TIMESTAMPTZ DEFAULT NOW(),
  password_reset_token TEXT,
  password_reset_expires TIMESTAMPTZ,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_login_ip INET,
  mfa_secret TEXT,
  mfa_backup_codes TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eco_credentials_email ON eco_credentials(email);

-- Create project access table
CREATE TABLE eco_project_access (
  eco_id TEXT REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'read_only', 'api_only')),
  permissions JSONB DEFAULT '{}',
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by TEXT REFERENCES eco_identities(eco_id),
  expires_at TIMESTAMPTZ,

  PRIMARY KEY (eco_id, project_name)
);

CREATE INDEX idx_eco_project_access_eco_id ON eco_project_access(eco_id);
CREATE INDEX idx_eco_project_access_project ON eco_project_access(project_name);

-- Create profiles table
CREATE TABLE eco_profiles (
  eco_id TEXT PRIMARY KEY REFERENCES eco_identities(eco_id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  company TEXT,
  job_title TEXT,
  linkedin_url TEXT,
  twitter_handle TEXT,
  github_username TEXT,
  email_notifications BOOLEAN DEFAULT TRUE,
  marketing_emails BOOLEAN DEFAULT FALSE,
  profile_visibility TEXT DEFAULT 'private' CHECK (profile_visibility IN ('public', 'connections', 'private')),
  data_sharing_consent JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create activity log table for audit trail
CREATE TABLE eco_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  eco_id TEXT REFERENCES eco_identities(eco_id) ON DELETE SET NULL,

  -- Action details
  action TEXT NOT NULL, -- 'login', 'logout', 'project.access', 'data.export', etc.
  project_name TEXT,
  resource_type TEXT, -- 'lead', 'portfolio', 'api_key'
  resource_id TEXT,

  -- Context
  ip_address INET,
  user_agent TEXT,
  location JSONB, -- {country, city}

  -- Result
  status TEXT CHECK (status IN ('success', 'failure', 'pending')),
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eco_activity_log_eco_id ON eco_activity_log(eco_id, created_at DESC);
CREATE INDEX idx_eco_activity_log_action ON eco_activity_log(action);

-- Create sessions table for JWT tracking
CREATE TABLE eco_sessions (
  session_id TEXT PRIMARY KEY, -- eco_ses_xxxxx
  eco_id TEXT REFERENCES eco_identities(eco_id) ON DELETE CASCADE,

  -- JWT tokens
  access_token_hash TEXT NOT NULL, -- SHA256 of JWT
  refresh_token_hash TEXT NOT NULL,

  -- Session metadata
  device_type TEXT, -- 'web', 'mobile', 'api'
  device_name TEXT, -- 'Chrome on Windows', 'iPhone 15'
  ip_address INET,
  location JSONB,

  -- Expiration
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,

  -- Status
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eco_sessions_eco_id ON eco_sessions(eco_id);
CREATE INDEX idx_eco_sessions_expires ON eco_sessions(refresh_expires_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at for eco_identities
CREATE TRIGGER update_eco_identities_updated_at
BEFORE UPDATE ON eco_identities
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at for eco_profiles
CREATE TRIGGER update_eco_profiles_updated_at
BEFORE UPDATE ON eco_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Example permissions JSONB:
-- {
--   "leads.create": true,
--   "leads.read": true,
--   "leads.update": true,
--   "leads.delete": false,
--   "api.access": true,
--   "export.data": false
-- }

-- Example data_sharing_consent:
-- {
--   "nexus-sales": ["email", "name", "company"],
--   "dream-people": ["email", "name"],
--   "testing-hub": ["email", "name", "company", "linkedin"]
-- }