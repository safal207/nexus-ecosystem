import { register, login } from '../jwt';
import { testUsers } from './fixtures';

// Mock EcoID service
jest.mock('@nexus/eco-id', () => ({
  EcoIDService: jest.fn().mockImplementation(() => ({
    createUser: jest.fn().mockImplementation((params) => {
      return Promise.resolve({
        ecoId: 'usr_' + Math.random().toString(36).substr(2, 9),
        email: params.email,
        displayName: params.displayName,
        createdAt: new Date(),
      });
    }),
    verifyCredentials: jest.fn().mockImplementation((email: string, password: string) => {
      if (email === testUsers.validUser.email && password === testUsers.validUser.password) {
        return Promise.resolve('usr_123e4567-e89b-12d3-a456-426614174000');
      }
      return Promise.resolve(null);
    }),
    getIdentity: jest.fn().mockImplementation((ecoId: string) => {
      if (ecoId === 'usr_123e4567-e89b-12d3-a456-426614174000') {
        return Promise.resolve({
          ecoId,
          email: testUsers.validUser.email,
          displayName: testUsers.validUser.full_name,
          createdAt: new Date(),
        });
      }
      return Promise.resolve(null);
    }),
    updateLastSeen: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('User Login', () => {
  beforeEach(async () => {
    // Register a user for login tests
    await register(testUsers.validUser);
  });

  test('should login with correct credentials', async () => {
    const result = await login({
      email: testUsers.validUser.email,
      password: testUsers.validUser.password,
    });

    expect(result).toBeDefined();
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.email).toBe(testUsers.validUser.email);
  });

  test('should return access and refresh tokens', async () => {
    const result = await login({
      email: testUsers.validUser.email,
      password: testUsers.validUser.password,
    });

    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.refreshToken.split('.')).toHaveLength(3);
  });

  test('should reject incorrect password', async () => {
    await expect(
      login({
        email: testUsers.validUser.email,
        password: 'WrongPassword123!',
      })
    ).rejects.toThrow('Invalid credentials');
  });

  test('should reject non-existent user', async () => {
    await expect(
      login({
        email: 'nonexistent@example.com',
        password: 'AnyPassword123!',
      })
    ).rejects.toThrow('Invalid credentials');
  });

  test('should not leak user existence in error message', async () => {
    // Security: Don't tell attackers if email exists or password is wrong

    const error1 = await login({
      email: 'nonexistent@example.com',
      password: 'Pass123!',
    }).catch(e => e.message);

    const error2 = await login({
      email: testUsers.validUser.email,
      password: 'WrongPass123!',
    }).catch(e => e.message);

    // Both should say "Invalid credentials" (generic message)
    expect(error1).toBe(error2);
    expect(error1).toBe('Invalid credentials');
  });

  test('should generate different tokens on each login', async () => {
    const result1 = await login({
      email: testUsers.validUser.email,
      password: testUsers.validUser.password,
    });

    const result2 = await login({
      email: testUsers.validUser.email,
      password: testUsers.validUser.password,
    });

    expect(result1.accessToken).not.toBe(result2.accessToken);
    expect(result1.refreshToken).not.toBe(result2.refreshToken);
  });
});
