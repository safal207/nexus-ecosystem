import { EcoIDService } from '../service';
import {
  testEcoIds,
  mockUserData,
  mockIdentity,
  mockIdentityRecord,
  mockCredentials,
  mockProjectAccessRecords,
  mockActivityLog
} from './fixtures';

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
};

// Mock the Supabase module
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

describe('EcoID Service - User Management', () => {
  let service: EcoIDService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EcoIDService('test-url', 'test-key');
  });

  describe('createUser', () => {
    test('should create user with valid data', async () => {
      // Mock no existing user
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: null });

      // Mock successful inserts
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: null });
      mockSupabaseClient.single.mockResolvedValueOnce({ data: mockIdentityRecord, error: null });

      const result = await service.createUser({
        type: 'usr',
        email: mockUserData.email,
        password: mockUserData.password,
        displayName: mockUserData.displayName,
      });

      expect(result).toEqual(mockIdentity);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('eco_credentials');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('eco_identities');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('eco_credentials');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('eco_profiles');
    });

    test('should throw error if email already exists', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { eco_id: 'existing' },
        error: null
      });

      await expect(service.createUser({
        type: 'usr',
        email: mockUserData.email,
        password: mockUserData.password,
      })).rejects.toThrow('Email already registered');
    });

    test('should throw error if email or password missing', async () => {
      await expect(service.createUser({
        type: 'usr',
        email: '',
        password: mockUserData.password,
      })).rejects.toThrow('Email and password required');
    });

    test('should handle display name fallback', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: null });
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: null });
      mockSupabaseClient.single.mockResolvedValueOnce({ data: mockIdentityRecord, error: null });

      const result = await service.createUser({
        type: 'usr',
        email: 'john@example.com',
        password: 'password123',
        // No displayName provided
      });

      expect(result.displayName).toBe('john'); // Should use email prefix
    });
  });

  describe('getIdentity', () => {
    test('should return identity for valid EcoID', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockIdentityRecord,
        error: null
      });

      const result = await service.getIdentity(testEcoIds.validUser);

      expect(result).toEqual(mockIdentity);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('eco_identities');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('eco_id', testEcoIds.validUser);
    });

    test('should throw error for non-existent EcoID', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' }
      });

      await expect(service.getIdentity('invalid-id')).rejects.toThrow('Identity not found');
    });
  });

  describe('getIdentityByEmail', () => {
    test('should return identity for valid email', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { eco_id: testEcoIds.validUser },
        error: null
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockIdentityRecord,
        error: null
      });

      const result = await service.getIdentityByEmail(mockUserData.email);

      expect(result).toEqual(mockIdentity);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('eco_credentials');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('email', mockUserData.email);
    });

    test('should throw error for non-existent email', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' }
      });

      await expect(service.getIdentityByEmail('nonexistent@example.com')).rejects.toThrow('User not found');
    });
  });

  describe('verifyCredentials', () => {
    test('should return ecoId for valid credentials', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockCredentials,
        error: null
      });

      const result = await service.verifyCredentials(mockUserData.email, mockUserData.password);

      expect(result).toBe(testEcoIds.validUser);
    });

    test('should return null for invalid email', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' }
      });

      const result = await service.verifyCredentials('wrong@example.com', mockUserData.password);

      expect(result).toBeNull();
    });

    test('should return null for invalid password', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockCredentials,
        error: null
      });

      // Mock bcrypt.compare to return false
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValueOnce(false);

      const result = await service.verifyCredentials(mockUserData.email, 'wrongpassword');

      expect(result).toBeNull();
    });
  });

  describe('updateLastSeen', () => {
    test('should update last seen timestamp', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: null });

      await service.updateLastSeen(testEcoIds.validUser);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('eco_identities');
      expect(mockSupabaseClient.update).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('eco_id', testEcoIds.validUser);
    });
  });
});

describe('EcoID Service - Project Access Control', () => {
  let service: EcoIDService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EcoIDService('test-url', 'test-key');
  });

  describe('grantProjectAccess', () => {
    test('should grant access to project', async () => {
      mockSupabaseClient.upsert.mockResolvedValueOnce({ error: null });

      await service.grantProjectAccess(testEcoIds.validUser, 'test-project', 'member');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('eco_project_access');
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith({
        eco_id: testEcoIds.validUser,
        project_name: 'test-project',
        role: 'member',
      });
    });

    test('should throw error on database failure', async () => {
      mockSupabaseClient.upsert.mockResolvedValueOnce({
        error: { message: 'Database error' }
      });

      await expect(service.grantProjectAccess(testEcoIds.validUser, 'test-project', 'member'))
        .rejects.toThrow();
    });
  });

  describe('hasProjectAccess', () => {
    test('should return true when user has access', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { role: 'member' },
        error: null
      });

      const result = await service.hasProjectAccess(testEcoIds.validUser, 'test-project');

      expect(result).toBe(true);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('eco_project_access');
    });

    test('should return false when user has no access', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' }
      });

      const result = await service.hasProjectAccess(testEcoIds.validUser, 'test-project');

      expect(result).toBe(false);
    });
  });

  describe('getUserProjects', () => {
    test('should return list of user projects', async () => {
      mockSupabaseClient.select.mockResolvedValueOnce(mockProjectAccessRecords);

      const result = await service.getUserProjects(testEcoIds.validUser);

      expect(result).toEqual([
        { project: 'nexus-hub', role: 'member' },
        { project: 'test-project', role: 'admin' },
      ]);
    });

    test('should return empty array if no projects', async () => {
      mockSupabaseClient.select.mockResolvedValueOnce([]);

      const result = await service.getUserProjects(testEcoIds.validUser);

      expect(result).toEqual([]);
    });
  });
});

describe('EcoID Service - Activity Logging', () => {
  let service: EcoIDService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EcoIDService('test-url', 'test-key');
  });

  describe('logActivity', () => {
    test('should log activity successfully', async () => {
      mockSupabaseClient.insert.mockResolvedValueOnce({ error: null });

      await service.logActivity(testEcoIds.validUser, 'login', {
        projectName: 'nexus-hub',
        resourceType: 'auth',
        resourceId: testEcoIds.validSession,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0...',
        status: 'success',
      });

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('eco_activity_log');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        eco_id: testEcoIds.validUser,
        action: 'login',
        project_name: 'nexus-hub',
        resource_type: 'auth',
        resource_id: testEcoIds.validSession,
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0...',
        status: 'success',
        error_message: undefined,
      });
    });

    test('should log error activities', async () => {
      mockSupabaseClient.insert.mockResolvedValueOnce({ error: null });

      await service.logActivity(testEcoIds.validUser, 'api_call_failed', {
        projectName: 'test-project',
        resourceType: 'api_key',
        status: 'failure',
        errorMessage: 'Invalid API key',
      });

      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        eco_id: testEcoIds.validUser,
        action: 'api_call_failed',
        project_name: 'test-project',
        resource_type: 'api_key',
        resource_id: undefined,
        ip_address: undefined,
        user_agent: undefined,
        status: 'failure',
        error_message: 'Invalid API key',
      });
    });
  });
});
