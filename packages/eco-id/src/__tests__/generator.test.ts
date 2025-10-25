import { EcoIDGenerator } from '../generator';
import { testEcoIds, invalidEcoIds } from './fixtures';

describe('EcoID Format Validation', () => {
  describe('generate', () => {
    test('should generate valid EcoID format for user', () => {
      const ecoId = EcoIDGenerator.generate('usr');
      expect(EcoIDGenerator.isValid(ecoId)).toBe(true);
      expect(ecoId).toMatch(/^eco_usr_[0-9a-zA-Z]{22}$/);
      expect(ecoId.length).toBe(31); // eco_ + usr_ + 22 chars + 2 underscores = 31
    });

    test('should generate valid EcoID format for all supported types', () => {
      const types: Array<'usr' | 'prj' | 'org' | 'api' | 'ses' | 'txn'> = ['usr', 'prj', 'org', 'api', 'ses', 'txn'];

      types.forEach(type => {
        const ecoId = EcoIDGenerator.generate(type);
        expect(EcoIDGenerator.isValid(ecoId)).toBe(true);
        expect(ecoId).toMatch(new RegExp(`^eco_${type}_[0-9a-zA-Z]{22}$`));
      });
    });

    test('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        ids.add(EcoIDGenerator.generate('usr'));
      }
      expect(ids.size).toBe(1000); // All unique
    });

    test('should use Base62 characters only', () => {
      const ecoId = EcoIDGenerator.generate('usr');
      const randomPart = ecoId.split('_')[2]; // Get the random part

      // Base62 includes: 0-9, a-z, A-Z (no special chars)
      const base62Regex = /^[0-9a-zA-Z]+$/;
      expect(randomPart).toMatch(base62Regex);
    });
  });

  describe('isValid', () => {
    test('should validate correct EcoID format', () => {
      Object.values(testEcoIds).forEach(ecoId => {
        expect(EcoIDGenerator.isValid(ecoId)).toBe(true);
      });
    });

    test('should reject invalid formats', () => {
      invalidEcoIds.forEach(invalidId => {
        expect(EcoIDGenerator.isValid(invalidId)).toBe(false);
      });
    });

    test('should reject malformed IDs', () => {
      const malformed = [
        'eco_usr_', // Missing random part
        'eco_usr_123', // Too short random part
        'eco_usr_123456789012345678901234567890', // Too long random part
        'eco_xxx_a1b2c3d4e5f6g7h8i9j0k1', // Invalid type
        'usr_a1b2c3d4e5f6g7h8i9j0k1', // Missing eco_ prefix
        'eco_a1b2c3d4e5f6g7h8i9j0k1', // Missing type
        'eco_usr_a1b2c3d4e5f6g7h8i9j0k1_extra', // Extra parts
      ];

      malformed.forEach(id => {
        expect(EcoIDGenerator.isValid(id)).toBe(false);
      });
    });

    test('should handle edge cases', () => {
      expect(EcoIDGenerator.isValid('')).toBe(false);
      expect(EcoIDGenerator.isValid(null as any)).toBe(false);
      expect(EcoIDGenerator.isValid(undefined as any)).toBe(false);
    });
  });

  describe('getType', () => {
    test('should extract correct type from valid EcoID', () => {
      expect(EcoIDGenerator.getType(testEcoIds.validUser)).toBe('usr');
      expect(EcoIDGenerator.getType(testEcoIds.validProject)).toBe('prj');
      expect(EcoIDGenerator.getType(testEcoIds.validOrg)).toBe('org');
      expect(EcoIDGenerator.getType(testEcoIds.validApi)).toBe('api');
      expect(EcoIDGenerator.getType(testEcoIds.validSession)).toBe('ses');
      expect(EcoIDGenerator.getType(testEcoIds.validTransaction)).toBe('txn');
    });

    test('should return null for invalid EcoID', () => {
      invalidEcoIds.forEach(invalidId => {
        expect(EcoIDGenerator.getType(invalidId)).toBe(null);
      });
    });
  });

  describe('isType', () => {
    test('should correctly identify EcoID types', () => {
      expect(EcoIDGenerator.isType(testEcoIds.validUser, 'usr')).toBe(true);
      expect(EcoIDGenerator.isType(testEcoIds.validProject, 'prj')).toBe(true);
      expect(EcoIDGenerator.isType(testEcoIds.validOrg, 'org')).toBe(true);
      expect(EcoIDGenerator.isType(testEcoIds.validApi, 'api')).toBe(true);
      expect(EcoIDGenerator.isType(testEcoIds.validSession, 'ses')).toBe(true);
      expect(EcoIDGenerator.isType(testEcoIds.validTransaction, 'txn')).toBe(true);
    });

    test('should return false for wrong type', () => {
      expect(EcoIDGenerator.isType(testEcoIds.validUser, 'prj')).toBe(false);
      expect(EcoIDGenerator.isType(testEcoIds.validProject, 'usr')).toBe(false);
    });

    test('should return false for invalid EcoID', () => {
      expect(EcoIDGenerator.isType('invalid-id', 'usr')).toBe(false);
    });
  });
});

describe('Collision Prevention', () => {
  test('should generate unique IDs at scale', () => {
    const ids = new Set();
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      ids.add(EcoIDGenerator.generate('usr'));
    }

    expect(ids.size).toBe(iterations);
  });

  test('should handle high concurrency simulation', async () => {
    const promises = [];
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      promises.push(Promise.resolve(EcoIDGenerator.generate('usr')));
    }

    const results = await Promise.all(promises);
    const uniqueResults = new Set(results);
    expect(uniqueResults.size).toBe(iterations);
  });

  test('should maintain uniqueness across different types', () => {
    const types: Array<'usr' | 'prj' | 'org'> = ['usr', 'prj', 'org'];
    const ids = new Set();

    types.forEach(type => {
      for (let i = 0; i < 100; i++) {
        ids.add(EcoIDGenerator.generate(type));
      }
    });

    expect(ids.size).toBe(300); // All unique across types
  });
});

describe('Performance Benchmarks', () => {
  test('should generate EcoID within 1ms', () => {
    const start = Date.now();
    const ecoId = EcoIDGenerator.generate('usr');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1);
    expect(EcoIDGenerator.isValid(ecoId)).toBe(true);
  });

  test('should validate EcoID within 0.1ms', () => {
    const ecoId = EcoIDGenerator.generate('usr');

    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      EcoIDGenerator.isValid(ecoId);
    }
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(10); // 1000 validations in <10ms
  });

  test('should handle bulk operations efficiently', () => {
    const start = Date.now();
    const ids = [];

    for (let i = 0; i < 10000; i++) {
      ids.push(EcoIDGenerator.generate('usr'));
    }

    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000); // 10k generations in <1s
    expect(ids.length).toBe(10000);

    // Verify all are valid and unique
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(10000);
    ids.forEach(id => expect(EcoIDGenerator.isValid(id)).toBe(true));
  });
});
