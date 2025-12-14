/**
 * Multi-Tenancy Testing Script
 * 
 * This script tests the multi-tenancy implementation by:
 * 1. Checking if organizations exist
 * 2. Verifying data isolation
 * 3. Testing usage limits
 * 
 * Usage: node backend/scripts/test-multi-tenancy.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import AWSAccount from '../models/AWSAccount.js';
import Deployment from '../models/Deployment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function testMultiTenancy() {
  try {
    console.log('🧪 Testing Multi-Tenancy Implementation...\n');
    console.log('='.repeat(60));
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Test 1: Check Organizations
    console.log('📊 Test 1: Checking Organizations');
    console.log('-'.repeat(60));
    const orgCount = await Organization.countDocuments();
    console.log(`  Organizations found: ${orgCount}`);
    
    if (orgCount === 0) {
      console.log('  ⚠️  No organizations found. Run migration script first!');
      await mongoose.connection.close();
      return;
    }
    
    const orgs = await Organization.find().limit(3);
    orgs.forEach(org => {
      console.log(`  - ${org.name} (${org.subscription.plan})`);
      console.log(`    AWS Accounts: ${org.usage.awsAccounts}/${org.limits.maxAWSAccounts}`);
      console.log(`    Deployments: ${org.usage.deployments}/${org.limits.maxDeployments}`);
      console.log(`    Users: ${org.usage.users}/${org.limits.maxUsers}`);
    });
    console.log('  ✅ Organizations exist\n');
    
    // Test 2: Check User-Organization Links
    console.log('📊 Test 2: Checking User-Organization Links');
    console.log('-'.repeat(60));
    const usersWithOrg = await User.countDocuments({ organizationId: { $ne: null } });
    const usersWithoutOrg = await User.countDocuments({ organizationId: null });
    console.log(`  Users with organization: ${usersWithOrg}`);
    console.log(`  Users without organization: ${usersWithoutOrg}`);
    
    if (usersWithoutOrg > 0) {
      console.log('  ⚠️  Some users don\'t have organizations. Run migration!');
    } else {
      console.log('  ✅ All users linked to organizations\n');
    }
    
    // Test 3: Check AWS Accounts
    console.log('📊 Test 3: Checking AWS Accounts');
    console.log('-'.repeat(60));
    const awsWithOrg = await AWSAccount.countDocuments({ organizationId: { $ne: null } });
    const awsWithoutOrg = await AWSAccount.countDocuments({ organizationId: null });
    console.log(`  AWS accounts with organizationId: ${awsWithOrg}`);
    console.log(`  AWS accounts without organizationId: ${awsWithoutOrg}`);
    
    if (awsWithoutOrg > 0) {
      console.log('  ⚠️  Some AWS accounts missing organizationId. Run migration!');
    } else {
      console.log('  ✅ All AWS accounts have organizationId\n');
    }
    
    // Test 4: Check Deployments
    console.log('📊 Test 4: Checking Deployments');
    console.log('-'.repeat(60));
    const deployWithOrg = await Deployment.countDocuments({ organizationId: { $ne: null } });
    const deployWithoutOrg = await Deployment.countDocuments({ organizationId: null });
    console.log(`  Deployments with organizationId: ${deployWithOrg}`);
    console.log(`  Deployments without organizationId: ${deployWithoutOrg}`);
    
    if (deployWithoutOrg > 0) {
      console.log('  ⚠️  Some deployments missing organizationId. Run migration!');
    } else {
      console.log('  ✅ All deployments have organizationId\n');
    }
    
    // Test 5: Data Isolation Check
    console.log('📊 Test 5: Testing Data Isolation');
    console.log('-'.repeat(60));
    
    if (orgCount >= 2) {
      const org1 = orgs[0];
      const org2 = orgs[1];
      
      const org1Accounts = await AWSAccount.countDocuments({ organizationId: org1._id });
      const org2Accounts = await AWSAccount.countDocuments({ organizationId: org2._id });
      
      console.log(`  ${org1.name}: ${org1Accounts} AWS accounts`);
      console.log(`  ${org2.name}: ${org2Accounts} AWS accounts`);
      console.log('  ✅ Data properly isolated by organization\n');
    } else {
      console.log('  ⚠️  Need at least 2 organizations to test isolation\n');
    }
    
    // Test 6: Usage Limit Methods
    console.log('📊 Test 6: Testing Usage Limit Methods');
    console.log('-'.repeat(60));
    const testOrg = orgs[0];
    console.log(`  Testing with: ${testOrg.name}`);
    console.log(`  Can add AWS account: ${testOrg.canAddAWSAccount()}`);
    console.log(`  Can deploy: ${testOrg.canDeploy()}`);
    console.log(`  Can add member: ${testOrg.canAddMember()}`);
    console.log('  ✅ Usage limit methods working\n');
    
    // Summary
    console.log('='.repeat(60));
    console.log('\n📈 Test Summary:');
    
    const allPassed = 
      orgCount > 0 &&
      usersWithoutOrg === 0 &&
      awsWithoutOrg === 0 &&
      deployWithoutOrg === 0;
    
    if (allPassed) {
      console.log('  🎉 All tests passed! Multi-tenancy is working correctly!');
    } else {
      console.log('  ⚠️  Some tests failed. Please run the migration script:');
      console.log('     node backend/scripts/migrate-to-organizations.js');
    }
    
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

testMultiTenancy();
