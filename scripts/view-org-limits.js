import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Organization from '../models/Organization.js';

dotenv.config();

/**
 * Script to view organization limits and usage
 * Usage: node backend/scripts/view-org-limits.js [email]
 * Example: node backend/scripts/view-org-limits.js user@example.com
 */

const viewLimits = async () => {
  try {
    // Get email from command line argument
    const userEmail = process.argv[2];
    
    if (!userEmail) {
      console.log('Usage: node view-org-limits.js <user-email>');
      console.log('Example: node view-org-limits.js user@example.com');
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
    
    console.log(`\n👤 User: ${user.name} (${user.email})`);
    
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
    
    console.log(`\n🏢 Organization: ${organization.name}`);
    console.log(`   Slug: ${organization.slug}`);
    console.log(`   Plan: ${organization.subscription.plan}`);
    console.log(`   Status: ${organization.subscription.status}`);
    
    console.log('\n📊 Current Usage & Limits:');
    console.log('┌─────────────────────────┬─────────┬─────────┬──────────┐');
    console.log('│ Resource                │ Current │ Limit   │ Status   │');
    console.log('├─────────────────────────┼─────────┼─────────┼──────────┤');
    
    const formatLimit = (limit) => limit === -1 ? '∞' : limit.toString();
    const getStatus = (current, limit) => {
      if (limit === -1) return '✅ OK';
      const percentage = (current / limit) * 100;
      if (percentage >= 100) return '🔴 FULL';
      if (percentage >= 80) return '🟡 HIGH';
      return '✅ OK';
    };
    
    console.log(`│ AWS Accounts            │ ${organization.usage.awsAccounts.toString().padEnd(7)} │ ${formatLimit(organization.limits.maxAWSAccounts).padEnd(7)} │ ${getStatus(organization.usage.awsAccounts, organization.limits.maxAWSAccounts).padEnd(8)} │`);
    console.log(`│ Total Deployments       │ ${organization.usage.deployments.toString().padEnd(7)} │ ${formatLimit(organization.limits.maxDeployments).padEnd(7)} │ ${getStatus(organization.usage.deployments, organization.limits.maxDeployments).padEnd(8)} │`);
    console.log(`│ Deployments This Month  │ ${organization.usage.deploymentsThisMonth.toString().padEnd(7)} │ ${formatLimit(organization.limits.maxDeploymentsPerMonth).padEnd(7)} │ ${getStatus(organization.usage.deploymentsThisMonth, organization.limits.maxDeploymentsPerMonth).padEnd(8)} │`);
    console.log(`│ Team Members            │ ${organization.usage.users.toString().padEnd(7)} │ ${formatLimit(organization.limits.maxUsers).padEnd(7)} │ ${getStatus(organization.usage.users, organization.limits.maxUsers).padEnd(8)} │`);
    console.log('└─────────────────────────┴─────────┴─────────┴──────────┘');
    
    // Show available plans
    console.log('\n📦 Available Plans:');
    console.log('┌─────────────┬──────────────┬──────────────┬───────────────────┬───────┐');
    console.log('│ Plan        │ AWS Accounts │ Deployments  │ Deployments/Month │ Users │');
    console.log('├─────────────┼──────────────┼──────────────┼───────────────────┼───────┤');
    console.log('│ Free        │ 3            │ 50           │ 100               │ 5     │');
    console.log('│ Starter     │ 5            │ 200          │ 500               │ 10    │');
    console.log('│ Professional│ 15           │ 1,000        │ 2,000             │ 50    │');
    console.log('│ Enterprise  │ Unlimited    │ Unlimited    │ Unlimited         │ ∞     │');
    console.log('└─────────────┴──────────────┴──────────────┴───────────────────┴───────┘');
    
    if (organization.usage.awsAccounts >= organization.limits.maxAWSAccounts) {
      console.log('\n⚠️  AWS Account limit reached!');
      console.log('   To add more accounts, upgrade your plan:');
      console.log(`   node backend/scripts/increase-org-limits.js ${userEmail} professional`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

viewLimits();
