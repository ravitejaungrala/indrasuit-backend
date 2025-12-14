import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';
import AWSAccount from './models/AWSAccount.js';
import Deployment from './models/Deployment.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/radynamics';

// Demo user credentials
const DEMO_USER = {
  email: 'bonthuyaswanth@gmail.com',
  password: 'Yassu@123',
  name: 'Yaswanth Bonthu'
};

// Demo AWS Accounts
const demoAccounts = [
  {
    organizationName: 'Production',
    accountName: 'Production Main',
    accountId: '123456789012',
    accountType: 'production',
    accessKey: 'AKIAIOSFODNN7EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    description: 'Main production environment for critical workloads',
    tags: ['production', 'critical', 'main'],
    verified: true,
    isPrimary: true
  },
  {
    organizationName: 'Production',
    accountName: 'Production Backup',
    accountId: '123456789013',
    accountType: 'production',
    accessKey: 'AKIAIOSFODNN8EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKE2',
    region: 'us-west-2',
    description: 'Backup production environment for disaster recovery',
    tags: ['production', 'backup', 'dr'],
    verified: true,
    isPrimary: false
  },
  {
    organizationName: 'Development',
    accountName: 'Dev Environment',
    accountId: '234567890123',
    accountType: 'development',
    accessKey: 'AKIAIOSFODNN9EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKE3',
    region: 'us-east-1',
    description: 'Development and testing environment',
    tags: ['development', 'testing'],
    verified: true,
    isPrimary: false
  },
  {
    organizationName: 'Development',
    accountName: 'QA Environment',
    accountId: '234567890124',
    accountType: 'development',
    accessKey: 'AKIAIOSFODNN0EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKE4',
    region: 'eu-west-1',
    description: 'Quality assurance and staging environment',
    tags: ['qa', 'staging'],
    verified: true,
    isPrimary: false
  },
  {
    organizationName: 'Testing Account',
    accountName: 'Testing Account',
    accountId: '345678901234',
    accountType: 'development',
    accessKey: 'AKIAIOSFODNN1EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKE5',
    region: 'ap-south-1',
    description: 'Isolated testing account for experiments',
    tags: ['testing', 'sandbox'],
    verified: true,
    isPrimary: false
  },
  {
    organizationName: 'Personal Projects',
    accountName: 'Personal Projects',
    accountId: '456789012345',
    accountType: 'development',
    accessKey: 'AKIAIOSFODNN2EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKE6',
    region: 'us-east-1',
    description: 'Personal development projects and learning',
    tags: ['personal', 'learning'],
    verified: true,
    isPrimary: false
  }
];

// Demo Deployments
const createDemoDeployments = (userId, accountIds) => [
  {
    userId,
    awsAccountId: accountIds[0],
    resourceType: 'ec2',
    resourceName: 'web-server-prod-01',
    status: 'completed',
    config: {
      instanceType: 't3.medium',
      ami: 'ami-0c55b159cbfafe1f0',
      keyName: 'prod-key',
      region: 'us-east-1',
      securityGroups: ['sg-0123456789abcdef0']
    },
    terraformOutput: JSON.stringify({
      instanceId: 'i-0123456789abcdef0',
      publicIp: '54.123.45.67',
      privateIp: '10.0.1.25'
    }),
    createdAt: new Date('2024-12-01T10:30:00Z'),
    updatedAt: new Date('2024-12-01T10:35:00Z')
  },
  {
    userId,
    awsAccountId: accountIds[0],
    resourceType: 'ec2',
    resourceName: 'api-server-prod',
    status: 'completed',
    config: {
      instanceType: 't3.large',
      ami: 'ami-0c55b159cbfafe1f0',
      keyName: 'prod-key',
      region: 'us-east-1'
    },
    terraformOutput: JSON.stringify({
      instanceId: 'i-0987654321fedcba0',
      publicIp: '54.234.56.78',
      privateIp: '10.0.1.50'
    }),
    createdAt: new Date('2024-12-02T14:20:00Z'),
    updatedAt: new Date('2024-12-02T14:25:00Z')
  },
  {
    userId,
    awsAccountId: accountIds[0],
    resourceType: 's3',
    resourceName: 'prod-data-bucket-2024',
    status: 'completed',
    config: {
      bucketName: 'prod-data-bucket-2024',
      versioning: true,
      encryption: true,
      isPublic: false,
      region: 'us-east-1'
    },
    terraformOutput: JSON.stringify({
      bucketName: 'prod-data-bucket-2024',
      bucketArn: 'arn:aws:s3:::prod-data-bucket-2024',
      bucketUrl: 'https://prod-data-bucket-2024.s3.amazonaws.com'
    }),
    createdAt: new Date('2024-11-28T09:15:00Z'),
    updatedAt: new Date('2024-11-28T09:16:00Z')
  },
  {
    userId,
    awsAccountId: accountIds[1],
    resourceType: 's3',
    resourceName: 'backup-storage-west',
    status: 'completed',
    config: {
      bucketName: 'backup-storage-west',
      versioning: true,
      encryption: true,
      isPublic: false,
      region: 'us-west-2'
    },
    terraformOutput: JSON.stringify({
      bucketName: 'backup-storage-west',
      bucketArn: 'arn:aws:s3:::backup-storage-west'
    }),
    createdAt: new Date('2024-11-30T16:45:00Z'),
    updatedAt: new Date('2024-11-30T16:46:00Z')
  },
  {
    userId,
    awsAccountId: accountIds[2],
    resourceType: 'ec2',
    resourceName: 'dev-test-server',
    status: 'completed',
    config: {
      instanceType: 't2.micro',
      ami: 'ami-0c55b159cbfafe1f0',
      region: 'us-east-1'
    },
    terraformOutput: JSON.stringify({
      instanceId: 'i-0abcdef123456789',
      publicIp: '3.45.67.89',
      privateIp: '10.0.2.10'
    }),
    createdAt: new Date('2024-12-03T11:00:00Z'),
    updatedAt: new Date('2024-12-03T11:05:00Z')
  },
  {
    userId,
    awsAccountId: accountIds[2],
    resourceType: 'iam',
    resourceName: 'dev-user-john',
    status: 'completed',
    config: {
      username: 'dev-user-john',
      policies: ['ReadOnlyAccess'],
      region: 'us-east-1'
    },
    terraformOutput: JSON.stringify({
      username: 'dev-user-john',
      arn: 'arn:aws:iam::234567890123:user/dev-user-john',
      accessKeyId: 'AKIAIOSFODNN3EXAMPLE'
    }),
    createdAt: new Date('2024-12-04T08:30:00Z'),
    updatedAt: new Date('2024-12-04T08:31:00Z')
  },
  {
    userId,
    awsAccountId: accountIds[3],
    resourceType: 'ec2',
    resourceName: 'qa-staging-server',
    status: 'pending',
    config: {
      instanceType: 't3.small',
      ami: 'ami-0d71ea30463e0ff8d',
      region: 'eu-west-1'
    },
    createdAt: new Date('2024-12-05T13:20:00Z'),
    updatedAt: new Date('2024-12-05T13:20:00Z')
  },
  {
    userId,
    awsAccountId: accountIds[4],
    resourceType: 's3',
    resourceName: 'test-experiment-bucket',
    status: 'failed',
    config: {
      bucketName: 'test-experiment-bucket',
      versioning: false,
      encryption: true,
      region: 'ap-south-1'
    },
    errorLog: 'Bucket name already exists in another account',
    createdAt: new Date('2024-12-04T15:00:00Z'),
    updatedAt: new Date('2024-12-04T15:01:00Z')
  },
  {
    userId,
    awsAccountId: accountIds[5],
    resourceType: 'ec2',
    resourceName: 'personal-learning-vm',
    status: 'completed',
    config: {
      instanceType: 't2.micro',
      ami: 'ami-0c55b159cbfafe1f0',
      region: 'us-east-1'
    },
    terraformOutput: JSON.stringify({
      instanceId: 'i-0fedcba987654321',
      publicIp: '18.234.56.78',
      privateIp: '10.0.3.15'
    }),
    createdAt: new Date('2024-12-01T20:00:00Z'),
    updatedAt: new Date('2024-12-01T20:05:00Z')
  },
  {
    userId,
    awsAccountId: accountIds[0],
    resourceType: 'iam',
    resourceName: 'prod-admin-user',
    status: 'completed',
    config: {
      username: 'prod-admin-user',
      policies: ['AdministratorAccess'],
      region: 'us-east-1'
    },
    terraformOutput: JSON.stringify({
      username: 'prod-admin-user',
      arn: 'arn:aws:iam::123456789012:user/prod-admin-user',
      accessKeyId: 'AKIAIOSFODNN4EXAMPLE'
    }),
    createdAt: new Date('2024-11-25T10:00:00Z'),
    updatedAt: new Date('2024-11-25T10:01:00Z')
  }
];

async function seedDemoData() {
  try {
    console.log('🌱 Starting demo data seeding...');
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if user already exists
    let user = await User.findOne({ email: DEMO_USER.email });
    
    if (!user) {
      // Create user
      const hashedPassword = await bcrypt.hash(DEMO_USER.password, 10);
      user = await User.create({
        email: DEMO_USER.email,
        password: hashedPassword,
        name: DEMO_USER.name,
        profilePhoto: ''
      });
      console.log('✅ Created demo user:', DEMO_USER.email);
    } else {
      console.log('ℹ️  User already exists:', DEMO_USER.email);
      
      // Clear existing data for this user
      await AWSAccount.deleteMany({ userId: user._id });
      await Deployment.deleteMany({ userId: user._id });
      console.log('🗑️  Cleared existing AWS accounts and deployments');
    }

    // Create AWS Accounts
    const createdAccounts = [];
    for (const accountData of demoAccounts) {
      const account = await AWSAccount.create({
        ...accountData,
        userId: user._id
      });
      createdAccounts.push(account);
      console.log(`✅ Created AWS account: ${account.accountName}`);
    }

    // Create Deployments
    const accountIds = createdAccounts.map(acc => acc._id);
    const deployments = createDemoDeployments(user._id, accountIds);
    
    for (const deploymentData of deployments) {
      await Deployment.create(deploymentData);
      console.log(`✅ Created deployment: ${deploymentData.resourceName} (${deploymentData.status})`);
    }

    console.log('\n🎉 Demo data seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   User: ${DEMO_USER.email}`);
    console.log(`   Password: ${DEMO_USER.password}`);
    console.log(`   AWS Accounts: ${createdAccounts.length}`);
    console.log(`   Deployments: ${deployments.length}`);
    console.log('\n✨ You can now login and see all the demo data!');

  } catch (error) {
    console.error('❌ Error seeding demo data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run the seed function
seedDemoData();
