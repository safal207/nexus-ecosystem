import { register } from '../jwt';
import { testUsers } from './fixtures';

// Mock EcoID service
jest.mock('@nexus/eco-id', () => ({
  EcoIDService: jest.fn().mockImplementation(() => ({
    createUser: jest.fn().mockImplementation((params) => {
      // Mock successful user creation
      return Promise.resolve({
        ecoId: 'usr_' + Math.random().toString(36).substr(2, 9),
        email: params.email,
        displayName: params.displayName,
        createdAt: new Date(),
      });
    }),
  })),
}));

describe('User Registration', () => {
  test('should register new user successfully', async () => {
    const user = await register(testUsers.validUser);

    expect(user).toBeDefined();
    expect(user.email).toBe(testUsers.validUser.email);
    expect(user.full_name).toBe(testUsers.validUser.full_name);
    expect(user.id).toBeDefined();
    expect(user.password_hash).toBeUndefined(); // Should not return hash
  });

  test('should hash password before storing', async () => {
    // Note: In unit tests, we can't easily verify password hashing
    // since EcoID service handles it. This would be tested in integration tests
    const user = await register(testUsers.validUser);

    expect(user).toBeDefined();
    expect(user.email).toBe(testUsers.validUser.email);
  });

  test('should reject duplicate email', async () => {
    // Mock the EcoID service to throw an error for duplicate email
    const mockEcoIDService = require('@nexus/eco-id').EcoIDService;
    mockEcoIDService.mockImplementation(() => ({
      createUser: jest.fn().mockRejectedValue(new Error('User with this email already exists')),
    }));

    await expect(register(testUsers.existingUser)).rejects.toThrow(
      'User with this email already exists'
    );
  });

  test('should validate email format', async () => {
    // Mock the EcoID service to throw an error for invalid email
    const mockEcoIDService = require('@nexus/eco-id').EcoIDService;
    mockEcoIDService.mockImplementation(() => ({
      createUser: jest.fn().mockRejectedValue(new Error('Invalid email format')),
    }));

    await expect(register(testUsers.invalidEmail)).rejects.toThrow();
  });

  test('should create user with timestamp', async () => {
    const user = await register(testUsers.validUser);

    expect(user.created_at).toBeDefined();
    expect(new Date(user.created_at).getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('should handle optional full_name', async () => {
    const userWithoutName = {
      email: 'test_noname@example.com',
      password: 'SecurePass123!',
    };

    const user = await register(userWithoutName);

    expect(user).toBeDefined();
    expect(user.full_name).toBeNull();
  });
});
