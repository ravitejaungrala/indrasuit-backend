import nodemailer from 'nodemailer';

// Email service for sending OTPs
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
    // Create Brevo SMTP transporter
    const transporter = createBrevoTransporter();
    
    if (!transporter) {
      console.log('⚠️  Brevo SMTP not configured. OTP logged to console only.');
      console.log(`   OTP for ${email}: ${otp}`);
      console.log('   Users can use the OTP from console/logs');
      return true; // Return true to not block the flow
    }

    const subjectMap = {
      'login': '🔐 Your RaDynamics Login OTP',
      'signup': '✅ Verify Your RaDynamics Account',
      'reset': '🔑 RaDynamics Password Reset OTP'
    };

    const htmlContent = generateEmailHTML(otp, type);

    // Use your Brevo verified sender email (must match what you verified in Brevo)
    const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@indrasuite.com';
    const fromName = process.env.BREVO_FROM_NAME || 'RaDynamics';

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: subjectMap[type] || 'RaDynamics Verification Code',
      html: htmlContent,
      text: `Your RaDynamics OTP is: ${otp}. This code will expire in 10 minutes.`
    };

    console.log(`📤 Sending email via Brevo SMTP...`);
    console.log(`From: ${fromEmail}`);
    console.log(`To: ${email}`);
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email sent successfully via Brevo SMTP!');
    console.log(`📨 Message ID: ${info.messageId}`);
    console.log(`📊 Response: ${info.response}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to send email via Brevo SMTP:', error.message);
    
    // Provide helpful debugging information
    if (error.code === 'EAUTH') {
      console.log('\n🔐 SMTP Authentication failed! Common issues:');
      console.log('   1. Check if BREVO_SMTP_USER and BREVO_SMTP_PASSWORD are correct');
      console.log('   2. Verify your Brevo account is active');
      console.log('   3. Make sure IP is not blocked by Brevo');
    } else if (error.code === 'EENVELOPE') {
      console.log('\n📧 Invalid recipient email address');
    } else if (error.code === 'ECONNECTION') {
      console.log('\n🌐 Connection failed. Check network/firewall settings');
      console.log('   Brevo SMTP: smtp-relay.brevo.com:587');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('\n⏱️  Connection timeout. Brevo SMTP might be busy');
    }
    
    console.log('\n⚠️  Email sending failed. OTP is available in logs above.');
    console.log(`   OTP for ${email}: ${otp}`);
    console.log('   Users can use the OTP from console/logs');
    
    // Don't throw error - still allow login with console OTP
    return false;
  }
};

// Create Brevo SMTP transporter
const createBrevoTransporter = () => {
  try {
    // Check if Brevo credentials are configured
    const smtpUser = process.env.BREVO_SMTP_USER;
    const smtpPassword = process.env.BREVO_SMTP_PASSWORD;
    
    if (!smtpUser || !smtpPassword) {
      console.log('⚠️  Brevo SMTP credentials not configured.');
      console.log('   Please add BREVO_SMTP_USER and BREVO_SMTP_PASSWORD to environment variables');
      return null;
    }

    console.log(`🔧 Creating Brevo SMTP transporter...`);
    console.log(`   SMTP Host: smtp-relay.brevo.com:587`);
    console.log(`   SMTP User: ${smtpUser.substring(0, 5)}...`); // Show partial for security
    
    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPassword
      },
      tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,
      socketTimeout: 15000
    });

    // Verify connection configuration
    transporter.verify((error, success) => {
      if (error) {
        console.error('❌ Brevo SMTP connection verification failed:', error.message);
      } else {
        console.log('✅ Brevo SMTP connection verified successfully');
      }
    });

    return transporter;
    
  } catch (error) {
    console.error('❌ Failed to create Brevo SMTP transporter:', error.message);
    return null;
  }
};

// Create backup transporter for development (Ethereal email)
const createDevTransporter = async () => {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  
  try {
    console.log('🛠️  Creating development test email account...');
    const testAccount = await nodemailer.createTestAccount();
    
    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });

    console.log('✅ Development test account created');
    console.log(`   Test Email: ${testAccount.user}`);
    
    return transporter;
  } catch (error) {
    console.error('❌ Failed to create dev test account:', error.message);
    return null;
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
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #1e5a8e 0%, #2a7ab8 100%);
          color: white;
          padding: 14px 28px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          margin-top: 10px;
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
          <p>Your OTP code for ${type === 'login' ? 'logging into' : type === 'signup' ? 'verifying your account on' : 'resetting your password on'} <strong>RaDynamics</strong> is:</p>
          
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
          
          ${type === 'signup' ? `
          <div class="info">
            <strong>📝 Next Steps:</strong><br>
            <p style="margin: 8px 0 0 0;">
              1. Copy the OTP code above<br>
              2. Go back to RaDynamics signup page<br>
              3. Enter the code to verify your account
            </p>
          </div>
          ` : ''}
          
          <p style="color: #475569; margin-top: 25px;">
            Thank you for using RaDynamics!<br>
            <em>The Cloud Infrastructure Automation Platform</em>
          </p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
          <p>© ${new Date().getFullYear()} RaDynamics. All rights reserved.</p>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 10px;">
            If you're having trouble, you can copy the OTP directly: <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${otp}</code>
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

// Test function to verify Brevo SMTP connection
export const testBrevoConnection = async () => {
  try {
    const transporter = createBrevoTransporter();
    
    if (!transporter) {
      return {
        success: false,
        message: 'Brevo transporter not created. Check credentials.'
      };
    }

    // Try to verify connection
    await new Promise((resolve, reject) => {
      transporter.verify((error, success) => {
        if (error) {
          reject(error);
        } else {
          resolve(success);
        }
      });
    });

    // Try to send a test email
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    const testInfo = await transporter.sendMail({
      from: process.env.BREVO_FROM_EMAIL || '"RaDynamics" <noreply@indrasuite.com>',
      to: testEmail,
      subject: 'Brevo SMTP Test',
      text: 'This is a test email from Brevo SMTP',
      html: '<h1>Brevo SMTP Test</h1><p>This is a test email from Brevo SMTP</p>'
    });

    return {
      success: true,
      message: 'Brevo SMTP connection successful',
      messageId: testInfo.messageId,
      response: testInfo.response
    };
    
  } catch (error) {
    return {
      success: false,
      message: `Brevo SMTP test failed: ${error.message}`,
      error: error.message
    };
  }
};
