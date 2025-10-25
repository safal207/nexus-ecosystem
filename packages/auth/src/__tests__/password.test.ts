import { hashPassword, comparePassword } from '../jwt';

describe('Password Hashing', () => {
  const plainPassword = 'MySecurePassword123!';

  describe('hashPassword', () => {
    test('should hash password successfully', async () => {
      const hash = await hashPassword(plainPassword);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(plainPassword);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are long
    });

    test('should generate unique hashes for same password', async () => {
      const hash1 = await hashPassword(plainPassword);
      const hash2 = await hashPassword(plainPassword);

      expect(hash1).not.toBe(hash2); // Different salts
    });

    test('should use bcrypt (starts with $2b$)', async () => {
      const hash = await hashPassword(plainPassword);

      expect(hash).toMatch(/^\$2b\$/);
    });

    test('should use 10 rounds', async () => {
      const hash = await hashPassword(plainPassword);

      expect(hash).toMatch(/^\$2b\$10\$/); // 10 rounds
    });
  });

  describe('comparePassword', () => {
    test('should return true for correct password', async () => {
      const hash = await hashPassword(plainPassword);
      const result = await comparePassword(plainPassword, hash);

      expect(result).toBe(true);
    });

    test('should return false for incorrect password', async () => {
      const hash = await hashPassword(plainPassword);
      const result = await comparePassword('WrongPassword123!', hash);

      expect(result).toBe(false);
    });

    test('should be case-sensitive', async () => {
      const hash = await hashPassword('Password123!');
      const result = await comparePassword('password123!', hash);

      expect(result).toBe(false);
    });
  });
});
