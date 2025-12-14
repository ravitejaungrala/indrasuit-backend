/**
 * Complete Demo Setup Script
 * Runs migration (if needed) and seeds all demo data
 * 
 * Usage: node backend/scripts/setup-complete-demo.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import Template from '../models/Template.js';
import Analytics from '../models/Analytics.js';
import Notification from '../models/Notification.js';
import AWSAccount from '../models/AWSAccount.js';
import Deployment from '../models/Deployment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function setupCompleteDemo() {
  try {
    console.log('🚀 Starting Complete Demo Setup...\n');
    console.log('='.repeat(60));
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Step 1: Check and run migration if needed
    console.log('📋 Step 1: Checking Migration Status...');
    console.log('-'.repeat(60));
    
    const usersWithoutOrg = await User.countDocuments({ organizationId: null });
    
    if (usersWithoutOrg > 0) {
      console.log(`⚠️  Found ${usersWithoutOrg} users without organizations`);
      console.log('🔄 Running migration...\n');
      
      const users = await User.find({ organizationId: null });
      
      for (const user of users) {
        console.log(`  Processing: ${user.email}`);
        
        // Create organization
        const org = await Organization.createDefaultOrganization(
          user._id,
          user.name || user.email.split('@')[0],
          user.email
        );
        
        // Update user
        user.organizationId = org._id;
        user.defaultOrganizationId = org._id;
        await user.save();
        
        // Update AWS accounts
        await AWSAccount.updateMany(
          { userId: user._id, organizationId: null },
          { $set: { organizationId: org._id } }
        );
        
        // Update deployments
        await Deployment.updateMany(
          { userId: user._id, organizationId: null },
          { $set: { organizationId: org._id } }
        );
        
        console.log(`  ✅ Migrated: ${user.email}\n`);
      }
      
      console.log('✅ Migration Complete!\n');
    } else {
      console.log('✅ All users already have organizations\n');
    }
    
    // Step 2: Get user and organization
    const user = await User.findOne();
    if (!user) {
      console.log('❌ No users found. Please create a user first.');
      await mongoose.connection.close();
      return;
    }
    
    const organization = await Organization.findById(user.organizationId);
    if (!organization) {
      console.log('❌ No organization found.');
      await mongoose.connection.close();
      return;
    }
    
    console.log(`👤 Using user: ${user.email}`);
    console.log(`🏢 Using organization: ${organization.name}\n`);
    
    // Step 3: Seed Templates
    console.log('📋 Step 2: Seeding Templates...');
    console.log('-'.repeat(60));
    
    await Template.deleteMany({ organizationId: organization._id });
    
    const templates = [
      {
        name: 'Production Web Server',
        description: 'High-performance EC2 instance optimized for web applications',
        resourceType: 'ec2',
        category: 'compute',
        config: {
          instance_type: 't3.large',
          ami_id: 'ami-0c55b159cbfafe1f0',
          key_name: 'production-key',
          root_volume_size: 50,
          enable_monitoring: true
        },
        tags: ['production', 'web-server', 'nginx'],
        isPublic: true,
        usageCount: 45
      },
      {
        name: 'Development Environment',
        description: 'Cost-effective EC2 instance for development',
        resourceType: 'ec2',
        category: 'compute',
        config: {
          instance_type: 't2.micro',
          ami_id: 'ami-0c55b159cbfafe1f0',
          key_name: 'dev-key',
          root_volume_size: 20
        },
        tags: ['development', 'testing'],
        isPublic: true,
        usageCount: 32
      },
      {
        name: 'Static Website Hosting',
        description: 'S3 bucket for static website hosting',
        resourceType: 's3',
        category: 'storage',
        config: {
          bucketName: 'my-static-website',
          isPublic: true,
          versioning: true,
          encryption: true
        },
        tags: ['website', 'static', 'cdn'],
        isPublic: true,
        usageCount: 28
      },
      {
        name: 'Secure Data Storage',
        description: 'Private S3 bucket with encryption',
        resourceType: 's3',
        category: 'storage',
        config: {
          bucketName: 'secure-data-bucket',
          isPublic: false,
          versioning: true,
          encryption: true
        },
        tags: ['security', 'encryption', 'backup'],
        isPublic: true,
        usageCount: 19
      },
      {
        name: 'CI/CD Pipeline User',
        description: 'IAM user for automated deployments',
        resourceType: 'iam',
        category: 'security',
        config: {
          username: 'cicd-pipeline-user',
          permissions: ['AmazonEC2FullAccess', 'AmazonS3FullAccess']
        },
        tags: ['cicd', 'automation', 'pipeline'],
        isPublic: true,
        usageCount: 15
      },
      {
        name: 'Database Server',
        description: 'EC2 instance optimized for databases',
        resourceType: 'ec2',
        category: 'database',
        config: {
          instance_type: 'r5.xlarge',
          ami_id: 'ami-0c55b159cbfafe1f0',
          key_name: 'db-key',
          root_volume_size: 100
        },
        tags: ['database', 'mysql', 'postgresql'],
        isPublic: true,
        usageCount: 12
      },
      {
        name: 'Microservices Container',
        description: 'EC2 for Docker containers',
        resourceType: 'ec2',
        category: 'compute',
        config: {
          instance_type: 't3.medium',
          ami_id: 'ami-0c55b159cbfafe1f0',
          key_name: 'container-key',
          root_volume_size: 30
        },
        tags: ['docker', 'containers', 'microservices'],
        isPublic: true,
        usageCount: 8
      },
      {
        name: 'Read-Only Auditor',
        description: 'IAM user for security auditing',
        resourceType: 'iam',
        category: 'security',
        config: {
          username: 'security-auditor',
          permissions: ['ReadOnlyAccess', 'SecurityAudit']
        },
        tags: ['security', 'audit', 'compliance'],
        isPublic: true,
        usageCount: 5
      }
    ];
    
    for (const templateData of templates) {
      const template = new Template({
        ...templateData,
        organizationId: organization._id,
        createdBy: user._id
      });
      await template.save();
      console.log(`  ✅ ${template.name}`);
    }
    
    console.log(`\n✨ Created ${templates.length} templates\n`);
    
    // Step 4: Seed Notifications
    console.log('🔔 Step 3: Seeding Notifications...');
    console.log('-'.repeat(60));
    
    await Notification.deleteMany({ organizationId: organization._id });
    
    const notifications = [
      {
        type: 'deployment_success',
        title: 'Deployment Successful',
        message: 'Your EC2 instance "production-web-01" deployed successfully',
        priority: 'medium',
        read: false
      },
      {
        type: 'deployment_failed',
        title: 'Deployment Failed',
        message: 'Failed to deploy S3 bucket. Error: Bucket name already exists',
        priority: 'high',
        read: false
      },
      {
        type: 'limit_warning',
        title: 'Approaching Deployment Limit',
        message: 'You have used 85% of your monthly deployment limit',
        priority: 'medium',
        read: false
      },
      {
        type: 'security_alert',
        title: 'Security Alert',
        message: 'Unusual login activity detected. Please verify.',
        priority: 'urgent',
        read: false
      },
      {
        type: 'subscription_expiring',
        title: 'Subscription Expiring Soon',
        message: 'Your subscription will expire in 7 days',
        priority: 'high',
        read: false
      },
      {
        type: 'limit_reached',
        title: 'AWS Account Limit Reached',
        message: 'You have reached your maximum AWS account limit',
        priority: 'high',
        read: false
      },
      {
        type: 'deployment_started',
        title: 'Deployment Started',
        message: 'Starting deployment of IAM user "developer-access"',
        priority: 'low',
        read: true
      },
      {
        type: 'member_added',
        title: 'New Team Member',
        message: 'John Doe has been added to your organization',
        priority: 'low',
        read: true
      },
      {
        type: 'system',
        title: 'System Maintenance',
        message: 'Scheduled maintenance on Dec 10, 2024',
        priority: 'medium',
        read: true
      },
      {
        type: 'deployment_success',
        title: 'Template Deployment Complete',
        message: 'Successfully deployed "Production Web Server" template',
        priority: 'medium',
        read: false
      }
    ];
    
    for (const notifData of notifications) {
      const notification = new Notification({
        ...notifData,
        organizationId: organization._id,
        userId: user._id,
        createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
      });
      await notification.save();
      console.log(`  ✅ ${notification.title}`);
    }
    
    console.log(`\n✨ Created ${notifications.length} notifications\n`);
    
    // Step 5: Seed Analytics
    console.log('📊 Step 4: Seeding Analytics Data...');
    console.log('-'.repeat(60));
    
    await Analytics.deleteMany({ organizationId: organization._id });
    
    const today = new Date();
    let analyticsCount = 0;
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const baseDeployments = isWeekend ? 5 : 15;
      const totalDeployments = baseDeployments + Math.floor(Math.random() * 10);
      const successRate = 0.85 + Math.random() * 0.1;
      
      const analytics = new Analytics({
        organizationId: organization._id,
        date: date,
        metrics: {
          totalDeployments: totalDeployments,
          successfulDeployments: Math.floor(totalDeployments * successRate),
          failedDeployments: Math.floor(totalDeployments * (1 - successRate)),
          pendingDeployments: Math.floor(Math.random() * 3),
          ec2Instances: Math.floor(totalDeployments * 0.5),
          s3Buckets: Math.floor(totalDeployments * 0.3),
          iamUsers: Math.floor(totalDeployments * 0.2),
          awsAccountsUsed: Math.min(3, 1 + Math.floor(Math.random() * 3)),
          activeUsers: 1,
          avgDeploymentTime: 120 + Math.floor(Math.random() * 180),
          totalDeploymentTime: totalDeployments * (120 + Math.floor(Math.random() * 180)),
          estimatedCost: totalDeployments * (5 + Math.random() * 15)
        },
        hourlyData: generateHourlyData(totalDeployments),
        resourceBreakdown: {
          ec2: Math.floor(totalDeployments * 0.5),
          s3: Math.floor(totalDeployments * 0.3),
          iam: Math.floor(totalDeployments * 0.2),
          rds: 0,
          lambda: 0,
          other: 0
        }
      });
      
      await analytics.save();
      analyticsCount++;
      
      if (i % 10 === 0) {
        console.log(`  ✅ Created analytics for ${date.toDateString()}`);
      }
    }
    
    console.log(`\n✨ Created ${analyticsCount} days of analytics\n`);
    
    // Summary
    console.log('='.repeat(60));
    console.log('\n🎉 Complete Demo Setup Finished!\n');
    console.log('📊 Summary:');
    console.log(`  ✅ Templates: ${templates.length}`);
    console.log(`  ✅ Notifications: ${notifications.length} (${notifications.filter(n => !n.read).length} unread)`);
    console.log(`  ✅ Analytics: ${analyticsCount} days`);
    console.log('\n🚀 You can now:');
    console.log('  1. Visit /analytics to see charts');
    console.log('  2. Visit /templates to browse templates');
    console.log('  3. Click bell icon for notifications');
    console.log('\n💡 Refresh your browser to see the data!\n');
    
    await mongoose.connection.close();
    console.log('👋 Database connection closed\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

function generateHourlyData(totalDeployments) {
  const hourlyData = [];
  const deploymentsPerHour = totalDeployments / 24;
  
  for (let hour = 0; hour < 24; hour++) {
    const isBusinessHours = hour >= 9 && hour <= 17;
    const multiplier = isBusinessHours ? 1.5 : 0.5;
    const deployments = Math.floor(deploymentsPerHour * multiplier * (0.5 + Math.random()));
    const successRate = 0.85 + Math.random() * 0.1;
    
    hourlyData.push({
      hour: hour,
      deployments: deployments,
      successes: Math.floor(deployments * successRate),
      failures: Math.floor(deployments * (1 - successRate))
    });
  }
  
  return hourlyData;
}

setupCompleteDemo();
