// nexus-ecosystem/packages/eco-id/src/generator.ts

import { randomBytes } from 'crypto';

const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export type EcoIDType = 'usr' | 'org' | 'api' | 'ses' | 'txn' | 'prj';

export class EcoIDGenerator {
  /**
   * Generate a new EcoID
   * @param type Entity type
   * @returns EcoID string (e.g., eco_usr_a1b2c3d4e5f6g7h8i9j0k1)
   */
  static generate(type: EcoIDType): string {
    const randomPart = this.generateRandomBase62(22);
    return `eco_${type}_${randomPart}`;
  }

  /**
   * Generate random Base62 string
   * @param length Number of characters
   * @returns Random Base62 string
   */
  private static generateRandomBase62(length: number): string {
    const bytes = randomBytes(length);
    let result = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = bytes[i] % BASE62_CHARS.length;
      result += BASE62_CHARS[randomIndex];
    }

    return result;
  }

  /**
   * Validate EcoID format
   * @param ecoId EcoID string to validate
   * @returns True if valid
   */
  static isValid(ecoId: string): boolean {
    const regex = /^eco_[a-z]{3}_[0-9a-zA-Z]{22}$/;
    return regex.test(ecoId);
  }

  /**
   * Extract type from EcoID
   * @param ecoId EcoID string
   * @returns Entity type or null if invalid
   */
  static getType(ecoId: string): EcoIDType | null {
    if (!this.isValid(ecoId)) return null;
    const type = ecoId.split('_')[1];
    const validTypes: EcoIDType[] = ['usr', 'prj', 'org', 'api', 'ses', 'txn'];
    return validTypes.includes(type as EcoIDType) ? (type as EcoIDType) : null;
  }

  /**
   * Check if EcoID is of specific type
   * @param ecoId EcoID string
   * @param type Expected type
   * @returns True if matches
   */
  static isType(ecoId: string, type: EcoIDType): boolean {
    return this.getType(ecoId) === type;
  }
}

// Usage example:
// const userId = EcoIDGenerator.generate('usr'); // eco_usr_a1b2c3d4e5f6g7h8i9j0k1
// const isValid = EcoIDGenerator.isValid(userId); // true
// const type = EcoIDGenerator.getType(userId); // 'usr'