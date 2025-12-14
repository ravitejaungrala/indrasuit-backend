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
        await sendOTPEmail(email, otp, 'signup');

        return res.status(200).json({
          success: true,
          message: 'Verification OTP sent to your email',
          email,
          needsVerification: true,
          unverifiedUser: true
        });
      }
    }

    // Create new user
    const saltRounds = process.env.NODE_ENV === 'development' ? 6 : 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
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
    await sendOTPEmail(email, otp, 'signup');

    res.status(201).json({
      success: true,
      message: 'Account created! Please verify your email.',
      email,
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

    // Enhanced logging for signup completion
    console.log('\n✅ ========== SIGNUP COMPLETED ==========');
    console.log(`👤 New User: ${user.name} (${user.email})`);
    console.log(`🆔 User ID: ${user._id}`);
    console.log(`🏢 Organization: ${organization.name}`);
    console.log(`🌐 IP Address: ${req.ip || req.connection.remoteAddress}`);
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log(`📧 Email Verified: Yes`);
    console.log('========================================\n');

    res.json({
      success: true,
      message: 'Account verified successfully! You can now login with your email and password.',
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
      error: 'OTP verification failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Resend Signup OTP
router.post('/resend-signup-otp',
  authLimiter,
  validateEmail,
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
        error: 'User not found' 
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({ 
        success: false,
        error: 'Account already verified' 
      });
    }

    // Generate new OTP
    const otp = generateOTP();

    // Delete any existing signup OTPs for this email
    await OTP.deleteMany({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') }, 
      type: 'signup' 
    });

    // Save new OTP
    await OTP.create({
      email: email.toLowerCase(),
      otp,
      type: 'signup',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Send OTP via email
    console.log(`📧 Resending Signup OTP to ${email}: ${otp}`);
    const emailSent = await sendOTPEmail(email, otp, 'signup');

    res.json({
      success: true,
      message: emailSent ? 
        'New OTP sent to your email' : 
        'New OTP generated. Check console for OTP.',
      email
    });
  } catch (error) {
    console.error('❌ Resend OTP error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to resend OTP'
    });
  }
});

// ==================== PASSWORD LOGIN WITH MANDATORY OTP ====================

// Step 1: Verify Password and Send OTP (MANDATORY for all users)
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

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await logFailedAuth(email, req.ip, req.get('user-agent'), 'Invalid password');
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }

    // ==================== MANDATORY OTP FOR ALL USERS ====================
    // Generate OTP for 2FA (MANDATORY)
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
    console.log(`📧 Sending OTP for password login to ${email}: ${otp}`);
    await sendOTPEmail(email, otp, 'login');

    // Generate temporary token for OTP verification step
    const tempToken = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        type: 'password_verified',
        step: 'pending_otp'
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' } // 10 minutes for OTP entry
    );

    console.log('\n🔐 ========== PASSWORD VERIFIED (OTP SENT) ==========');
    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🔑 Login Step: Password verified, OTP sent`);
    console.log(`⏰ Temp token generated for OTP step`);
    console.log('=====================================================\n');

    return res.json({
      success: true,
      message: 'Password verified. OTP sent to your email.',
      tempToken,
      email: user.email,
      nextStep: 'verify_otp'
    });
  } catch (error) {
    console.error('❌ Password login error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Login failed'
    });
  }
});

// Step 2: Verify OTP after Password (MANDATORY for all users)
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
    console.log(`🔑 Login Method: Password + OTP (2FA)`);
    console.log(`🆔 User ID: ${user._id}`);
    console.log(`🌐 IP Address: ${req.ip || req.connection.remoteAddress}`);
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

// Request OTP for OTP-only Login (Separate from password login)
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

    // Check if OTP was recently sent (prevent spam)
    const recentOTP = await OTP.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') }, 
      type: 'login',
      createdAt: { $gt: new Date(Date.now() - 60 * 1000) } // Within last 1 minute
    });

    if (recentOTP) {
      return res.status(429).json({ 
        success: false,
        error: 'OTP already sent. Please wait 1 minute before requesting again.' 
      });
    }

    // Delete any existing login OTPs for this email
    await OTP.deleteMany({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') }, 
      type: 'login' 
    });

    // Save new OTP
    await OTP.create({
      email: email.toLowerCase(),
      otp,
      type: 'login',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    });

    // Send OTP via email
    console.log(`📧 Sending OTP-only login OTP to ${email}: ${otp}`);
    await sendOTPEmail(email, otp, 'login');

    res.json({ 
      success: true,
      message: 'OTP sent to your email', 
      email,
      note: 'Check console logs if email not received'
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

    console.log('\n✅ ========== OTP-ONLY LOGIN SUCCESS ==========');
    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🔑 Login Method: OTP Only`);
    console.log(`🆔 User ID: ${user._id}`);
    console.log(`🌐 IP Address: ${req.ip || req.connection.remoteAddress}`);
    console.log(`🕐 Time: ${new Date().toLocaleString()}`);
    console.log('==============================================\n');

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

// Forgot Password - Request OTP
router.post('/forgot-password', async (req, res) => {
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
      // Don't reveal if user exists or not for security
      return res.json({ 
        success: true,
        message: 'If the email exists, an OTP has been sent' 
      });
    }

    // Generate OTP
    const otp = generateOTP();

    // Delete any existing reset OTPs for this email
    await OTP.deleteMany({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') }, 
      type: 'reset' 
    });

    // Save new OTP
    await OTP.create({
      email: email.toLowerCase(),
      otp,
      type: 'reset',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Send OTP via email
    await sendOTPEmail(email, otp, 'reset');

    res.json({ 
      success: true,
      message: 'If the email exists, an OTP has been sent', 
      email 
    });
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to process request'
    });
  }
});

// Reset Password with OTP
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ 
        success: false,
        error: 'Email, OTP, and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false,
        error: 'Password must be at least 6 characters' 
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

    // Find valid OTP (case insensitive)
    const otpRecord = await OTP.findOne({
      email: { $regex: new RegExp(`^${email}$`, 'i') },
      otp,
      type: 'reset',
      verified: false,
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid or expired OTP' 
      });
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    // Update password
    const saltRounds = process.env.NODE_ENV === 'development' ? 6 : 10;
    user.password = await bcrypt.hash(newPassword, saltRounds);
    await user.save();

    res.json({ 
      success: true,
      message: 'Password reset successfully' 
    });
  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to reset password'
    });
  }
});

// Get Profile
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    res.json({ 
      success: true,
      user 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Update Profile
router.put('/profile', 
  auditLogger('profile_updated', 'profile'),
  async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { name, email, currentPassword, newPassword, profilePhoto } = req.body;

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Update basic info
    if (name !== undefined) user.name = name;
    if (profilePhoto !== undefined) user.profilePhoto = profilePhoto;

    // Update email if changed
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(409).json({ 
          success: false,
          error: 'Email already in use' 
        });
      }
      user.email = email.toLowerCase();
    }

    // Update password if provided
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ 
          success: false,
          error: 'Current password required' 
        });
      }

      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ 
          success: false,
          error: 'Current password is incorrect' 
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ 
          success: false,
          error: 'New password must be at least 6 characters' 
        });
      }

      const saltRounds = process.env.NODE_ENV === 'development' ? 6 : 10;
      user.password = await bcrypt.hash(newPassword, saltRounds);
    }

    await user.save();

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        profilePhoto: user.profilePhoto
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Refresh Token - Extend session without re-login
router.post('/refresh-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        success: false,
        error: 'Token required' 
      });
    }
    
    // Verify the old token (even if expired)
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      // If token is expired, try to decode it anyway to get user info
      if (error.name === 'TokenExpiredError') {
        decoded = jwt.decode(token);
      } else {
        return res.status(401).json({ 
          success: false,
          error: 'Invalid token' 
        });
      }
    }
    
    // Get user from database
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Generate new token with 30 days expiration
    const newToken = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        organizationId: user.defaultOrganizationId || user.organizationId
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({
      success: true,
      token: newToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        profilePhoto: user.profilePhoto
      },
      message: 'Token refreshed successfully'
    });
    
  } catch (error) {
    console.error('❌ Token refresh error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to refresh token' 
    });
  }
});

// Verify Token - Check if token is still valid
router.post('/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        success: false,
        error: 'Token required' 
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    res.json({
      success: true,
      valid: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        profilePhoto: user.profilePhoto
      }
    });
    
  } catch (error) {
    res.status(401).json({ 
      success: false,
      valid: false, 
      error: 'Invalid or expired token' 
    });
  }
});

// Get Authentication Logs (Admin/Development endpoint)
router.get('/logs', 
  authLimiter,
  async (req, res) => {
  try {
    const { limit = 50, action, status, hours = 24 } = req.query;
    
    // Build query
    const query = {
      action: { 
        $in: ['login', 'signup', 'signup_verified', 'otp_requested', 'login_failed', 'password_login'] 
      }
    };
    
    // Filter by specific action
    if (action) {
      query.action = action;
    }
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by time range
    if (hours) {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      query.timestamp = { $gte: since };
    }
    
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .select('-__v');
    
    // Get summary statistics
    const stats = await AuditLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          successCount: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
          },
          failureCount: {
            $sum: { $cond: [{ $eq: ['$status', 'failure'] }, 1, 0] }
          }
        }
      }
    ]);
    
    res.json({
      success: true,
      logs,
      stats,
      total: logs.length,
      timeRange: `Last ${hours} hours`,
      filters: { action, status, limit }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get Recent Login Activity
router.get('/recent-activity', 
  authLimiter,
  async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const recentLogins = await AuditLog.find({
      action: { $in: ['login', 'password_login'] },
      status: 'success'
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .select('userEmail action timestamp ipAddress details')
    .lean();
    
    const formattedActivity = recentLogins.map(log => ({
      email: log.userEmail,
      method: log.action === 'password_login' ? 'Password' : 'OTP',
      time: log.timestamp,
      ipAddress: log.ipAddress,
      timeAgo: getTimeAgo(log.timestamp)
    }));
    
    res.json({
      success: true,
      recentActivity: formattedActivity,
      total: formattedActivity.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Helper function to calculate time ago
function getTimeAgo(timestamp) {
  const now = new Date();
  const diff = now - new Date(timestamp);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

export default router;