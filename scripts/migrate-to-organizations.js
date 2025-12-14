/**
 * Migration Script: Add Organizations to Existing Data
 * 
 * This script:
 * 1. Creates an organization for each existing user
 * 2. Links users to their organizations
 * 3. Updates AWS accounts with organizationId
 * 4. Updates deployments with organizationId
 * 
 * Usage: node backend/scripts/migrate-to-organizations.js
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

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function migrateToOrganizations() {
  try {
    console.log('🚀 Starting migration to organizations...\n');
    console.log('=' .repeat(60));
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get all users without organizations
    const users = await User.find({ organizationId: null });
    console.log(`📊 Found ${users.length} users without organizations\n`);
    
    if (users.length === 0) {
      console.log('✨ All users already have organizations!');
      await mongoose.connection.close();
      return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const user of users) {
      try {
        console.log(`\n👤 Processing user: ${user.email}`);
        console.log('-'.repeat(60));
        
        // Create organization for user
        const org = await Organization.createDefaultOrganization(
          user._id,
          user.name || user.email.split('@')[0],
          user.email
        );
        console.log(`  ✅ Created organization: ${org.name}`);
        console.log(`     ID: ${org._id}`);
        console.log(`     Plan: ${org.subscription.plan}`);
        
        // Update user
        user.organizationId = org._id;
        user.defaultOrganizationId = org._id;
        await user.save();
        console.log(`  ✅ Updated user with organization link`);
        
        // Update AWS accounts
        const awsAccountsResult = await AWSAccount.updateMany(
          { userId: user._id, organizationId: null },
          { $set: { organizationId: org._id } }
        );
        console.log(`  ✅ Updated ${awsAccountsResult.modifiedCount} AWS accounts`);
        
        // Update organization usage for AWS accounts
        const awsAccountCount = await AWSAccount.countDocuments({
          userId: user._id,
          organizationId: org._id
        });
        org.usage.awsAccounts = awsAccountCount;
        
        // Update deployments
        const deploymentsResult = await Deployment.updateMany(
          { userId: user._id, organizationId: null },
          { $set: { organizationId: org._id } }
        );
        console.log(`  ✅ Updated ${deploymentsResult.modifiedCount} deployments`);
        
        // Update organization usage for deployments
        const deploymentCount = await Deployment.countDocuments({
          userId: user._id,
          organizationId: org._id
        });
        org.usage.deployments = deploymentCount;
        
        // Count deployments this month
        const firstDayOfMonth = new Date();
        firstDayOfMonth.setDate(1);
        firstDayOfMonth.setHours(0, 0, 0, 0);
        
        const deploymentsThisMonth = await Deployment.countDocuments({
          userId: user._id,
          organizationId: org._id,
          createdAt: { $gte: firstDayOfMonth }
        });
        org.usage.deploymentsThisMonth = deploymentsThisMonth;
        
        await org.save();
        console.log(`  ✅ Updated organization usage stats`);
        console.log(`     AWS Accounts: ${org.usage.awsAccounts}`);
        console.log(`     Deployments: ${org.usage.deployments}`);
        console.log(`     Deployments This Month: ${org.usage.deploymentsThisMonth}`);
        
        successCount++;
        console.log(`  🎉 Successfully migrated user ${user.email}`);
        
      } catch (error) {
        errorCount++;
        console.error(`  ❌ Error migrating user ${user.email}:`, error.message);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📈 Migration Summary:');
    console.log(`  ✅ Successful: ${successCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📊 Total: ${users.length}`);
    
    if (successCount === users.length) {
      console.log('\n🎉 Migration completed successfully!');
    } else if (successCount > 0) {
      console.log('\n⚠️  Migration completed with some errors');
    } else {
      console.log('\n❌ Migration failed');
    }
    
    // Close connection
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed\n');
    
    process.exit(errorCount > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the migration
migrateToOrganizations();
