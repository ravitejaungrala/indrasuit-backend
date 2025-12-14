/**
 * Seed Demo Data for Specific User
 * Seeds templates, analytics, and notifications for a specific email
 * 
 * Usage: node backend/scripts/seed-for-current-user.js YOUR_EMAIL
 * Example: node backend/scripts/seed-for-current-user.js bonthuyaswanth@gmail.com
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const userEmail = process.argv[2];

if (!userEmail) {
  console.log('❌ Please provide your email address');
  console.log('Usage: node backend/scripts/seed-for-current-user.js YOUR_EMAIL');
  console.log('Example: node backend/scripts/seed-for-current-user.js bonthuyaswanth@gmail.com');
  process.exit(1);
}

async function seedForUser() {
  try {
    console.log(`🌱 Seeding demo data for: ${userEmail}\n`);
    console.log('='.repeat(60));
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Find user
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.log(`❌ User not found: ${userEmail}`);
      console.log('\nAvailable users:');
      const users = await User.find().select('email');
      users.forEach(u => console.log(`  - ${u.email}`));
      await mongoose.connection.close();
      return;
    }
    
    const organization = await Organization.findById(user.organizationId);
    if (!organization) {
      console.log('❌ No organization found for this user');
      await mongoose.connection.close();
      return;
    }
    
    console.log(`👤 User: ${user.email}`);
    console.log(`🏢 Organization: ${organization.name}`);
    console.log(`🆔 Organization ID: ${organization._id}\n`);
    
    // Delete existing demo data for this organization
    console.log('🗑️  Cleaning old demo data...');
    await Template.deleteMany({ organizationId: organization._id });
    await Notification.deleteMany({ organizationId: organization._id });
    await Analytics.deleteMany({ organizationId: organization._id });
    console.log('✅ Cleaned\n');
    
    // Seed Templates
    console.log('📋 Creating Templates...');
    console.log('-'.repeat(60));
    
    const templates = [
      {
        name: 'Production Web Server',
        description: 'High-performance EC2 instance optimized for web applications with auto-scaling',
        resourceType: 'ec2',
        category: 'compute',
        config: {
          instance_type: 't3.large',
          ami_id: 'ami-0c55b159cbfafe1f0',
          key_name: 'production-key',
          root_volume_size: 50,
          root_volume_type: 'gp3',
          enable_ebs_encryption: true,
          enable_monitoring: true
        },
        tags: ['production', 'web-server', 'nginx', 'high-performance'],
        isPublic: true,
        usageCount: 45
      },
      {
        name: 'Development Environment',
        description: 'Cost-effective EC2 instance for development and testing',
        resourceType: 'ec2',
        category: 'compute',
        config: {
          instance_type: 't2.micro',
          ami_id: 'ami-0c55b159cbfafe1f0',
          key_name: 'dev-key',
          root_volume_size: 20
        },
        tags: ['development', 'testing', 'cost-effective'],
        isPublic: true,
        usageCount: 32
      },
      {
        name: 'Static Website Hosting',
        description: 'S3 bucket configured for static website hosting with CloudFront CDN',
        resourceType: 's3',
        category: 'storage',
        config: {
          bucketName: 'my-static-website',
          isPublic: true,
          versioning: true,
          encryption: true
        },
        tags: ['website', 'static', 'cdn', 'hosting'],
        isPublic: true,
        usageCount: 28
      },
      {
        name: 'Secure Data Storage',
        description: 'Private S3 bucket with encryption and versioning for sensitive data',
        resourceType: 's3',
        category: 'storage',
        config: {
          bucketName: 'secure-data-bucket',
          isPublic: false,
          versioning: true,
          encryption: true
        },
        tags: ['security', 'encryption', 'backup', 'compliance'],
        isPublic: true,
        usageCount: 19
      },
      {
        name: 'CI/CD Pipeline User',
        description: 'IAM user with permissions for automated deployments and CI/CD pipelines',
        resourceType: 'iam',
        category: 'security',
        config: {
          username: 'cicd-pipeline-user',
          permissions: ['AmazonEC2FullAccess', 'AmazonS3FullAccess', 'CloudWatchLogsFullAccess']
        },
        tags: ['cicd', 'automation', 'deployment', 'pipeline'],
        isPublic: true,
        usageCount: 15
      },
      {
        name: 'Database Server',
        description: 'EC2 instance optimized for database workloads with enhanced networking',
        resourceType: 'ec2',
        category: 'database',
        config: {
          instance_type: 'r5.xlarge',
          ami_id: 'ami-0c55b159cbfafe1f0',
          key_name: 'db-key',
          root_volume_size: 100,
          root_volume_type: 'io2'
        },
        tags: ['database', 'mysql', 'postgresql', 'high-memory'],
        isPublic: true,
        usageCount: 12
      },
      {
        name: 'Microservices Container',
        description: 'EC2 instance configured for Docker containers and microservices',
        resourceType: 'ec2',
        category: 'compute',
        config: {
          instance_type: 't3.medium',
          ami_id: 'ami-0c55b159cbfafe1f0',
          key_name: 'container-key',
          root_volume_size: 30
        },
        tags: ['docker', 'containers', 'microservices', 'kubernetes'],
        isPublic: true,
        usageCount: 8
      },
      {
        name: 'Read-Only Auditor',
        description: 'IAM user with read-only access for security auditing and compliance',
        resourceType: 'iam',
        category: 'security',
        config: {
          username: 'security-auditor',
          permissions: ['ReadOnlyAccess', 'SecurityAudit']
        },
        tags: ['security', 'audit', 'compliance', 'read-only'],
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
    
    // Seed Notifications
    console.log('🔔 Creating Notifications...');
    console.log('-'.repeat(60));
    
    const notifications = [
      {
        type: 'deployment_success',
        title: '✅ Deployment Successful',
        message: 'Your EC2 instance "production-web-01" has been deployed successfully in us-east-1',
        priority: 'medium',
        read: false
      },
      {
        type: 'deployment_failed',
        title: '❌ Deployment Failed',
        message: 'Failed to deploy S3 bucket "test-bucket-123". Error: Bucket name already exists',
        priority: 'high',
        read: false
      },
      {
        type: 'limit_warning',
        title: '⚠️ Approaching Deployment Limit',
        message: 'You have used 85% of your monthly deployment limit (85/100). Consider upgrading your plan.',
        priority: 'medium',
        read: false
      },
      {
        type: 'security_alert',
        title: '🔒 Security Alert',
        message: 'Unusual login activity detected from IP 192.168.1.100. Please verify this was you.',
        priority: 'urgent',
        read: false
      },
      {
        type: 'subscription_expiring',
        title: '⏰ Subscription Expiring Soon',
        message: 'Your Professional plan subscription will expire in 7 days. Renew now to avoid service interruption.',
        priority: 'high',
        read: false
      },
      {
        type: 'limit_reached',
        title: '🚫 AWS Account Limit Reached',
        message: 'You have reached your maximum AWS account limit (3/3). Upgrade to add more accounts.',
        priority: 'high',
        read: false
      },
      {
        type: 'deployment_started',
        title: '🚀 Deployment Started',
        message: 'Starting deployment of IAM user "developer-access" in your AWS account',
        priority: 'low',
        read: true
      },
      {
        type: 'member_added',
        title: '👤 New Team Member',
        message: 'John Doe (john@example.com) has been added to your organization as an Admin',
        priority: 'low',
        read: true
      },
      {
        type: 'system',
        title: '📢 System Maintenance',
        message: 'Scheduled maintenance on Dec 10, 2024 from 2:00 AM - 4:00 AM UTC. Services may be temporarily unavailable.',
        priority: 'medium',
        read: true
      },
      {
        type: 'deployment_success',
        title: '✅ Template Deployment Complete',
        message: 'Successfully deployed "Production Web Server" template to us-west-2',
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
    console.log(`\n✨ Created ${notifications.length} notifications (${notifications.filter(n => !n.read).length} unread)\n`);
    
    // Seed Analytics
    console.log('📊 Creating Analytics Data...');
    console.log('-'.repeat(60));
    
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
    console.log('\n🎉 Demo Data Created Successfully!\n');
    console.log('📊 Summary:');
    console.log(`  ✅ Templates: ${templates.length}`);
    console.log(`  ✅ Notifications: ${notifications.length} (${notifications.filter(n => !n.read).length} unread)`);
    console.log(`  ✅ Analytics: ${analyticsCount} days`);
    console.log(`  🏢 Organization: ${organization.name}`);
    console.log(`  👤 User: ${user.email}`);
    console.log('\n🚀 Next Steps:');
    console.log('  1. Refresh your browser (Ctrl+F5)');
    console.log('  2. Visit /analytics to see charts');
    console.log('  3. Visit /templates to browse templates');
    console.log('  4. Click bell icon for notifications\n');
    
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

seedForUser();
