/**
 * Script to encrypt existing AWS credentials in the database
 * Run this once after implementing encryption to secure existing data
 * 
 * Usage: node backend/scripts/encrypt-existing-credentials.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { encrypt, isEncrypted } from '../utils/encryption.js';
import AWSAccount from '../models/AWSAccount.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function encryptExistingCredentials() {
  try {
    console.log('🔐 Starting credential encryption process...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all AWS accounts
    const accounts = await AWSAccount.find({});
    console.log(`📊 Found ${accounts.length} AWS accounts\n`);

    let encryptedCount = 0;
    let alreadyEncryptedCount = 0;
    let errorCount = 0;

    for (const account of accounts) {
      try {
        const needsEncryption = 
          !isEncrypted(account.accessKey) || 
          !isEncrypted(account.secretKey);

        if (needsEncryption) {
          console.log(`🔒 Encrypting credentials for account: ${account.accountName}`);
          
          // Encrypt if not already encrypted
          if (!isEncrypted(account.accessKey)) {
            account.accessKey = encrypt(account.accessKey);
          }
          
          if (!isEncrypted(account.secretKey)) {
            account.secretKey = encrypt(account.secretKey);
          }

          // Save without triggering pre-save hook again
          await account.save();
          encryptedCount++;
          console.log(`  ✅ Encrypted successfully\n`);
        } else {
          alreadyEncryptedCount++;
          console.log(`  ⏭️  Account "${account.accountName}" already encrypted\n`);
        }
      } catch (error) {
        errorCount++;
        console.error(`  ❌ Error encrypting account "${account.accountName}":`, error.message, '\n');
      }
    }

    console.log('\n📈 Encryption Summary:');
    console.log(`  ✅ Newly encrypted: ${encryptedCount}`);
    console.log(`  ⏭️  Already encrypted: ${alreadyEncryptedCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📊 Total accounts: ${accounts.length}\n`);

    if (encryptedCount > 0) {
      console.log('🎉 Credential encryption completed successfully!');
    } else if (alreadyEncryptedCount === accounts.length) {
      console.log('✨ All credentials were already encrypted!');
    }

    // Close connection
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the script
encryptExistingCredentials();
