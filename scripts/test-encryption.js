/**
 * Quick test script to verify encryption/decryption works correctly
 * Usage: node backend/scripts/test-encryption.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { encrypt, decrypt, isEncrypted, generateEncryptionKey } from '../utils/encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

console.log('🧪 Testing Encryption Utility\n');
console.log('=' .repeat(50));

// Test 1: Basic Encryption/Decryption
console.log('\n📝 Test 1: Basic Encryption/Decryption');
const testData = 'AKIAIOSFODNN7EXAMPLE';
console.log(`Original: ${testData}`);

const encrypted = encrypt(testData);
console.log(`Encrypted: ${encrypted}`);

const decrypted = decrypt(encrypted);
console.log(`Decrypted: ${decrypted}`);

if (testData === decrypted) {
  console.log('✅ Test 1 PASSED: Encryption/Decryption works correctly\n');
} else {
  console.log('❌ Test 1 FAILED: Decrypted data does not match original\n');
  process.exit(1);
}

// Test 2: isEncrypted Check
console.log('📝 Test 2: isEncrypted Check');
console.log(`Plain text encrypted? ${isEncrypted(testData)}`);
console.log(`Encrypted text encrypted? ${isEncrypted(encrypted)}`);

if (!isEncrypted(testData) && isEncrypted(encrypted)) {
  console.log('✅ Test 2 PASSED: isEncrypted works correctly\n');
} else {
  console.log('❌ Test 2 FAILED: isEncrypted not working correctly\n');
  process.exit(1);
}

// Test 3: Multiple Encryptions Produce Different Results
console.log('📝 Test 3: Multiple Encryptions (Different IVs)');
const encrypted1 = encrypt(testData);
const encrypted2 = encrypt(testData);
console.log(`Encryption 1: ${encrypted1.substring(0, 40)}...`);
console.log(`Encryption 2: ${encrypted2.substring(0, 40)}...`);

if (encrypted1 !== encrypted2) {
  console.log('✅ Test 3 PASSED: Each encryption uses unique IV\n');
} else {
  console.log('❌ Test 3 FAILED: Encryptions should be different\n');
  process.exit(1);
}

// Test 4: Both Decrypt to Same Value
console.log('📝 Test 4: Both Decrypt to Same Value');
const decrypted1 = decrypt(encrypted1);
const decrypted2 = decrypt(encrypted2);

if (decrypted1 === testData && decrypted2 === testData) {
  console.log('✅ Test 4 PASSED: Both decrypt to original value\n');
} else {
  console.log('❌ Test 4 FAILED: Decryption inconsistent\n');
  process.exit(1);
}

// Test 5: AWS Credentials Format
console.log('📝 Test 5: Real AWS Credentials Format');
const fakeAccessKey = 'AKIAIOSFODNN7EXAMPLE';
const fakeSecretKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

const encryptedAccessKey = encrypt(fakeAccessKey);
const encryptedSecretKey = encrypt(fakeSecretKey);

console.log(`Access Key Encrypted: ${encryptedAccessKey.substring(0, 40)}...`);
console.log(`Secret Key Encrypted: ${encryptedSecretKey.substring(0, 40)}...`);

const decryptedAccessKey = decrypt(encryptedAccessKey);
const decryptedSecretKey = decrypt(encryptedSecretKey);

if (decryptedAccessKey === fakeAccessKey && decryptedSecretKey === fakeSecretKey) {
  console.log('✅ Test 5 PASSED: AWS credentials encrypted/decrypted correctly\n');
} else {
  console.log('❌ Test 5 FAILED: AWS credentials not handled correctly\n');
  process.exit(1);
}

// Test 6: Generate New Key
console.log('📝 Test 6: Generate New Encryption Key');
const newKey = generateEncryptionKey();
console.log(`Generated Key: ${newKey}`);
console.log(`Key Length: ${newKey.length} characters (should be 64)`);

if (newKey.length === 64 && /^[0-9a-f]+$/i.test(newKey)) {
  console.log('✅ Test 6 PASSED: Key generation works correctly\n');
} else {
  console.log('❌ Test 6 FAILED: Generated key is invalid\n');
  process.exit(1);
}

// Test 7: Environment Variable Check
console.log('📝 Test 7: Environment Variable Check');
const envKey = process.env.ENCRYPTION_KEY;
if (envKey && envKey.length === 64) {
  console.log(`ENCRYPTION_KEY: ${envKey.substring(0, 16)}...${envKey.substring(48)}`);
  console.log('✅ Test 7 PASSED: ENCRYPTION_KEY is properly configured\n');
} else {
  console.log('❌ Test 7 FAILED: ENCRYPTION_KEY not configured correctly\n');
  console.log('   Add ENCRYPTION_KEY to your .env file\n');
  process.exit(1);
}

// Summary
console.log('=' .repeat(50));
console.log('\n🎉 All Tests PASSED!\n');
console.log('✅ Encryption utility is working correctly');
console.log('✅ Ready to encrypt AWS credentials');
console.log('\n📋 Next Steps:');
console.log('   1. Run: node backend/scripts/encrypt-existing-credentials.js');
console.log('   2. Test deployments through the UI');
console.log('   3. Verify credentials work correctly\n');
