export const testUsers = {
  validUser: {
    email: 'test_valid@example.com',
    password: 'SecurePassword123!',
    full_name: 'Test Valid User',
  },

  weakPassword: {
    email: 'test_weak@example.com',
    password: '12345', // Too weak
    full_name: 'Weak Password User',
  },

  invalidEmail: {
    email: 'not-an-email',
    password: 'SecurePassword123!',
    full_name: 'Invalid Email User',
  },

  existingUser: {
    email: 'test_existing@example.com',
    password: 'ExistingPass123!',
    full_name: 'Existing User',
  },
};

export const mockJwtPayload = {
  ecoId: 'usr_123e4567-e89b-12d3-a456-426614174000',
  email: 'test@example.com',
  role: 'user',
};

export const mockTokens = {
  validAccessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  expiredAccessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  invalidToken: 'invalid.token.here',
};
