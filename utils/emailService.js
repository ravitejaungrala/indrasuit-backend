import axios from 'axios';

// Email service for sending OTPs - Uses Brevo API (no SMTP)
export const sendOTPEmail = async (email, otp, type) => {
  // Always log to console for all environments
  console.log('\n📧 ========== EMAIL SERVICE ==========');
  console.log(`To: ${email}`);
  console.log(`Type: ${type === 'login' ? 'Login OTP' : type === 'signup' ? 'Signup Verification OTP' : 'Password Reset OTP'}`);
  console.log(`OTP Code: ${otp}`);
  console.log(`Valid for: 10 minutes`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('=====================================\n');

  try {
    // Priority 1: Use Brevo API if configured
    if (process.env.BREVO_API_KEY) {
      console.log('🚀 Using Brevo API for email...');
      const apiResult = await sendViaBrevoAPI(email, otp, type);
      
      if (apiResult.success) {
        console.log('✅ Email sent successfully via Brevo API!');
        return true;
      }
      
      console.log('⚠️ Brevo API failed, falling back to console...');
    }
    
    // Priority 2: Development mode or fallback
    if (process.env.NODE_ENV === 'development' || !process.env.BREVO_API_KEY) {
      console.log('🛠️ Development/No-API mode: OTP logged to console');
      console.log(`📝 OTP for ${email}: ${otp}`);
      console.log('💡 Users can use OTP from console/logs');
      
      // In development, also try to create a test email preview
      if (process.env.NODE_ENV === 'development') {
        try {
          await createDevEmailPreview(email, otp, type);
        } catch (devError) {
          console.log('⚠️ Dev email preview failed, but OTP is logged');
        }
      }
      
      return true; // Still successful for login flow
    }
    
    // Final fallback
    console.log(`⚠️ No email service configured. OTP for ${email}: ${otp}`);
    return true;
    
  } catch (error) {
    console.error('❌ Email service error:', error.message);
    console.log(`⚠️ Fallback: OTP for ${email}: ${otp}`);
    console.log('📝 Users can use OTP from console/logs');
    
    // NEVER fail the login flow because of email issues
    return true;
  }
};

// Send email via Brevo API (HTTP, works on Render)
const sendViaBrevoAPI = async (email, otp, type) => {
  try {
    const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    
    if (!BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY not configured');
    }

    const subjectMap = {
      'login': '🔐 Your RaDynamics Login OTP',
      'signup': '✅ Verify Your RaDynamics Account',
      'reset': '🔑 RaDynamics Password Reset OTP'
    };

    const senderEmail = process.env.BREVO_FROM_EMAIL || 'noreply@indrasuite.com';
    const senderName = process.env.BREVO_FROM_NAME || 'RaDynamics';

    const emailData = {
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [{
        email: email,
        name: email.split('@')[0]
      }],
      subject: subjectMap[type] || 'RaDynamics Verification Code',
      htmlContent: generateEmailHTML(otp, type),
      textContent: `Your RaDynamics OTP is: ${otp}. This code will expire in 10 minutes.`
    };

    console.log(`📤 Sending via Brevo API...`);
    console.log(`From: ${senderName} <${senderEmail}>`);
    console.log(`To: ${email}`);
    
    const response = await axios.post(BREVO_API_URL, emailData, {
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      timeout: 15000 // 15 second timeout
    });

    console.log(`✅ Brevo API Success!`);
    console.log(`📨 Message ID: ${response.data.messageId}`);
    
    return { 
      success: true, 
      messageId: response.data.messageId,
      method: 'Brevo API'
    };

  } catch (error) {
    console.error('❌ Brevo API error:', error.message);
    
    if (error.response) {
      console.error('📊 API Response:', {
        status: error.response.status,
        data: error.response.data
      });
      
      // Handle specific Brevo errors
      if (error.response.status === 401) {
        console.log('🔐 Authentication failed. Check your BREVO_API_KEY');
      } else if (error.response.status === 403) {
        console.log('🚫 Permission denied. Verify sender email in Brevo dashboard');
      } else if (error.response.status === 429) {
        console.log('⏱️ Rate limit exceeded. Brevo free tier: 300 emails/day');
      }
    }
    
    return { 
      success: false, 
      error: error.message,
      method: 'Brevo API'
    };
  }
};

// Development helper - creates email preview without sending
const createDevEmailPreview = async (email, otp, type) => {
  // In development, we can't send real emails but we can show what would be sent
  console.log('\n📋 ========== EMAIL PREVIEW (DEV) ==========');
  console.log('Subject:', getEmailSubject(type));
  console.log('HTML Content Preview:');
  console.log(generateEmailHTML(otp, type).substring(0, 200) + '...');
  console.log('============================================\n');
  
  return true;
};

// Generate email subject
const getEmailSubject = (type) => {
  const subjectMap = {
    'login': '🔐 Your RaDynamics Login OTP',
    'signup': '✅ Verify Your RaDynamics Account',
    'reset': '🔑 RaDynamics Password Reset OTP'
  };
  return subjectMap[type] || 'RaDynamics Verification Code';
};

// Generate HTML email template
const generateEmailHTML = (otp, type) => {
  const typeText = type === 'login' ? 'logging into' : 
                  type === 'signup' ? 'verifying your account on' : 
                  'resetting your password on';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>RaDynamics Verification</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          line-height: 1.6; 
          color: #333; 
          margin: 0;
          padding: 20px;
          background-color: #f5f7fa;
        }
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }
        .header { 
          background: linear-gradient(135deg, #1e5a8e 0%, #2a7ab8 100%); 
          color: white; 
          padding: 40px 30px; 
          text-align: center; 
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        .header p {
          margin: 10px 0 0 0;
          font-size: 16px;
          opacity: 0.9;
        }
        .content { 
          padding: 40px 30px; 
        }
        .otp-box { 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); 
          border: 2px solid #e2e8f0;
          border-radius: 10px; 
          padding: 30px 20px; 
          text-align: center; 
          margin: 30px 0; 
        }
        .otp-code { 
          font-size: 42px; 
          font-weight: 800; 
          color: #1e5a8e; 
          letter-spacing: 10px; 
          font-family: 'Courier New', monospace;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .footer { 
          text-align: center; 
          margin-top: 40px; 
          color: #64748b; 
          font-size: 14px; 
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
        }
        .warning { 
          background: #fffbeb; 
          border-left: 4px solid #f59e0b; 
          padding: 20px; 
          margin: 25px 0; 
          border-radius: 8px;
        }
        .info {
          background: #f0f9ff;
          border-left: 4px solid #0ea5e9;
          padding: 15px;
          margin: 20px 0;
          border-radius: 8px;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚀 RaDynamics</h1>
          <p>${type === 'login' ? 'Login Verification' : type === 'signup' ? 'Account Verification' : 'Password Reset'}</p>
        </div>
        <div class="content">
          <h2 style="margin-top: 0; color: #1e293b;">Hello!</h2>
          <p>Your OTP code for ${typeText} <strong>RaDynamics</strong> is:</p>
          
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <p style="color: #64748b; margin-top: 15px; font-size: 15px;">
              ⏰ This code will expire in 10 minutes
            </p>
          </div>
          
          <div class="warning">
            <strong style="color: #92400e;">⚠️ Security Notice:</strong><br>
            <p style="margin: 8px 0 0 0; color: #92400e;">
              If you didn't request this code, please ignore this email. Your account is safe.
            </p>
          </div>
          
          <p style="color: #475569; margin-top: 25px;">
            Thank you for using RaDynamics!<br>
            <em>The Cloud Infrastructure Automation Platform</em>
          </p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
          <p>© ${new Date().getFullYear()} RaDynamics. All rights reserved.</p>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 10px;">
            OTP: <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${otp}</code>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const generateOTP = () => {
  // Generate 6-digit OTP
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Test function for Brevo API
export const testBrevoAPI = async (testEmail = 'test@example.com') => {
  try {
    if (!process.env.BREVO_API_KEY) {
      return {
        success: false,
        message: 'BREVO_API_KEY not configured in environment',
        action: 'Get API key from Brevo dashboard → SMTP & API → API Keys'
      };
    }

    const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
    
    const testData = {
      sender: {
        name: 'RaDynamics Test',
        email: process.env.BREVO_FROM_EMAIL || 'test@indrasuite.com'
      },
      to: [{ email: testEmail }],
      subject: '✅ Brevo API Test from RaDynamics',
      htmlContent: '<h1>Brevo API Test</h1><p>If you received this, Brevo API is working!</p>',
      textContent: 'Brevo API Test - Success!'
    };

    const response = await axios.post(BREVO_API_URL, testData, {
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json'
      },
      timeout: 10000
    });

    return {
      success: true,
      message: 'Brevo API connection successful!',
      messageId: response.data.messageId,
      method: 'Brevo API',
      environment: process.env.NODE_ENV
    };

  } catch (error) {
    return {
      success: false,
      message: `Brevo API test failed: ${error.message}`,
      error: error.response?.data || error.message,
      status: error.response?.status,
      action: '1. Check BREVO_API_KEY is correct\n2. Verify sender email in Brevo dashboard\n3. Check rate limits (300/day free)'
    };
  }
};
