import { EcoIdentity } from '../service';

export const testEcoIds = {
  validUser: 'eco_usr_a1b2c3d4e5f6g7h8i9j0k1',
  validProject: 'eco_prj_b2c3d4e5f6g7h8i9j0k1l2',
  validOrg: 'eco_org_c3d4e5f6g7h8i9j0k1l2m3',
  validApi: 'eco_api_d4e5f6g7h8i9j0k1l2m3n4',
  validSession: 'eco_ses_e5f6g7h8i9j0k1l2m3n4o5',
  validTransaction: 'eco_txn_f6g7h8i9j0k1l2m3n4o5p6',
};

export const invalidEcoIds = [
  'usr_123', // Too short, wrong format
  'usr_123e4567-e89b-12d3-a456-426614174000', // Wrong format
  'user_123e4567-e89b-12d3-a456-426614174000', // Wrong prefix
  'usr_gggggggg-hhhh-iiii-jjjj-kkkkkkkkkkkk', // Invalid chars
  'eco_usr_', // Incomplete
  'eco_xxx_a1b2c3d4e5f6g7h8i9j0k1', // Invalid type
  '', // Empty
];

export const mockUserData = {
  email: 'test@example.com',
  password: 'SecurePass123!',
  displayName: 'Test User',
};

export const mockIdentity: EcoIdentity = {
  ecoId: testEcoIds.validUser,
  entityType: 'usr',
  displayName: 'Test User',
  email: 'test@example.com',
  verified: false,
  status: 'active',
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

export const mockProjectAccess = [
  { project: 'nexus-hub', role: 'member' },
  { project: 'test-project', role: 'admin' },
  { project: 'demo-app', role: 'read_only' },
];

export const mockCredentials = {
  eco_id: testEcoIds.validUser,
  email: 'test@example.com',
  password_hash: '$2b$10$mockedhashedpassword',
};

export const mockIdentityRecord = {
  eco_id: testEcoIds.validUser,
  entity_type: 'usr',
  display_name: 'Test User',
  verified: false,
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  last_seen_at: null,
};

export const mockProjectAccessRecords = [
  {
    eco_id: testEcoIds.validUser,
    project_name: 'nexus-hub',
    role: 'member',
  },
  {
    eco_id: testEcoIds.validUser,
    project_name: 'test-project',
    role: 'admin',
  },
];

export const mockActivityLog = {
  eco_id: testEcoIds.validUser,
  action: 'login',
  project_name: 'nexus-hub',
  resource_type: 'auth',
  resource_id: testEcoIds.validSession,
  ip_address: '192.168.1.1',
  user_agent: 'Mozilla/5.0...',
  status: 'success',
  error_message: null,
};
