// Test file to verify EcoID integration
import { EcoIDGenerator } from '../packages/eco-id/src/generator';

console.log('Testing EcoID Generator...');

// Test 1: Generate a user EcoID
const userId = EcoIDGenerator.generate('usr');
console.log('Generated user EcoID:', userId);

// Test 2: Validate the generated EcoID
const isValid = EcoIDGenerator.isValid(userId);
console.log('Is valid:', isValid);

// Test 3: Extract type from EcoID
const type = EcoIDGenerator.getType(userId);
console.log('Extracted type:', type);

// Test 4: Check if type matches
const isCorrectType = EcoIDGenerator.isType(userId, 'usr');
console.log('Is correct type (usr):', isCorrectType);

// Test 5: Generate other types
const apiKeyId = EcoIDGenerator.generate('api');
console.log('Generated API key EcoID:', apiKeyId);
console.log('API key is valid:', EcoIDGenerator.isValid(apiKeyId));
console.log('API key type:', EcoIDGenerator.getType(apiKeyId));

console.log('✅ EcoID generator tests completed successfully!');