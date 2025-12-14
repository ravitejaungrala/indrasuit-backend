import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import awsRoutes from './routes/aws.js';
import deployRoutes from './routes/deploy.js';
import devOtpRoutes from './routes/dev-otp.js';
import syncRoutes from './routes/sync.js';
import ec2Routes from './routes/ec2.js';
import organizationRoutes from './routes/organization.js';
import analyticsRoutes from './routes/analytics.js';
import templatesRoutes from './routes/templates.js';
import notificationsRoutes from './routes/notifications.js';
import applicationsRoutes from './routes/applications.js';
import chatbotRoutes from './routes/chatbot.js';

// Security middleware
import { apiLimiter } from './middleware/rateLimiter.js';
import { 
  helmetConfig, 
  mongoSanitizeConfig, 
  corsOptions,
  securityHeaders,
  requestSizeLimiter,
  preventParameterPollution,
  detectSuspiciousPatterns
} from './middleware/security.js';

// ==================== LOAD ENVIRONMENT VARIABLES ====================
// This MUST be called before any other code that uses process.env
dotenv.config();

console.log('🔧 ========== ENVIRONMENT CONFIGURATION ==========');
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : '⚠️ NOT SET!');
console.log('PORT:', process.env.PORT || 5000);
console.log('MONGODB_URI:', process.env.MONGODB_URI || 'not set');
console.log('================================================');

// Check for required environment variables
if (!process.env.JWT_SECRET) {
  console.error('❌ CRITICAL ERROR: JWT_SECRET is not set in environment variables!');
  console.error('   Please add JWT_SECRET to your .env file');
  console.error('   Example: JWT_SECRET=your_super_secure_jwt_secret_key_here');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Use MONGODB_URI from environment or fallback to local
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/flyhii-indrasuite';

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security Middleware (Applied FIRST)
app.use(helmetConfig); // Security headers
app.use(securityHeaders); // Additional security headers
app.use(requestSizeLimiter); // Limit request size
app.use(preventParameterPollution); // Prevent parameter pollution
app.use(detectSuspiciousPatterns); // Detect malicious patterns

// CORS - Use proper configuration with allowed origins
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB injection protection
app.use(mongoSanitizeConfig);

// Global rate limiter (100 requests per 15 minutes)
app.use('/api/', apiLimiter);

// MongoDB Connection
const connectDB = async () => {
  try {
    console.log(`🔗 Connecting to MongoDB: ${MONGODB_URI}`);
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
    });
    
    console.log('✅ MongoDB Connected');
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log(`🏷️  Host: ${mongoose.connection.host}`);
    console.log(`📁 Port: ${mongoose.connection.port}`);
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    
    console.log('\n⚠️  MongoDB Connection Failed!');
    console.log('📝 Possible issues:');
    console.log('   1. Check if MongoDB is running locally');
    console.log('   2. Verify MongoDB service is started');
    console.log('   3. Check MongoDB connection string format');
    
    // Platform-specific instructions
    console.log('\n📝 Start MongoDB locally:');
    console.log('   Windows: mongod  OR  net start MongoDB');
    console.log('   Mac:     brew services start mongodb-community  OR  mongod');
    console.log('   Linux:   sudo systemctl start mongodb  OR  mongod');
    console.log('\n📝 Connection Details:');
    console.log(`   URI: ${MONGODB_URI}`);
    
    // Don't exit, let the server run without DB for now
    console.log('⚠️  Server will continue running without database connection');
  }
};

connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/aws', awsRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/dev', devOtpRoutes); // Development only
app.use('/api/sync', syncRoutes); // AWS sync
app.use('/api/ec2', ec2Routes);
app.use('/api/organization', organizationRoutes); // Organization management
app.use('/api/analytics', analyticsRoutes); // Phase 4A - Analytics
app.use('/api/templates', templatesRoutes); // Phase 4B - Templates
app.use('/api/notifications', notificationsRoutes); // Phase 4C - Notifications
app.use('/api/applications', applicationsRoutes); // Application Deployment
app.use('/api/chatbot', chatbotRoutes); // AI Chatbot

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
    environment: process.env.NODE_ENV || 'development',
    jwtSecretConfigured: !!process.env.JWT_SECRET,
    port: PORT
  });
});

// Test JWT endpoint
app.get('/api/test-jwt', (req, res) => {
  const jwtSecret = process.env.JWT_SECRET;
  
  res.json({
    jwtSecretConfigured: !!jwtSecret,
    jwtSecretLength: jwtSecret ? jwtSecret.length : 0,
    message: jwtSecret ? 'JWT_SECRET is configured' : 'JWT_SECRET is missing',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'RaDynamics API Server - Cloud Infrastructure Automation Platform',
    version: '1.0.0',
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 JWT Secret: ${process.env.JWT_SECRET ? 'Configured' : '❌ NOT CONFIGURED!'}`);
  console.log(`🗄️  MongoDB: ${MONGODB_URI}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   • http://localhost:${PORT}/ - API status`);
  console.log(`   • http://localhost:${PORT}/api/health - Health check`);
  console.log(`   • http://localhost:${PORT}/api/test-jwt - JWT configuration test`);
  console.log(`   • http://localhost:${PORT}/api/auth/* - Authentication endpoints`);
  console.log(`   • http://localhost:${PORT}/api/dev/* - Development endpoints`);
});