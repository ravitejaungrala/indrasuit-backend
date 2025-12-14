import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Application from '../models/Application.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

async function fixDockerImageNames() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Finding applications with incorrect docker image names...');
    
    const applications = await Application.find({
      deploymentMethod: 'docker',
      'docker.image': { $regex: /^docker\s+pull\s+/i }
    });

    console.log(`Found ${applications.length} applications to fix\n`);

    for (const app of applications) {
      const oldImageName = app.docker.image;
      const newImageName = oldImageName.replace(/^docker\s+pull\s+/i, '').trim();
      
      console.log(`📝 Fixing application: ${app.name}`);
      console.log(`   Old: ${oldImageName}`);
      console.log(`   New: ${newImageName}`);
      
      app.docker.image = newImageName;
      await app.save();
      
      console.log(`   ✅ Fixed!\n`);
    }

    console.log('🎉 All applications fixed!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

fixDockerImageNames();
