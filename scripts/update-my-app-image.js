import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Application from '../models/Application.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

async function updateMyAppImage() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Finding "my-app" application...');
    
    const app = await Application.findOne({ name: 'my-app' });

    if (!app) {
      console.log('❌ Application "my-app" not found');
      return;
    }

    console.log('✅ Found application:', app.name);
    console.log('\n📝 Current configuration:');
    console.log('   Image:', app.docker.image);
    console.log('   Tag:', app.docker.tag);

    // Update to new image
    app.docker.image = 'flyhii/findjob';
    app.docker.tag = 'latest';
    app.status = 'pending';
    app.errorMessage = '';
    app.deploymentLogs = [`[${new Date().toISOString()}] Image updated to flyhii/findjob:latest`];
    
    await app.save();

    console.log('\n✅ Updated configuration:');
    console.log('   Image:', app.docker.image);
    console.log('   Tag:', app.docker.tag);
    console.log('   Status:', app.status);
    
    console.log('\n🎉 Application updated successfully!');
    console.log('👉 Now go to Applications page and click "Redeploy"');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

updateMyAppImage();
