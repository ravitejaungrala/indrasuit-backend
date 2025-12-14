import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Notification from './models/Notification.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const testNotifications = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    // Get all notifications
    const notifications = await Notification.find({}).sort({ createdAt: -1 }).limit(10);
    
    console.log(`Found ${notifications.length} notifications:\n`);
    
    notifications.forEach((notif, index) => {
      console.log(`${index + 1}. ${notif.title}`);
      console.log(`   Type: ${notif.type}`);
      console.log(`   User ID: ${notif.userId}`);
      console.log(`   Read: ${notif.read}`);
      console.log(`   Created: ${notif.createdAt}`);
      console.log('');
    });
    
    if (notifications.length === 0) {
      console.log('No notifications found. They will be created when you:');
      console.log('  1. Add an AWS account');
      console.log('  2. Deploy a resource (EC2 or S3)');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

testNotifications();
