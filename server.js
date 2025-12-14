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
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set (hidden for security)' : '⚠️ NOT SET!');
console.log('================================================');

// Check for required environment variables
const requiredEnvVars = ['JWT_SECRET', 'MONGODB_URI', 'ENCRYPTION_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ CRITICAL ERROR: Missing required environment variables:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\n📝 Please add these to your environment variables');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Get MongoDB URI from environment (required)
const MONGODB_URI = process.env.MONGODB_URI;

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
    console.log('🔗 Connecting to MongoDB...');
    
    // Log partial URI for debugging (without password)
    const uriForLog = MONGODB_URI.replace(/(mongodb\+srv:\/\/)([^:]+):([^@]+)/, (match, protocol, user, pass) => {
      return `${protocol}${user}:****@`;
    });
    console.log(`📊 Using MongoDB: ${uriForLog}`);
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
    });
    
    console.log('✅ MongoDB Connected');
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log(`🏷️  Host: ${mongoose.connection.host}`);
    console.log(`📁 Port: ${mongoose.connection.port || 'default'}`);
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    
    console.log('\n⚠️  MongoDB Connection Failed!');
    console.log('📝 Possible issues:');
    console.log('   1. Check MongoDB connection string format');
    console.log('   2. Verify network access to MongoDB Atlas');
    console.log('   3. Check if IP is whitelisted in MongoDB Atlas');
    console.log('   4. Verify username and password');
    
    console.log('\n📝 For Render deployment:');
    console.log('   1. Go to Dashboard -> Your Service -> Environment');
    console.log('   2. Add MONGODB_URI with your connection string');
    console.log('   3. Make sure Render IP is whitelisted in MongoDB Atlas');
    
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
    mongoDbConfigured: !!process.env.MONGODB_URI,
    port: PORT,
    nodeVersion: process.version
  });
});

// Environment info endpoint (for debugging)
app.get('/api/env-info', (req, res) => {
  // Return environment info without sensitive data
  const envInfo = {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    mongoDbConfigured: !!process.env.MONGODB_URI,
    jwtSecretConfigured: !!process.env.JWT_SECRET,
    encryptionKeyConfigured: !!process.env.ENCRYPTION_KEY,
    allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').length + ' origins' : 'not set',
    terraformDir: process.env.TERRAFORM_WORKSPACE_DIR,
    disableRateLimit: process.env.DISABLE_RATE_LIMIT === 'true',
    emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD),
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
    nodeVersion: process.version,
    platform: process.platform
  };
  
  res.json(envInfo);
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'RaDynamics API Server - Cloud Infrastructure Automation Platform',
    version: '1.0.0',
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    documentation: {
      health: '/api/health',
      envInfo: '/api/env-info',
      auth: '/api/auth/*',
      deploy: '/api/deploy/*',
      aws: '/api/aws/*'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err.message);
  console.error(err.stack);
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port: ${PORT}`);
  console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 JWT Secret: ${process.env.JWT_SECRET ? 'Configured ✓' : '❌ NOT CONFIGURED!'}`);
  console.log(`🗄️  MongoDB: ${process.env.MONGODB_URI ? 'Configured ✓' : '❌ NOT CONFIGURED!'}`);
  console.log(`🔑 Encryption Key: ${process.env.ENCRYPTION_KEY ? 'Configured ✓' : '❌ NOT CONFIGURED!'}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   • Health check: /api/health`);
  console.log(`   • Environment info: /api/env-info`);
  console.log(`   • Authentication: /api/auth/*`);
  console.log(`   • Deployment: /api/deploy/*`);
  console.log(`   • AWS: /api/aws/*`);
  console.log(`\n⚠️  NOTE: For production, ensure all environment variables are properly set!`);
});
