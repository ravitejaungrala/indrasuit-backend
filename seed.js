import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';
import AWSAccount from './models/AWSAccount.js';
import Deployment from './models/Deployment.js';

dotenv.config();

const seedDatabase = async () => {
  try {
    console.log('🌱 Seeding database...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await AWSAccount.deleteMany({});
    await Deployment.deleteMany({});
    console.log('🗑️  Cleared existing data');

    // Create demo user
    const hashedPassword = await bcrypt.hash('demo123', 10);
    const demoUser = await User.create({
      email: 'demo@flyterraform.com',
      password: hashedPassword
    });
    console.log('✅ Created demo user: demo@flyterraform.com / demo123');

    // Create demo AWS account
    const demoAWSAccount = await AWSAccount.create({
      userId: demoUser._id,
      accessKey: 'DEMO_ACCESS_KEY_XXXXXXXXXX',
      secretKey: 'DEMO_SECRET_KEY_XXXXXXXXXX',
      region: 'us-east-1',
      verified: true
    });
    console.log('✅ Created demo AWS account');

    // Create sample deployments
    const deployments = [
      {
        userId: demoUser._id,
        awsAccountId: demoAWSAccount._id,
        resourceType: 'ec2',
        resourceName: 'demo-web-server',
        config: {
          instanceName: 'demo-web-server',
          instanceType: 't2.micro',
          amiId: 'ami-0c55b159cbfafe1f0',
          securityGroups: ['sg-0123456789abcdef0'],
          keyPair: 'demo-keypair'
        },
        status: 'completed',
        terraformOutput: 'Apply complete! Resources: 1 added, 0 changed, 0 destroyed.\n\nOutputs:\ninstance_id = "i-0123456789abcdef0"\npublic_ip = "54.123.45.67"',
        workspaceId: 'demo-workspace-1',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      },
      {
        userId: demoUser._id,
        awsAccountId: demoAWSAccount._id,
        resourceType: 's3',
        resourceName: 'demo-storage-bucket',
        config: {
          bucketName: 'demo-storage-bucket',
          isPublic: false,
          versioning: true,
          encryption: true
        },
        status: 'completed',
        terraformOutput: 'Apply complete! Resources: 4 added, 0 changed, 0 destroyed.\n\nOutputs:\nbucket_name = "demo-storage-bucket"\nbucket_arn = "arn:aws:s3:::demo-storage-bucket"',
        workspaceId: 'demo-workspace-2',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      },
      {
        userId: demoUser._id,
        awsAccountId: demoAWSAccount._id,
        resourceType: 'iam',
        resourceName: 'demo-developer',
        config: {
          username: 'demo-developer',
          permissions: 'PowerUserAccess'
        },
        status: 'completed',
        terraformOutput: 'Apply complete! Resources: 2 added, 0 changed, 0 destroyed.\n\nOutputs:\nuser_name = "demo-developer"\nuser_arn = "arn:aws:iam::123456789012:user/demo-developer"',
        workspaceId: 'demo-workspace-3',
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
        updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000)
      },
      {
        userId: demoUser._id,
        awsAccountId: demoAWSAccount._id,
        resourceType: 'ec2',
        resourceName: 'demo-database-server',
        config: {
          instanceName: 'demo-database-server',
          instanceType: 't2.small',
          amiId: 'ami-0c55b159cbfafe1f0',
          securityGroups: ['sg-0987654321fedcba0'],
          keyPair: 'demo-keypair'
        },
        status: 'pending',
        workspaceId: 'demo-workspace-4',
        createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        updatedAt: new Date(Date.now() - 30 * 60 * 1000)
      },
      {
        userId: demoUser._id,
        awsAccountId: demoAWSAccount._id,
        resourceType: 's3',
        resourceName: 'demo-backup-bucket',
        config: {
          bucketName: 'demo-backup-bucket',
          isPublic: false,
          versioning: true,
          encryption: true
        },
        status: 'failed',
        errorLog: 'Error: BucketAlreadyExists: The requested bucket name is not available. The bucket namespace is shared by all users of the system. Please select a different name and try again.',
        workspaceId: 'demo-workspace-5',
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
        updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000)
      }
    ];

    await Deployment.insertMany(deployments);
    console.log('✅ Created 5 sample deployments');

    console.log('\n🎉 Database seeded successfully!\n');
    console.log('📝 Demo Credentials:');
    console.log('   Email: demo@flyterraform.com');
    console.log('   Password: demo123\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    if (error.message.includes('ECONNREFUSED') || error.message.includes('MongooseServerSelectionError')) {
      console.log('\n⚠️  MongoDB is not running!');
      console.log('📝 Please start MongoDB first:');
      console.log('   Windows: net start MongoDB  OR  mongod');
      console.log('   Mac:     brew services start mongodb-community  OR  mongod');
      console.log('   Linux:   sudo systemctl start mongodb  OR  mongod\n');
    }
    process.exit(1);
  }
};

seedDatabase();
