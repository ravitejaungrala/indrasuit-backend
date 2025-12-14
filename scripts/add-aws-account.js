import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import AWSAccount from '../models/AWSAccount.js';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import { encrypt } from '../utils/encryption.js';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function addAWSAccount() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get user input
    console.log('📝 Enter AWS Account Details:\n');
    
    const accountName = await question('Account Name (e.g., "My AWS Account"): ');
    const accessKeyId = await question('Access Key ID (AKIA...): ');
    const secretAccessKey = await question('Secret Access Key: ');
    const region = await question('Region (default: us-east-1): ') || 'us-east-1';
    
    console.log('\n🔍 Finding user and organization...');
    
    // Get first user and organization (you can modify this to select specific ones)
    const user = await User.findOne();
    const organization = await Organization.findOne();
    
    if (!user || !organization) {
      console.log('❌ No user or organization found. Please create a user first.');
      return;
    }
    
    console.log('✅ User:', user.email);
    console.log('✅ Organization:', organization.name);
    
    // Test credentials first
    console.log('\n☁️  Testing AWS credentials...');
    const ec2 = new EC2Client({
      region: region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
      }
    });
    
    try {
      const command = new DescribeInstancesCommand({ MaxResults: 5 });
      const response = await ec2.send(command);
      console.log('✅ Credentials are VALID!');
      console.log('EC2 Instances found:', response.Reservations?.length || 0);
      
      if (response.Reservations && response.Reservations.length > 0) {
        console.log('\nAvailable EC2 Instances:');
        response.Reservations.forEach(reservation => {
          reservation.Instances.forEach(instance => {
            const name = instance.Tags?.find(t => t.Key === 'Name')?.Value || 'No name';
            console.log(`  - ${instance.InstanceId} (${name}) - ${instance.State.Name}`);
          });
        });
      }
    } catch (error) {
      console.log('❌ Credentials test FAILED:', error.message);
      console.log('\nPlease check your credentials and try again.');
      return;
    }
    
    // Create AWS account (encryption happens automatically in pre-save hook)
    console.log('\n💾 Saving AWS account to database...');
    const awsAccount = new AWSAccount({
      userId: user._id,
      organizationId: organization._id,
      organizationName: organization.name,
      accountName: accountName,
      accessKey: accessKeyId,  // Will be encrypted by pre-save hook
      secretKey: secretAccessKey,  // Will be encrypted by pre-save hook
      region: region,
      isActive: true,
      verified: true
    });
    
    await awsAccount.save();
    
    console.log('\n✅ AWS Account added successfully!');
    console.log('Account ID:', awsAccount._id);
    console.log('Account Name:', awsAccount.accountName);
    console.log('Region:', awsAccount.region);
    
    console.log('\n🎉 You can now use this account for deployments!');
    console.log('\nNext steps:');
    console.log('1. Go to Applications page');
    console.log('2. Create new deployment');
    console.log('3. Select this AWS account');
    console.log('4. Deploy!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    rl.close();
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

addAWSAccount();
