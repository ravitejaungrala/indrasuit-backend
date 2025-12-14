import mongoose from 'mongoose';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import OTP from '../models/OTP.js';
import Organization from '../models/Organization.js';
import { sendOTPEmail, generateOTP } from '../utils/emailService.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validateEmail, validateOTP } from '../middleware/validation.js';
import { auditLogger, logFailedAuth } from '../middleware/auditLogger.js';

const router = express.Router();

// Bcrypt configuration - optimized for Render
const BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS ? 
  parseInt(process.env.BCRYPT_ROUNDS) : 
  (process.env.NODE_ENV === 'production' ? 8 : 6);

console.log(`🔧 Bcrypt configuration: ${BCRYPT_ROUNDS} rounds`);

// Helper function for bcrypt with timeout
const bcryptCompareWithTimeout = async (plainPassword, hashedPassword) => {
  return new Promise((resolve, reject) => {
    // Set a 3-second timeout for bcrypt comparison (Render free tier can be slow)
    const timeout = setTimeout(() => {
      reject(new Error('Password comparison timeout - server is busy'));
    }, 3000);

    bcrypt.compare(plainPassword, hashedPassword, (err, result) => {
      clearTimeout(timeout);
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

// Sign Up - Step 1: Create account and send OTP
router.post('/signup', 
  authLimiter,
  validateEmail,
  auditLogger('signup', 'user'),
  async (req, res) => {
  try {
    const { email, password, name } = req.body;

    console.log(`📝 Signup attempt for: ${email}`);

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and password are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        error: 'Password must be at least 6 characters' 
      });
    }

    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ Database not connected');
      return res.status(500).json({ 
        success: false,
        error: 'Database connection error' 
      });
    }

    // Check if user exists - case insensitive
    const existingUser = await User.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') } 
    });
    
    if (existingUser) {
      console.log(`⚠️ User found: ${existingUser.email} (verified: ${existingUser.emailVerified})`);
      
      if (existingUser.emailVerified) {
        return res.status(200).json({ 
          success: false,
          error: 'An account with this email already exists. Please login.',
          code: 'USER_EXISTS_VERIFIED',
          needsLogin: true
        });
      } else {
        // User exists but not verified - let them continue with verification
        console.log(`🔄 Unverified user found, allowing verification`);
        
        const otp = generateOTP();
        
        try {
          // Delete existing OTPs
          await OTP.deleteMany({ email, type: 'signup' });
          
          // Save new OTP
          const otpRecord = new OTP({
            email,
            otp,
            type: 'signup',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
          });
          await otpRecord.save();
          
          console.log(`✅ OTP saved for ${email}`);
        } catch (otpError) {
          console.error('OTP save error:', otpError);
        }

        // Send OTP via email
        console.log(`📧 Sending Signup OTP to ${email}: ${otp}`);
        const emailSent = await sendOTPEmail(email, otp, 'signup');

        return res.status(200).json({
          success: true,
          message: emailSent ? 'Verification OTP sent to your email' : 'OTP generated. Check console/logs.',
          email,
          needsVerification: true,
          unverifiedUser: true,
          otp: process.env.NODE_ENV === 'development' ? otp : undefined
        });
      }
    }

    // Create new user with optimized bcrypt rounds
    console.log(`🔐 Hashing password with ${BCRYPT_ROUNDS} rounds...`);
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    
    // Create user but mark as unverified
    const user = new User({ 
      email: email.toLowerCase(), 
      password: hashedPassword,
      name: name || email.split('@')[0],
      emailVerified: false
    });

    try {
      await user.save();
      console.log(`✅ User created: ${email}`);
    } catch (saveError) {
      console.error('User save error:', saveError);
      
      if (saveError.code === 11000) {
        return res.status(200).json({
          success: false,
          error: 'Email already exists',
          code: 'DUPLICATE_EMAIL'
        });
      }
      return res.status(500).json({ 
        success: false,
        error: 'Failed to create user: ' + saveError.message
      });
    }

    // Generate OTP for signup verification
    const otp = generateOTP();

    try {
      // Delete existing OTPs
      await OTP.deleteMany({ email, type: 'signup' });
      
      // Save new OTP
      const otpRecord = new OTP({
        email,
        otp,
        type: 'signup',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });
      await otpRecord.save();
      console.log(`✅ OTP saved: ${email}`);
    } catch (otpError) {
      console.error('OTP save error:', otpError);
    }

    // Send OTP via email
    console.log(`📧 Sending Signup OTP to ${email}: ${otp}`);
    const emailSent = await sendOTPEmail(email, otp, 'signup');

    res.status(201).json({
      success: true,
      message: emailSent ? 'Account created! Please verify your email.' : 'Account created! OTP generated. Check console/logs.',
      email,
      otp: process.env.NODE_ENV === 'development' ? otp : undefined,
      nextStep: 'check_email'
    });
  } catch (error) {
    console.error('❌ Signup error:', error);
    
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify Signup OTP - Complete account creation
router.post('/verify-signup-otp', 
  authLimiter,
  validateOTP,
  auditLogger('signup_verified', 'user'),
  async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and OTP are required' 
      });
    }

    // Find user (case insensitive)
    const user = await User.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') } 
    });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found. Please sign up again.' 
      });
    }

    if (user.emailVerified) {
      return res.status(200).json({ 
        success: false,
        error: 'Account already verified. Please login.',
        needsLogin: true
      });
    }

    // Find valid OTP (case insensitive)
    const otpRecord = await OTP.findOne({
      email: { $regex: new RegExp(`^${email}$`, 'i') },
      otp,
      type: 'signup',
      verified: false,
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      // Check if OTP exists but expired
      const expiredOtp = await OTP.findOne({
        email: { $regex: new RegExp(`^${email}$`, 'i') },
        otp,
        type: 'signup',
        verified: false
      });
      
      if (expiredOtp) {
        return res.status(401).json({ 
          success: false,
          error: 'OTP has expired. Please request a new OTP.',
          code: 'OTP_EXPIRED'
        });
      }
      
      return res.status(401).json({ 
        success: false,
        error: 'Invalid OTP. Please check and try again.',
        code: 'INVALID_OTP'
      });
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    // Mark user as verified
    user.emailVerified = true;
    await user.save();

    // Create default organization for the user
    const organization = await Organization.createDefaultOrganization(
      user._id,
      user.name || user.email.split('@')[0],
      user.email
    );

    // Link user to organization
    user.organizationId = organization._id;
    user.defaultOrganizationId = organization._id;
    await user.save();

    console.log('\n✅ ========== SIGNUP COMPLETED ==========');
    console.log(`👤 New User: ${user.name} (${user.email})`);
    console.log(`🆔 User ID: ${user._id}`);
    console.log(`🏢 Organization: ${organization.name}`);
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log('========================================\n');

    res.json({
      success: true,
      message: 'Account verified successfully! You can now login.',
      user: { 
        id: user._id, 
        email: user.email,
        name: user.name,
        organizationId: organization._id
      },
      organization: {
        id: organization._id,
        name: organization.name,
        plan: organization.subscription.plan
      }
    });
  } catch (error) {
    console.error('❌ OTP verification error:', error);
    res.status(500).json({ 
      success: false,
      error: 'OTP verification failed'
    });
  }
});

// ==================== PASSWORD LOGIN ====================

// Step 1: Verify Password and Send OTP
router.post('/login', 
  authLimiter,
  validateEmail,
  auditLogger('password_login', 'user'),
  async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and password are required' 
      });
    }

    console.log(`🔐 Login attempt for: ${email}`);

    // Find user (case insensitive)
    const user = await User.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') } 
    });
    
    if (!user) {
      await logFailedAuth(email, req.ip, req.get('user-agent'), 'User not found');
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }

    // Check if user is verified
    if (!user.emailVerified) {
      return res.status(401).json({ 
        success: false,
        error: 'Please verify your email first by completing signup',
        needsVerification: true
      });
    }

    // Verify password with timeout
    console.log(`🔐 Verifying password for ${email}...`);
    const startTime = Date.now();
    
    let isValidPassword;
    try {
      isValidPassword = await bcryptCompareWithTimeout(password, user.password);
    } catch (bcryptError) {
      console.error(`❌ Bcrypt error: ${bcryptError.message}`);
      return res.status(500).json({
        success: false,
        error: 'Authentication server is busy. Please try again.',
        code: 'SERVER_BUSY'
      });
    }
    
    const endTime = Date.now();
    console.log(`⏱️  Bcrypt time: ${endTime - startTime}ms`);
    
    if (!isValidPassword) {
      await logFailedAuth(email, req.ip, req.get('user-agent'), 'Invalid password');
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }

    // Generate OTP for 2FA
    const otp = generateOTP();
    
    // Check if OTP was recently sent
    const recentOTP = await OTP.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') }, 
      type: 'login',
      createdAt: { $gt: new Date(Date.now() - 60 * 1000) }
    });

    if (recentOTP) {
      return res.status(429).json({ 
        success: false,
        error: 'OTP already sent. Please wait 1 minute.' 
      });
    }

    // Delete any existing login OTPs
    await OTP.deleteMany({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') }, 
      type: 'login' 
    });

    // Save new OTP
    await OTP.create({
      email: email.toLowerCase(),
      otp,
      type: 'login',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Send OTP via email
    console.log(`📧 Sending OTP for ${email}: ${otp}`);
    const emailSent = await sendOTPEmail(email, otp, 'login');

    // Generate temporary token for OTP verification step
    const tempToken = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        type: 'password_verified',
        step: 'pending_otp'
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    console.log('\n🔐 ========== PASSWORD VERIFIED ==========');
    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`📧 Email sent: ${emailSent ? 'Yes' : 'No (check logs for OTP)'}`);
    console.log(`⏰ Temp token generated`);
    console.log('===========================================\n');

    return res.json({
      success: true,
      message: emailSent ? 'Password verified. OTP sent to your email.' : 'Password verified. OTP generated. Check console/logs.',
      tempToken,
      email: user.email,
      nextStep: 'verify_otp',
      otp: process.env.NODE_ENV === 'development' ? otp : undefined
    });
  } catch (error) {
    console.error('❌ Password login error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Login failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Step 2: Verify OTP after Password
router.post('/verify-login-otp', 
  authLimiter,
  validateOTP,
  auditLogger('login', 'user'),
  async (req, res) => {
  try {
    const { email, otp, tempToken } = req.body;

    if (!email || !otp || !tempToken) {
      return res.status(400).json({ 
        success: false,
        error: 'Email, OTP and temporary token are required' 
      });
    }

    // Verify temp token
    let decodedTemp;
    try {
      decodedTemp = jwt.verify(tempToken, process.env.JWT_SECRET);
      if (decodedTemp.type !== 'password_verified' || decodedTemp.step !== 'pending_otp') {
        throw new Error('Invalid token type');
      }
    } catch (error) {
      return res.status(401).json({ 
        success: false,
        error: 'Session expired. Please login again.',
        code: 'SESSION_EXPIRED'
      });
    }

    // Find user (case insensitive)
    const user = await User.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') } 
    });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Check if user ID matches temp token
    if (user._id.toString() !== decodedTemp.userId) {
      return res.status(401).json({ 
        success: false,
        error: 'Session mismatch' 
      });
    }
    
    // Find valid OTP (case insensitive)
    const otpRecord = await OTP.findOne({
      email: { $regex: new RegExp(`^${email}$`, 'i') },
      otp,
      type: 'login',
      verified: false,
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      // Check if OTP exists but expired
      const expiredOtp = await OTP.findOne({
        email: { $regex: new RegExp(`^${email}$`, 'i') },
        otp,
        type: 'login',
        verified: false
      });
      
      if (expiredOtp) {
        return res.status(401).json({ 
          success: false,
          error: 'OTP has expired. Please request a new OTP.',
          code: 'OTP_EXPIRED'
        });
      }
      
      return res.status(401).json({ 
        success: false,
        error: 'Invalid OTP. Please check and try again.',
        code: 'INVALID_OTP'
      });
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    // Get user's organization
    const organization = await Organization.findById(user.defaultOrganizationId);

    // Generate final JWT token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        organizationId: user.defaultOrganizationId
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('\n✅ ========== LOGIN COMPLETED ==========');
    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🔑 Login Method: Password + OTP`);
    console.log(`🆔 User ID: ${user._id}`);
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log('======================================\n');

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: { 
        id: user._id, 
        email: user.email,
        name: user.name,
        profilePhoto: user.profilePhoto,
        organizationId: user.defaultOrganizationId
      },
      organization: organization ? {
        id: organization._id,
        name: organization.name,
        plan: organization.subscription.plan,
        role: organization.getMemberRole(user._id)
      } : null
    });
  } catch (error) {
    console.error('❌ OTP verification error:', error);
    res.status(500).json({ 
      success: false,
      error: 'OTP verification failed'
    });
  }
});

// Request OTP for OTP-only Login
router.post('/request-otp', 
  authLimiter,
  validateEmail,
  auditLogger('otp_requested', 'user'),
  async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        error: 'Email is required' 
      });
    }

    // Find user (case insensitive)
    const user = await User.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') } 
    });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found. Please sign up first.' 
      });
    }
    
    if (!user.emailVerified) {
      return res.status(401).json({ 
        success: false,
        error: 'Please verify your email first by completing signup',
        needsVerification: true
      });
    }
    
    // Generate OTP
    const otp = generateOTP();

    // Check if OTP was recently sent
    const recentOTP = await OTP.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') }, 
      type: 'login',
      createdAt: { $gt: new Date(Date.now() - 60 * 1000) }
    });

    if (recentOTP) {
      return res.status(429).json({ 
        success: false,
        error: 'OTP already sent. Please wait 1 minute.' 
      });
    }

    // Delete any existing login OTPs
    await OTP.deleteMany({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') }, 
      type: 'login' 
    });

    // Save new OTP
    await OTP.create({
      email: email.toLowerCase(),
      otp,
      type: 'login',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Send OTP via email
    console.log(`📧 Sending OTP to ${email}: ${otp}`);
    const emailSent = await sendOTPEmail(email, otp, 'login');

    res.json({ 
      success: true,
      message: emailSent ? 'OTP sent to your email' : 'OTP generated. Check console/logs.',
      email,
      otp: process.env.NODE_ENV === 'development' ? otp : undefined
    });
  } catch (error) {
    console.error('❌ Request OTP error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to send OTP'
    });
  }
});

// Verify OTP for OTP-only Login
router.post('/verify-otp', 
  authLimiter,
  validateOTP,
  auditLogger('login', 'user'),
  async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and OTP are required' 
      });
    }

    // Find user (case insensitive)
    const user = await User.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') } 
    });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Check if user is verified
    if (!user.emailVerified) {
      return res.status(401).json({ 
        success: false,
        error: 'Please verify your email first by completing signup',
        needsVerification: true
      });
    }
    
    // Find valid OTP (case insensitive)
    const otpRecord = await OTP.findOne({
      email: { $regex: new RegExp(`^${email}$`, 'i') },
      otp,
      type: 'login',
      verified: false,
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      // Check if OTP exists but expired
      const expiredOtp = await OTP.findOne({
        email: { $regex: new RegExp(`^${email}$`, 'i') },
        otp,
        type: 'login',
        verified: false
      });
      
      if (expiredOtp) {
        return res.status(401).json({ 
          success: false,
          error: 'OTP has expired. Please request a new OTP.',
          code: 'OTP_EXPIRED'
        });
      }
      
      return res.status(401).json({ 
        success: false,
        error: 'Invalid OTP. Please check and try again.',
        code: 'INVALID_OTP'
      });
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    // Get user's organization
    const organization = await Organization.findById(user.defaultOrganizationId);

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        organizationId: user.defaultOrganizationId
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('\n✅ ========== OTP LOGIN SUCCESS ==========');
    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🔑 Login Method: OTP Only`);
    console.log(`🆔 User ID: ${user._id}`);
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log('==========================================\n');

    res.json({
      success: true,
      token,
      user: { 
        id: user._id, 
        email: user.email,
        name: user.name,
        profilePhoto: user.profilePhoto,
        organizationId: user.defaultOrganizationId
      },
      organization: organization ? {
        id: organization._id,
        name: organization.name,
        plan: organization.subscription.plan,
        role: organization.getMemberRole(user._id)
      } : null,
      message: 'Login successful!'
    });
  } catch (error) {
    console.error('❌ OTP verification error:', error);
    res.status(500).json({ 
      success: false,
      error: 'OTP verification failed'
    });
  }
});

// Debug login endpoint
router.post('/debug-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log(`🔍 Debug login for: ${email}`);
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Find user
    const user = await User.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') } 
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`✅ User found: ${user.email}`);
    console.log(`🔑 Password hash exists: ${!!user.password}`);
    console.log(`✅ Email verified: ${user.emailVerified}`);
    
    // Test bcrypt comparison
    const startTime = Date.now();
    let isValid;
    try {
      isValid = await bcryptCompareWithTimeout(password, user.password);
    } catch (bcryptError) {
      console.error(`❌ Bcrypt timeout: ${bcryptError.message}`);
      return res.json({
        success: false,
        bcryptError: bcryptError.message,
        time: Date.now() - startTime
      });
    }
    
    const endTime = Date.now();
    
    console.log(`⏱️  Bcrypt time: ${endTime - startTime}ms`);
    console.log(`✅ Password valid: ${isValid}`);
    
    res.json({
      success: isValid,
      bcryptTime: endTime - startTime,
      userExists: true,
      emailVerified: user.emailVerified,
      message: isValid ? 'Password valid' : 'Password invalid'
    });
    
  } catch (error) {
    console.error('❌ Debug login error:', error.message);
    res.status(500).json({ 
      error: error.message,
      bcryptError: error.message.includes('timeout')
    });
  }
});

// Export router
export default router;
