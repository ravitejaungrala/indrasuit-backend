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
dotenv.config();

console.log('🔧 ========== ENVIRONMENT CONFIGURATION ==========');
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : '⚠️ NOT SET!');
console.log('PORT:', process.env.PORT || 5000);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set (hidden for security)' : '⚠️ NOT SET!');
console.log('BCRYPT_ROUNDS:', process.env.BCRYPT_ROUNDS || 'default');
console.log('EMAIL_SERVICE:', process.env.USE_RESEND === 'true' ? 'Resend' : 'SMTP/Console');
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

// Get MongoDB URI from environment
const MONGODB_URI = process.env.MONGODB_URI;

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security Middleware (Applied FIRST)
app.use(helmetConfig);
app.use(securityHeaders);
app.use(requestSizeLimiter);
app.use(preventParameterPollution);
app.use(detectSuspiciousPatterns);

// CORS
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB injection protection
app.use(mongoSanitizeConfig);

// Apply rate limiter only if not disabled
if (process.env.DISABLE_RATE_LIMIT !== 'true') {
  app.use('/api/', apiLimiter);
  console.log('✅ Rate limiting enabled');
} else {
  console.log('⚠️  Rate limiting disabled (DISABLE_RATE_LIMIT=true)');
}

// MongoDB Connection with retry logic
const connectDB = async () => {
  let retries = 3;
  
  while (retries > 0) {
    try {
      console.log(`🔗 Connecting to MongoDB (attempt ${4 - retries}/3)...`);
      
      // Log partial URI for debugging
      const uriForLog = MONGODB_URI.replace(/(mongodb\+srv:\/\/)([^:]+):([^@]+)/, (match, protocol, user, pass) => {
        return `${protocol}${user}:****@`;
      });
      console.log(`📊 Using MongoDB: ${uriForLog}`);
      
      // Modern connection options
      const connectionOptions = {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        retryWrites: true,
        w: 'majority',
        retryReads: true
      };
      
      await mongoose.connect(MONGODB_URI, connectionOptions);
      
      console.log('✅ MongoDB Connected Successfully!');
      console.log(`📊 Database: ${mongoose.connection.name}`);
      console.log(`🏷️  Host: ${mongoose.connection.host}`);
      console.log(`📁 Connection state: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
      
      // Verify connection
      await mongoose.connection.db.admin().ping();
      console.log('✅ MongoDB ping successful');
      
      // Connection event listeners
      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err.message);
      });
      
      mongoose.connection.on('disconnected', () => {
        console.log('⚠️  MongoDB disconnected');
      });
      
      mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected');
      });
      
      return;
      
    } catch (err) {
      retries--;
      
      if (err.name === 'MongoServerSelectionError') {
        console.error(`❌ MongoDB Server Selection Error: ${err.message}`);
      } else if (err.name === 'MongoNetworkError') {
        console.error(`❌ MongoDB Network Error: ${err.message}`);
      } else {
        console.error(`❌ MongoDB Connection Error: ${err.message}`);
      }
      
      if (retries > 0) {
        console.log(`⏳ Retrying in 5 seconds... (${retries} attempts remaining)`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.error('\n⚠️  MongoDB Connection Failed after 3 attempts!');
        console.log('\n📝 Debugging steps:');
        console.log('   1. Check MongoDB URI format');
        console.log('   2. Check IP whitelist in MongoDB Atlas');
        console.log('   3. Verify username and password');
        
        console.log('\n⚠️  Server will continue running without database connection');
        console.log('📝 API endpoints will work but database operations will fail');
      }
    }
  }
};

// Connect to MongoDB
connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/aws', awsRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/dev', devOtpRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/ec2', ec2Routes);
app.use('/api/organization', organizationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/chatbot', chatbotRoutes);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  let dbStatusText = 'unknown';
  let dbPing = false;
  
  switch(dbStatus) {
    case 0: dbStatusText = 'disconnected'; break;
    case 1: dbStatusText = 'connected'; break;
    case 2: dbStatusText = 'connecting'; break;
    case 3: dbStatusText = 'disconnecting'; break;
  }
  
  if (dbStatus === 1) {
    try {
      await mongoose.connection.db.admin().ping();
      dbPing = true;
    } catch (err) {
      dbPing = false;
    }
  }
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      status: dbStatusText,
      ping: dbPing,
      readyState: dbStatus,
      name: mongoose.connection.name,
      host: mongoose.connection.host
    },
    environment: process.env.NODE_ENV || 'development',
    bcryptRounds: process.env.BCRYPT_ROUNDS || 'default',
    emailService: process.env.USE_RESEND === 'true' ? 'Resend' : 'SMTP/Console',
    port: PORT,
    nodeVersion: process.version
  });
});

// Environment info endpoint
app.get('/api/env-info', (req, res) => {
  const envInfo = {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    mongoDbConfigured: !!process.env.MONGODB_URI,
    jwtSecretConfigured: !!process.env.JWT_SECRET,
    encryptionKeyConfigured: !!process.env.ENCRYPTION_KEY,
    bcryptRounds: process.env.BCRYPT_ROUNDS || 'default',
    useResend: process.env.USE_RESEND === 'true',
    allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').length + ' origins' : 'not set',
    disableRateLimit: process.env.DISABLE_RATE_LIMIT === 'true',
    nodeVersion: process.version,
    mongodbConnectionState: mongoose.connection.readyState
  };
  
  res.json(envInfo);
});

// Test email endpoint
app.get('/api/test-email', async (req, res) => {
  try {
    const email = req.query.email || 'test@example.com';
    const { sendOTPEmail, generateOTP } = await import('./utils/emailService.js');
    const otp = generateOTP();
    
    console.log(`📧 Testing email to: ${email}, OTP: ${otp}`);
    
    const emailSent = await sendOTPEmail(email, otp, 'login');
    
    res.json({
      success: true,
      emailSent,
      message: emailSent ? 'Email sent successfully' : 'Email failed, OTP logged to console',
      otp: otp,
      emailService: process.env.USE_RESEND === 'true' ? 'Resend' : 'SMTP/Console'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  const dbState = mongoose.connection.readyState;
  let dbStatus = 'unknown';
  
  switch(dbState) {
    case 0: dbStatus = '🔴 Disconnected'; break;
    case 1: dbStatus = '🟢 Connected'; break;
    case 2: dbStatus = '🟡 Connecting'; break;
    case 3: dbStatus = '🟠 Disconnecting'; break;
  }
  
  res.json({ 
    message: 'RaDynamics API Server - Cloud Infrastructure Automation Platform',
    version: '1.0.0',
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/*',
      testEmail: '/api/test-email?email=your@email.com'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err.message);
  
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }
  
  if (err.name === 'MongoError' || err.name === 'MongooseError') {
    return res.status(503).json({
      error: 'Database connection error',
      message: 'Please check MongoDB connection'
    });
  }
  
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

// Start server
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port: ${PORT}`);
  console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 JWT Secret: ${process.env.JWT_SECRET ? 'Configured ✓' : '❌ NOT CONFIGURED!'}`);
  console.log(`🗄️  MongoDB: ${process.env.MONGODB_URI ? 'Configured ✓' : '❌ NOT CONFIGURED!'}`);
  console.log(`🔑 Bcrypt Rounds: ${process.env.BCRYPT_ROUNDS || 'default'}`);
  console.log(`📧 Email Service: ${process.env.USE_RESEND === 'true' ? 'Resend API' : 'SMTP/Console'}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   • Health: http://localhost:${PORT}/api/health`);
  console.log(`   • Auth: http://localhost:${PORT}/api/auth/*`);
  console.log(`   • Test Email: http://localhost:${PORT}/api/test-email?email=test@example.com`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});
