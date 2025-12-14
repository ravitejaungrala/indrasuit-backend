import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Organization from './models/Organization.js';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend directory
dotenv.config({ path: join(__dirname, '.env') });

const bypassLimits = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ Error: MONGODB_URI not found in backend/.env');
      console.error('\nPlease check that backend/.env exists and contains MONGODB_URI');
      process.exit(1);
    }
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Update ALL organizations to Enterprise plan with unlimited limits
    const result = await Organization.updateMany(
      {},
      {
        $set: {
          'subscription.plan': 'enterprise',
          'subscription.status': 'active',
          'limits.maxAWSAccounts': -1,
          'limits.maxDeployments': -1,
          'limits.maxUsers': -1,
          'limits.maxDeploymentsPerMonth': -1
        }
      }
    );
    
    console.log('==============================================');
    console.log('✅ SUCCESS! All limits removed!');
    console.log('==============================================');
    console.log(`Updated ${result.modifiedCount} organization(s) to Enterprise plan\n`);
    console.log('All organizations now have:');
    console.log('  ✅ Unlimited AWS Accounts');
    console.log('  ✅ Unlimited Deployments');
    console.log('  ✅ Unlimited Users');
    console.log('  ✅ Enterprise status\n');
    console.log('You can now add as many AWS accounts as you want!');
    console.log('==============================================\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Make sure MongoDB is running');
    console.error('  2. Check backend/.env has correct MONGODB_URI');
    console.error('  3. Run from project root: node backend/bypass-limits.js\n');
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

bypassLimits();
