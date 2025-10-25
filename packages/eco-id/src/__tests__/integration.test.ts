import { EcoIDGenerator } from '../generator';
import { EcoIDService } from '../service';
import { testEcoIds, mockUserData } from './fixtures';

// Mock Supabase client for integration tests
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

describe('EcoID Integration Tests', () => {
  let service: EcoIDService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EcoIDService('test-url', 'test-key');
  });

  describe('Complete User Lifecycle', () => {
    test('should create user and verify complete identity', async () => {
      // Mock database responses for user creation
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: null, error: null }) // No existing email
        .mockResolvedValueOnce({ data: null, error: null }) // Identity insert success
        .mockResolvedValueOnce({ data: {
          eco_id: testEcoIds.validUser,
          entity_type: 'usr',
          display_name: mockUserData.displayName,
          verified: false,
          status: 'active',
          created_at: '2024-01-01T00:00:00Z'
        }, error: null }); // Get identity success

      const createdUser = await service.createUser({
        type: 'usr',
        email: mockUserData.email,
        password: mockUserData.password,
        displayName: mockUserData.displayName,
      });

      expect(createdUser.ecoId).toBe(testEcoIds.validUser);
      expect(createdUser.email).toBe(mockUserData.email);
      expect(createdUser.displayName).toBe(mockUserData.displayName);
      expect(createdUser.status).toBe('active');
      expect(createdUser.verified).toBe(false);

      // Verify EcoID format
      expect(EcoIDGenerator.isValid(createdUser.ecoId)).toBe(true);
      expect(EcoIDGenerator.isType(createdUser.ecoId, 'usr')).toBe(true);
    });

    test('should authenticate user after creation', async () => {
      // Mock credential verification
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          eco_id: testEcoIds.validUser,
          password_hash: '$2b$10$mockedhashedpassword'
        },
        error: null
      });

      const ecoId = await service.verifyCredentials(mockUserData.email, mockUserData.password);

      expect(ecoId).toBe(testEcoIds.validUser);
    });

    test('should retrieve full identity after authentication', async () => {
      // Mock identity retrieval
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          eco_id: testEcoIds.validUser,
          entity_type: 'usr',
          display_name: mockUserData.displayName,
          email: mockUserData.email,
          verified: false,
          status: 'active',
          created_at: '2024-01-01T00:00:00Z'
        },
        error: null
      });

      const identity = await service.getIdentity(testEcoIds.validUser);

      expect(identity.ecoId).toBe(testEcoIds.validUser);
      expect(identity.email).toBe(mockUserData.email);
      expect(identity.displayName).toBe(mockUserData.displayName);
      expect(identity.entityType).toBe('usr');
      expect(identity.status).toBe('active');
      expect(identity.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('Project Access Management', () => {
    test('should grant and verify project access', async () => {
      const userId = testEcoIds.validUser;
      const projectName = 'test-project';

      // Mock grant access
      mockSupabaseClient.upsert.mockResolvedValueOnce({ error: null });

      // Grant access
      await service.grantProjectAccess(userId, projectName, 'editor');

      // Mock verify access
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { role: 'editor' },
        error: null
      });

      // Verify access
      const hasAccess = await service.hasProjectAccess(userId, projectName);
      expect(hasAccess).toBe(true);
    });

    test('should list user projects with correct roles', async () => {
      const userId = testEcoIds.validUser;

      // Mock project access data
      mockSupabaseClient.select.mockResolvedValueOnce([
        { project_name: 'project-a', role: 'admin' },
        { project_name: 'project-b', role: 'member' },
        { project_name: 'project-c', role: 'read_only' },
      ]);

      const projects = await service.getUserProjects(userId);

      expect(projects).toHaveLength(3);
      expect(projects).toContainEqual({ project: 'project-a', role: 'admin' });
      expect(projects).toContainEqual({ project: 'project-b', role: 'member' });
      expect(projects).toContainEqual({ project: 'project-c', role: 'read_only' });
    });
  });

  describe('Cross-Component Integration', () => {
    test('should generate EcoID and use it across all services', async () => {
      // Generate a new EcoID
      const newEcoId = EcoIDGenerator.generate('usr');
      expect(EcoIDGenerator.isValid(newEcoId)).toBe(true);

      // Mock user creation with the generated EcoID
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: null, error: null }) // No existing email
        .mockResolvedValueOnce({ data: null, error: null }) // Identity insert
        .mockResolvedValueOnce({ data: {
          eco_id: newEcoId,
          entity_type: 'usr',
          display_name: 'Generated User',
          verified: false,
          status: 'active',
          created_at: '2024-01-01T00:00:00Z'
        }, error: null });

      // Create user with generated EcoID
      const user = await service.createUser({
        type: 'usr',
        email: 'generated@example.com',
        password: 'SecurePass123!',
        displayName: 'Generated User',
      });

      expect(user.ecoId).toBe(newEcoId);

      // Mock project access for the generated user
      mockSupabaseClient.upsert.mockResolvedValueOnce({ error: null });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { role: 'admin' },
        error: null
      });

      // Grant project access
      await service.grantProjectAccess(newEcoId, 'generated-project', 'admin');

      // Verify access
      const hasAccess = await service.hasProjectAccess(newEcoId, 'generated-project');
      expect(hasAccess).toBe(true);
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle database errors consistently', async () => {
      // Test identity retrieval error
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed' }
      });

      await expect(service.getIdentity('invalid-id')).rejects.toThrow('Identity not found');

      // Test project access error
      mockSupabaseClient.upsert.mockResolvedValueOnce({
        error: { message: 'Permission denied' }
      });

      await expect(service.grantProjectAccess('user-id', 'project', 'member')).rejects.toThrow();
    });

    test('should handle malformed data gracefully', async () => {
      // Test with invalid EcoID format
      const invalidId = 'invalid-format';

      expect(EcoIDGenerator.isValid(invalidId)).toBe(false);

      // Service should handle invalid EcoID
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' }
      });

      await expect(service.getIdentity(invalidId)).rejects.toThrow('Identity not found');
    });
  });

  describe('Performance Integration', () => {
    test('should handle multiple concurrent operations', async () => {
      const operations = [];

      // Create multiple concurrent identity retrievals
      for (let i = 0; i < 10; i++) {
        operations.push(
          service.getIdentity(testEcoIds.validUser).catch(() => null)
        );
      }

      // Mock all calls
      mockSupabaseClient.single.mockResolvedValue({
        data: {
          eco_id: testEcoIds.validUser,
          entity_type: 'usr',
          display_name: 'Test User',
          verified: false,
          status: 'active',
          created_at: '2024-01-01T00:00:00Z'
        },
        error: null
      });

      const start = Date.now();
      const results = await Promise.all(operations);
      const duration = Date.now() - start;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(100);
      expect(results.length).toBe(10);
    });

    test('should handle bulk EcoID generation efficiently', () => {
      const start = Date.now();
      const ids = [];

      for (let i = 0; i < 1000; i++) {
        const ecoId = EcoIDGenerator.generate('usr');
        expect(EcoIDGenerator.isValid(ecoId)).toBe(true);
        ids.push(ecoId);
      }

      const duration = Date.now() - start;

      // Should generate 1000 IDs quickly
      expect(duration).toBeLessThan(500);
      expect(ids.length).toBe(1000);

      // All should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(1000);
    });
  });
});
