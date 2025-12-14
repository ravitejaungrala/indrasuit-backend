/**
 * Phase 4 Demo Data Seeder
 * Seeds templates, analytics, and notifications for testing
 * 
 * Usage: node backend/scripts/seed-phase4-demo.js
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
import Deployment from '../models/Deployment.js';
import AWSAccount from '../models/AWSAccount.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// Demo Templates
const demoTemplates = [
  {
    name: 'Production Web Server',
    description: 'High-performance EC2 instance optimized for web applications with auto-scaling and load balancing',
    resourceType: 'ec2',
    category: 'compute',
    config: {
      instance_type: 't3.large',
      ami_id: 'ami-0c55b159cbfafe1f0',
      key_name: 'production-key',
      root_volume_size: 50,
      root_volume_type: 'gp3',
      enable_ebs_encryption: true,
      enable_monitoring: true,
      shutdown_behavior: 'stop',
      user_data: '#!/bin/bash\napt-get update\napt-get install -y nginx\nsystemctl start nginx'
    },
    tags: ['production', 'web-server', 'nginx', 'high-performance'],
    isPublic: true
  },
  {
    name: 'Development Environment',
    description: 'Cost-effective EC2 instance for development and testing purposes',
    resourceType: 'ec2',
    category: 'compute',
    config: {
      instance_type: 't2.micro',
      ami_id: 'ami-0c55b159cbfafe1f0',
      key_name: 'dev-key',
      root_volume_size: 20,
      root_volume_type: 'gp2',
      enable_ebs_encryption: false,
      enable_monitoring: false,
      shutdown_behavior: 'stop'
    },
    tags: ['development', 'testing', 'cost-effective'],
    isPublic: true
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
      encryption: true,
      website: {
        indexDocument: 'index.html',
        errorDocument: 'error.html'
      }
    },
    tags: ['website', 'static', 'cdn', 'hosting'],
    isPublic: true
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
      encryption: true,
      lifecycleRules: {
        transitionToIA: 30,
        transitionToGlacier: 90
      }
    },
    tags: ['security', 'encryption', 'backup', 'compliance'],
    isPublic: true
  },
  {
    name: 'CI/CD Pipeline User',
    description: 'IAM user with permissions for automated deployments and CI/CD pipelines',
    resourceType: 'iam',
    category: 'security',
    config: {
      username: 'cicd-pipeline-user',
      permissions: ['AmazonEC2FullAccess', 'AmazonS3FullAccess', 'CloudWatchLogsFullAccess'],
      programmaticAccess: true,
      consoleAccess: false
    },
    tags: ['cicd', 'automation', 'deployment', 'pipeline'],
    isPublic: true
  },
  {
    name: 'Read-Only Auditor',
    description: 'IAM user with read-only access for security auditing and compliance',
    resourceType: 'iam',
    category: 'security',
    config: {
      username: 'security-auditor',
      permissions: ['ReadOnlyAccess', 'SecurityAudit'],
      programmaticAccess: true,
      consoleAccess: true
    },
    tags: ['security', 'audit', 'compliance', 'read-only'],
    isPublic: true
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
      root_volume_type: 'io2',
      enable_ebs_encryption: true,
      enable_monitoring: true,
      enhanced_networking: true
    },
    tags: ['database', 'mysql', 'postgresql', 'high-memory'],
    isPublic: true
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
      root_volume_size: 30,
      root_volume_type: 'gp3',
      enable_ebs_encryption: true,
      user_data: '#!/bin/bash\ncurl -fsSL https://get.docker.com -o get-docker.sh\nsh get-docker.sh'
    },
    tags: ['docker', 'containers', 'microservices', 'kubernetes'],
    isPublic: true
  }
];

// Demo Notifications
const demoNotifications = [
  {
    type: 'deployment_success',
    title: 'Deployment Successful',
    message: 'Your EC2 instance "production-web-01" has been deployed successfully in us-east-1',
    priority: 'medium',
    read: false
  },
  {
    type: 'deployment_failed',
    title: 'Deployment Failed',
    message: 'Failed to deploy S3 bucket "test-bucket-123". Error: Bucket name already exists',
    priority: 'high',
    read: false
  },
  {
    type: 'limit_warning',
    title: 'Approaching Deployment Limit',
    message: 'You have used 85% of your monthly deployment limit (85/100). Consider upgrading your plan.',
    priority: 'medium',
    read: false
  },
  {
    type: 'deployment_started',
    title: 'Deployment Started',
    message: 'Starting deployment of IAM user "developer-access" in your AWS account',
    priority: 'low',
    read: true
  },
  {
    type: 'security_alert',
    title: 'Security Alert',
    message: 'Unusual login activity detected from IP 192.168.1.100. Please verify this was you.',
    priority: 'urgent',
    read: false
  },
  {
    type: 'member_added',
    title: 'New Team Member',
    message: 'John Doe (john@example.com) has been added to your organization as an Admin',
    priority: 'low',
    read: true
  },
  {
    type: 'subscription_expiring',
    title: 'Subscription Expiring Soon',
    message: 'Your Professional plan subscription will expire in 7 days. Renew now to avoid service interruption.',
    priority: 'high',
    read: false
  },
  {
    type: 'system',
    title: 'System Maintenance',
    message: 'Scheduled maintenance on Dec 10, 2024 from 2:00 AM - 4:00 AM UTC. Services may be temporarily unavailable.',
    priority: 'medium',
    read: true
  },
  {
    type: 'deployment_success',
    title: 'Template Deployment Complete',
    message: 'Successfully deployed "Production Web Server" template to us-west-2',
    priority: 'medium',
    read: false
  },
  {
    type: 'limit_reached',
    title: 'AWS Account Limit Reached',
    message: 'You have reached your maximum AWS account limit (3/3). Upgrade to add more accounts.',
    priority: 'high',
    read: false
  }
];

async function seedPhase4Demo() {
  try {
    console.log('🌱 Starting Phase 4 Demo Data Seeding...\n');
    console.log('='.repeat(60));
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get first user and organization
    const user = await User.findOne();
    if (!user) {
      console.log('❌ No users found. Please run the main seed script first.');
      await mongoose.connection.close();
      return;
    }
    
    const organization = await Organization.findById(user.organizationId);
    if (!organization) {
      console.log('❌ No organization found. Please run Phase 3A migration first.');
      await mongoose.connection.close();
      return;
    }
    
    console.log(`👤 Using user: ${user.email}`);
    console.log(`🏢 Using organization: ${organization.name}\n`);
    
    // Seed Templates
    console.log('📋 Seeding Templates...');
    console.log('-'.repeat(60));
    
    await Template.deleteMany({ organizationId: organization._id });
    
    let templateCount = 0;
    for (const templateData of demoTemplates) {
      const template = new Template({
        ...templateData,
        organizationId: organization._id,
        createdBy: user._id,
        usageCount: Math.floor(Math.random() * 50)
      });
      await template.save();
      templateCount++;
      console.log(`  ✅ Created: ${template.name} (${template.resourceType})`);
    }
    
    console.log(`\n✨ Created ${templateCount} demo templates\n`);
    
    // Seed Notifications
    console.log('🔔 Seeding Notifications...');
    console.log('-'.repeat(60));
    
    await Notification.deleteMany({ organizationId: organization._id });
    
    let notificationCount = 0;
    for (const notifData of demoNotifications) {
      const notification = new Notification({
        ...notifData,
        organizationId: organization._id,
        userId: user._id,
        createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) // Random time in last 7 days
      });
      await notification.save();
      notificationCount++;
      console.log(`  ✅ Created: ${notification.title} (${notification.type})`);
    }
    
    console.log(`\n✨ Created ${notificationCount} demo notifications\n`);
    
    // Seed Analytics Data
    console.log('📊 Seeding Analytics Data...');
    console.log('-'.repeat(60));
    
    await Analytics.deleteMany({ organizationId: organization._id });
    
    // Create analytics for last 30 days
    const today = new Date();
    let analyticsCount = 0;
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      // More deployments on weekdays
      const baseDeployments = isWeekend ? 5 : 15;
      const totalDeployments = baseDeployments + Math.floor(Math.random() * 10);
      const successRate = 0.85 + Math.random() * 0.1; // 85-95% success rate
      
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
          avgDeploymentTime: 120 + Math.floor(Math.random() * 180), // 2-5 minutes
          totalDeploymentTime: totalDeployments * (120 + Math.floor(Math.random() * 180)),
          estimatedCost: totalDeployments * (5 + Math.random() * 15) // $5-$20 per deployment
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
    
    console.log(`\n✨ Created ${analyticsCount} days of analytics data\n`);
    
    // Summary
    console.log('='.repeat(60));
    console.log('\n📈 Seeding Summary:');
    console.log(`  ✅ Templates: ${templateCount}`);
    console.log(`  ✅ Notifications: ${notificationCount}`);
    console.log(`  ✅ Analytics Days: ${analyticsCount}`);
    console.log('\n🎉 Phase 4 demo data seeded successfully!\n');
    
    console.log('🚀 You can now:');
    console.log('  1. Visit /analytics to see charts and metrics');
    console.log('  2. Visit /templates to browse demo templates');
    console.log('  3. Click the bell icon to see notifications\n');
    
    await mongoose.connection.close();
    console.log('👋 Database connection closed\n');
    
  } catch (error) {
    console.error('\n❌ Error seeding demo data:', error);
    process.exit(1);
  }
}

function generateHourlyData(totalDeployments) {
  const hourlyData = [];
  const deploymentsPerHour = totalDeployments / 24;
  
  for (let hour = 0; hour < 24; hour++) {
    // More deployments during business hours (9 AM - 5 PM)
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

// Run the seeder
seedPhase4Demo();
