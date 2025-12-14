// Email service for sending OTPs with dynamic Reply-To
export const sendOTPEmail = async (email, otp, type) => {
  console.log('\n📧 ========== EMAIL SERVICE ==========');
  console.log(`To: ${email}`);
  console.log(`Type: ${type}`);
  console.log(`OTP Code: ${otp}`);
  
  // Configuration check
  const config = {
    apiKey: process.env.SENDGRID_API_KEY,
    fromEmail: process.env.SENDGRID_FROM_EMAIL,
    fromName: process.env.SENDGRID_FROM_NAME,
    nodeEnv: process.env.NODE_ENV
  };
  
  console.log(`\n⚙️  CONFIGURATION:`);
  console.log(`SENDGRID_API_KEY: ${config.apiKey ? 'Set ✅' : '❌ NOT SET'}`);
  console.log(`SENDGRID_FROM_EMAIL: ${config.fromEmail || 'not set'}`);
  console.log(`NODE_ENV: ${config.nodeEnv || 'development'}`);
  console.log(`Reply-To: ${email} (user's own email)`);
  console.log('=====================================\n');

  try {
    // Check if we can send emails
    if (!config.apiKey || !config.fromEmail) {
      console.log('❌ SendGrid not configured properly');
      console.log(`📝 OTP for ${email}: ${otp}`);
      console.log('💡 Users can use OTP from console/logs');
      return true;
    }
    
    console.log('🚀 Sending email via SendGrid...');
    const result = await sendViaSendGrid(email, otp, type, config);
    
    if (result.success) {
      console.log('✅ Email sent successfully via SendGrid!');
      return true;
    } else {
      console.log('❌ SendGrid failed:', result.error);
      console.log(`📝 OTP for ${email}: ${otp}`);
      return true;
    }
    
  } catch (error) {
    console.error('❌ Email service error:', error.message);
    console.log(`📝 OTP for ${email}: ${otp}`);
    return true;
  }
};

// Send email via SendGrid API with user's email as Reply-To
const sendViaSendGrid = async (email, otp, type, config) => {
  const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';
  
  try {
    const subjectMap = {
      'login': `Your RaDynamics Login Code: ${otp}`,
      'signup': `Verify Your RaDynamics Account: ${otp}`,
      'reset': `Reset Your RaDynamics Password: ${otp}`
    };

    // Email data with Reply-To set to user's own email
    const emailData = {
      personalizations: [{
        to: [{ email: email }],
        subject: subjectMap[type] || `Your Verification Code: ${otp}`
      }],
      from: {
        email: config.fromEmail,  // Your verified sender email
        name: config.fromName || 'RaDynamics'
      },
      reply_to: {
        email: email,  // USER'S EMAIL as Reply-To
        name: email.split('@')[0]  // User's name from email
      },
      content: [
        {
          type: 'text/plain',
          value: `Your RaDynamics verification code is: ${otp}\n\nValid for 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\nNote: Replies to this email will go to your own inbox.`
        },
        {
          type: 'text/html',
          value: generateEmailHTML(otp, type, email)
        }
      ]
    };

    console.log(`📤 Email Details:`);
    console.log(`   From: ${config.fromName} <${config.fromEmail}>`);
    console.log(`   To: ${email}`);
    console.log(`   Reply-To: ${email} (user's email)`);
    console.log(`   Subject: ${subjectMap[type]}`);
    
    const response = await fetch(SENDGRID_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage += `: ${JSON.stringify(errorData.errors || errorData)}`;
      } catch {
        errorMessage += `: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    console.log(`✅ SendGrid Success! Status: ${response.status}`);
    
    return { 
      success: true,
      status: response.status
    };

  } catch (error) {
    return { 
      success: false, 
      error: error.message
    };
  }
};

// Updated HTML with Reply-To explanation
const generateEmailHTML = (otp, type, userEmail) => {
  const actionText = type === 'login' ? 'login to your account' : 
                    type === 'signup' ? 'verify your account' : 
                    'reset your password';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your RaDynamics Verification Code</title>
      <style>
        body { margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f5f7fa; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #1e5a8e 0%, #2a7ab8 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .otp-box { background: #f8fafc; border: 2px solid #1e5a8e; border-radius: 8px; padding: 25px; text-align: center; margin: 25px 0; }
        .otp-code { font-size: 42px; font-weight: bold; color: #1e5a8e; letter-spacing: 8px; font-family: monospace; }
        .info-box { background: #e8f4fd; border-left: 4px solid #1e5a8e; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 28px;">🚀 RaDynamics</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Secure Verification</p>
        </div>
        
        <div class="content">
          <h2 style="color: #333; margin-top: 0;">Your Verification Code</h2>
          
          <div class="info-box">
            <p style="margin: 0; color: #1e5a8e;">
              <strong>Sent to:</strong> ${userEmail}<br>
              <strong>Reply-To:</strong> ${userEmail} (your email)
            </p>
          </div>
          
          <p>Use the code below to ${actionText}:</p>
          
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <p style="color: #666; margin-top: 10px; font-size: 16px;">
              ⏰ Valid for 10 minutes
            </p>
          </div>
          
          <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <strong>Security Notice:</strong>
            <ul style="margin: 5px 0 0 0; padding-left: 20px;">
              <li>Never share this code with anyone</li>
              <li>Code expires in 10 minutes</li>
              <li>If you didn't request this, please ignore this email</li>
              <li>Replies will be sent to your own inbox</li>
            </ul>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            <strong>Note:</strong> This email has your own address set as "Reply-To". 
            If you reply, it will go to your own inbox.
          </p>
        </div>
        
        <div class="footer">
          <p style="margin: 0;">
            © ${new Date().getFullYear()} RaDynamics. All rights reserved.<br>
            This is an automated message. For support, contact us through the app.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
