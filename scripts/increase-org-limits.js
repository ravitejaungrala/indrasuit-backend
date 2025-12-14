import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Organization from '../models/Organization.js';

dotenv.config();

/**
 * Script to increase organization limits
 * Usage: node backend/scripts/increase-org-limits.js [email] [plan]
 * Example: node backend/scripts/increase-org-limits.js user@example.com professional
 */

const increaseLimits = async () => {
  try {
    // Get email from command line argument
    const userEmail = process.argv[2];
    const plan = process.argv[3] || 'professional';
    
    if (!userEmail) {
      console.log('❌ Usage: node increase-org-limits.js <user-email> [plan]');
      console.log('   Plans: free, starter, professional, enterprise');
      console.log('   Example: node increase-org-limits.js user@example.com professional');
      process.exit(1);
    }
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Import User model
    const User = mongoose.model('User');
    
    // Find user by email
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.log(`❌ User not found: ${userEmail}`);
      process.exit(1);
    }
    
    console.log(`✅ Found user: ${user.name} (${user.email})`);
    
    // Find user's organization
    const organization = await Organization.findOne({ 
      $or: [
        { ownerId: user._id },
        { 'members.userId': user._id }
      ]
    });
    
    if (!organization) {
      console.log('❌ No organization found for this user');
      process.exit(1);
    }
    
    console.log(`✅ Found organization: ${organization.name}`);
    console.log('\n📊 Current Limits:');
    console.log(`   AWS Accounts: ${organization.usage.awsAccounts}/${organization.limits.maxAWSAccounts}`);
    console.log(`   Deployments: ${organization.usage.deployments}/${organization.limits.maxDeployments}`);
    console.log(`   Users: ${organization.usage.users}/${organization.limits.maxUsers}`);
    console.log(`   Deployments/Month: ${organization.usage.deploymentsThisMonth}/${organization.limits.maxDeploymentsPerMonth}`);
    console.log(`   Current Plan: ${organization.subscription.plan}`);
    
    // Update plan and limits
    organization.subscription.plan = plan;
    organization.subscription.status = 'active';
    organization.updateLimitsForPlan(plan);
    
    await organization.save();
    
    console.log('\n✅ Limits Updated!');
    console.log(`   New Plan: ${plan}`);
    console.log('\n📊 New Limits:');
    console.log(`   AWS Accounts: ${organization.limits.maxAWSAccounts === -1 ? 'Unlimited' : organization.limits.maxAWSAccounts}`);
    console.log(`   Deployments: ${organization.limits.maxDeployments === -1 ? 'Unlimited' : organization.limits.maxDeployments}`);
    console.log(`   Users: ${organization.limits.maxUsers === -1 ? 'Unlimited' : organization.limits.maxUsers}`);
    console.log(`   Deployments/Month: ${organization.limits.maxDeploymentsPerMonth === -1 ? 'Unlimited' : organization.limits.maxDeploymentsPerMonth}`);
    
    console.log('\n🎉 Done! You can now add more AWS accounts.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

increaseLimits();
