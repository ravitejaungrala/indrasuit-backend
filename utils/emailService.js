import axios from 'axios';

// Email service for sending OTPs - Uses Brevo API (no SMTP)
// Email service for sending OTPs - Uses only native fetch API
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
    // Check if we should use Brevo API
    const shouldUseBrevo = process.env.BREVO_API_KEY && 
                          process.env.NODE_ENV === 'production' && 
                          process.env.USE_BREVO_API === 'true';
    
    if (shouldUseBrevo) {
      console.log('🚀 Using Brevo API for email...');
      const apiResult = await sendViaBrevoAPI(email, otp, type);
      
      if (apiResult.success) {
        console.log('✅ Email sent successfully via Brevo API!');
        return true;
      }
      
      console.log('⚠️ Brevo API failed, falling back to console logging...');
    }
    
    // Default: Log to console (always works)
    console.log(`📝 OTP for ${email}: ${otp}`);
    console.log('💡 Users can use OTP from console/logs');
    return true;
    
  } catch (error) {
    console.error('❌ Email service error:', error.message);
    console.log(`⚠️ Fallback: OTP for ${email}: ${otp}`);
    console.log('📝 Users can use OTP from console/logs');
    return true; // NEVER fail the login flow because of email issues
  }
};

// Send email via Brevo API using native fetch
const sendViaBrevoAPI = async (email, otp, type) => {
  const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  
  if (!BREVO_API_KEY) {
    console.log('⚠️ BREVO_API_KEY not configured in environment');
    return { success: false, error: 'API key missing' };
  }

  try {
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

    console.log(`📤 Sending via Brevo API to: ${email}`);
    
    // Set timeout for fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage += `: ${JSON.stringify(errorData)}`;
      } catch {
        errorMessage += `: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    console.log(`✅ Brevo API Success!`);
    console.log(`📨 Message ID: ${data.messageId}`);
    
    return { 
      success: true, 
      messageId: data.messageId,
      method: 'Brevo API'
    };

  } catch (error) {
    console.error('❌ Brevo API error:', error.message);
    
    if (error.name === 'AbortError') {
      console.log('⏱️ API request timed out (10s)');
    }
    
    return { 
      success: false, 
      error: error.message,
      method: 'Brevo API'
    };
  }
};

// Generate HTML email template
const generateEmailHTML = (otp, type) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>RaDynamics Verification Code</title>
      <style>
        body { margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f5f7fa; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { color: #1e5a8e; font-size: 24px; font-weight: bold; }
        .otp-box { background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
        .otp-code { font-size: 36px; font-weight: bold; color: #1e5a8e; letter-spacing: 5px; font-family: monospace; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">🚀 RaDynamics</div>
          <h2 style="color: #333;">Verification Code</h2>
        </div>
        
        <p>Hello,</p>
        <p>Your verification code for RaDynamics is:</p>
        
        <div class="otp-box">
          <div class="otp-code">${otp}</div>
          <p style="color: #666; margin-top: 10px;">Valid for 10 minutes</p>
        </div>
        
        <p>Enter this code to complete your ${type} process.</p>
        
        <div class="footer">
          <p>This is an automated message. Please do not reply.</p>
          <p>© ${new Date().getFullYear()} RaDynamics. All rights reserved.</p>
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

// Simple test function for Brevo API
export const testBrevoConnection = async () => {
  if (!process.env.BREVO_API_KEY) {
    return { success: false, message: 'BREVO_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/account', {
      headers: {
        'Accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      }
    });

    if (response.ok) {
      const data = await response.json();
      return { 
        success: true, 
        message: 'Brevo API connection successful',
        plan: data.plan
      };
    } else {
      return { 
        success: false, 
        message: `Brevo API error: ${response.status}` 
      };
    }
  } catch (error) {
    return { 
      success: false, 
      message: `Brevo API error: ${error.message}` 
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

