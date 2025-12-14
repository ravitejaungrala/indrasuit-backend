http://localhost:3000/import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Testing MongoDB Connection...\n');
console.log('Connection String:', process.env.MONGODB_URI?.replace(/:[^:@]+@/, ':****@'));

async function testConnection() {
  try {
    console.log('\n⏳ Attempting to connect...');
    
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ MongoDB Connected Successfully!');
    console.log('📊 Database:', mongoose.connection.name);
    console.log('🌐 Host:', mongoose.connection.host);
    console.log('🔌 Port:', mongoose.connection.port);
    console.log('📝 Ready State:', mongoose.connection.readyState);
    
    // Test a simple query
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📚 Collections:', collections.map(c => c.name).join(', ') || 'None');
    
    await mongoose.disconnect();
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
    
  } catch (err) {
    console.error('\n❌ Connection Failed!');
    console.error('Error:', err.message);
    
    if (err.cause) {
      console.error('Cause:', err.cause);
    }
    
    if (err.stack) {
      console.error('\nStack Trace:');
      console.error(err.stack);
    }
    
    console.log('\n🔧 Troubleshooting Steps:');
    console.log('1. Check internet connection');
    console.log('2. Verify MongoDB Atlas credentials in .env file');
    console.log('3. Check IP whitelist in MongoDB Atlas:');
    console.log('   - Go to Network Access in MongoDB Atlas');
    console.log('   - Add IP Address: 0.0.0.0/0 (for testing)');
    console.log('4. Verify database user permissions');
    console.log('5. Check if cluster is active (not paused)');
    
    process.exit(1);
  }
}

testConnection();
