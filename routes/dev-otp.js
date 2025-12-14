import express from 'express';
import OTP from '../models/OTP.js';

const router = express.Router();

// Development only - Get latest OTP for an email
router.get('/latest-otp/:email', async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Not available in production' });
    }

    const { email } = req.params;
    
    // Get the latest OTP (either login or signup)
    const latestOTP = await OTP.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') },
      verified: false,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (!latestOTP) {
      return res.status(404).json({ 
        success: false,
        error: 'No active OTP found',
        note: 'Request a new OTP first'
      });
    }

    res.json({
      success: true,
      email: latestOTP.email,
      otp: latestOTP.otp,
      type: latestOTP.type,
      expiresAt: latestOTP.expiresAt,
      createdAt: latestOTP.createdAt,
      expiresIn: Math.max(0, Math.floor((latestOTP.expiresAt - new Date()) / 1000 / 60)) + ' minutes'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Development only - Get all active OTPs
router.get('/all-active-otps', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Not available in production' });
    }

    const otps = await OTP.find({ 
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    const formattedOtps = otps.map(otp => ({
      email: otp.email,
      otp: otp.otp,
      type: otp.type,
      verified: otp.verified,
      createdAt: otp.createdAt,
      expiresAt: otp.expiresAt,
      expiresIn: Math.max(0, Math.floor((otp.expiresAt - new Date()) / 1000 / 60)) + ' minutes'
    }));

    res.json({
      success: true,
      total: otps.length,
      otps: formattedOtps
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router;