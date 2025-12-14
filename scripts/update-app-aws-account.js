import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Application from '../models/Application.js';
import AWSAccount from '../models/AWSAccount.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

async function updateAppAWSAccount() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find the "yassu" AWS account (the one with valid credentials)
    console.log('🔍 Finding AWS account "yassu"...');
    const awsAccount = await AWSAccount.findOne({ accountName: 'yassu' });
    
    if (!awsAccount) {
      console.log('❌ AWS account "yassu" not found');
      return;
    }
    
    console.log('✅ Found AWS account:', awsAccount.accountName);
    console.log('Account ID:', awsAccount._id);
    console.log('Region:', awsAccount.region);
    
    // Find "my-app" application
    console.log('\n🔍 Finding application "my-app"...');
    const app = await Application.findOne({ name: 'my-app' });
    
    if (!app) {
      console.log('❌ Application "my-app" not found');
      return;
    }
    
    console.log('✅ Found application:', app.name);
    console.log('Current AWS Account ID:', app.aws.accountId);
    
    // Update the application with new AWS account
    console.log('\n💾 Updating application with new AWS account...');
    app.aws.accountId = awsAccount._id;
    app.aws.region = awsAccount.region;
    app.status = 'pending';
    app.errorMessage = '';
    app.deploymentLogs = [`[${new Date().toISOString()}] AWS account updated to: ${awsAccount.accountName}`];
    
    await app.save();
    
    console.log('✅ Application updated successfully!');
    console.log('\nNew configuration:');
    console.log('  AWS Account:', awsAccount.accountName);
    console.log('  Region:', awsAccount.region);
    console.log('  Status:', app.status);
    
    console.log('\n🎉 Ready to deploy!');
    console.log('\nNext steps:');
    console.log('1. Go to Applications page');
    console.log('2. Click "Redeploy" on my-app');
    console.log('3. Watch it deploy successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

updateAppAWSAccount();
