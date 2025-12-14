import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import AWSAccount from '../models/AWSAccount.js';
import { decrypt } from '../utils/encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testAWSCredentials() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('🔍 Finding AWS accounts...');
    const accounts = await AWSAccount.find();
    
    if (accounts.length === 0) {
      console.log('❌ No AWS accounts found');
      return;
    }

    console.log(`Found ${accounts.length} AWS account(s)\n`);

    for (const account of accounts) {
      console.log('='.repeat(60));
      console.log('Testing Account:', account.accountName);
      console.log('Region:', account.region);
      console.log('Account ID:', account._id);
      
      try {
        // Decrypt credentials
        console.log('\n🔐 Decrypting credentials...');
        const accessKeyId = account.accessKey ? decrypt(account.accessKey) : null;
        const secretAccessKey = account.secretKey ? decrypt(account.secretKey) : null;
        
        console.log('Access Key ID:', accessKeyId ? `${accessKeyId.substring(0, 8)}...` : 'MISSING');
        console.log('Secret Key:', secretAccessKey ? `${secretAccessKey.substring(0, 8)}...` : 'MISSING');
        console.log('Access Key Length:', accessKeyId?.length || 0);
        console.log('Secret Key Length:', secretAccessKey?.length || 0);
        
        if (!accessKeyId || !secretAccessKey) {
          console.log('❌ Credentials are missing or empty after decryption');
          continue;
        }
        
        // Test credentials with EC2
        console.log('\n☁️  Testing credentials with AWS EC2...');
        const ec2 = new EC2Client({
          region: account.region,
          credentials: {
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey
          }
        });
        
        const command = new DescribeInstancesCommand({
          MaxResults: 5
        });
        
        const response = await ec2.send(command);
        
        console.log('✅ Credentials are VALID!');
        console.log('Instances found:', response.Reservations?.length || 0);
        
        if (response.Reservations && response.Reservations.length > 0) {
          console.log('\nEC2 Instances:');
          response.Reservations.forEach(reservation => {
            reservation.Instances.forEach(instance => {
              const name = instance.Tags?.find(t => t.Key === 'Name')?.Value || 'No name';
              console.log(`  - ${instance.InstanceId} (${name}) - ${instance.State.Name}`);
            });
          });
        }
        
      } catch (error) {
        console.log('❌ Credentials test FAILED');
        console.log('Error:', error.message);
        console.log('Error code:', error.name);
        
        if (error.message.includes('not valid')) {
          console.log('\n💡 Possible issues:');
          console.log('  1. Access Key ID or Secret Key is incorrect');
          console.log('  2. Credentials have been rotated/changed in AWS');
          console.log('  3. Encryption/decryption is not working correctly');
          console.log('  4. IAM user has been deleted or disabled');
        }
      }
      
      console.log('='.repeat(60));
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

testAWSCredentials();
