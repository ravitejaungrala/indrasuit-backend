import nodemailer from 'nodemailer';

// Create a test account for development
const createTestAccount = async () => {
  try {
    console.log('🛠️  Creating test email account for development...');
    const testAccount = await nodemailer.createTestAccount();
    console.log('✅ Test email account created');
    console.log(`   SMTP: ${testAccount.smtp.host}:${testAccount.smtp.port}`);
    console.log(`   Email: ${testAccount.user}`);
    console.log(`   Password: ${testAccount.pass}`);
    
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
  } catch (error) {
    console.error('❌ Failed to create test email account:', error.message);
    return null;
  }
};

// Create Gmail transporter
const createGmailTransporter = () => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error('❌ Gmail credentials not configured in .env');
      return null;
    }

    console.log('📧 Configuring Gmail transporter...');
    
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  } catch (error) {
    console.error('❌ Failed to create Gmail transporter:', error.message);
    return null;
  }
};

// Email service for sending OTPs
export const sendOTPEmail = async (email, otp, type) => {
  // Always log to console for development
  console.log('\n📧 ========== EMAIL SERVICE ==========');
  console.log(`To: ${email}`);
  console.log(`Type: ${type === 'login' ? 'Login OTP' : type === 'signup' ? 'Signup Verification OTP' : 'Password Reset OTP'}`);
  console.log(`OTP Code: ${otp}`);
  console.log(`Valid for: 10 minutes`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('=====================================\n');

  let transporter;
  let emailMethod = '';
  
  try {
    // Check environment and choose email method
    if (process.env.NODE_ENV === 'production') {
      // Production: Always try Gmail first
      console.log('🚀 Production mode: Using Gmail');
      transporter = createGmailTransporter();
      emailMethod = 'Gmail';
      
      if (!transporter) {
        console.log('⚠️  Gmail not configured, falling back to test account');
        transporter = await createTestAccount();
        emailMethod = 'Test Account';
      }
    } else {
      // Development: Try Gmail if configured, otherwise test account
      console.log('🛠️  Development mode');
      
      if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
        console.log('📧 Using configured Gmail credentials');
        transporter = createGmailTransporter();
        emailMethod = 'Gmail';
      }
      
      if (!transporter) {
        console.log('🔄 Creating test email account...');
        transporter = await createTestAccount();
        emailMethod = 'Test Account';
      }
    }
    
    if (!transporter) {
      console.log('⚠️  No email transport configured. OTP is shown in console only.');
      console.log('   To enable email in development, add to .env:');
      console.log('   EMAIL_USER=your-email@gmail.com');
      console.log('   EMAIL_PASSWORD=your-app-password');
      console.log('   (For Gmail, use App Password not regular password)');
      return true; // Still return true since we logged the OTP
    }

    const subjectMap = {
      'login': '🔐 Your RaDynamics Login OTP',
      'signup': '✅ Verify Your RaDynamics Account',
      'reset': '🔑 RaDynamics Password Reset OTP'
    };

    const htmlContent = `
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

    const mailOptions = {
      from: process.env.EMAIL_USER ? 
        `RaDynamics <${process.env.EMAIL_USER}>` : 
        '"RaDynamics" <noreply@radynamics.com>',
      to: email,
      subject: subjectMap[type] || 'RaDynamics Verification Code',
      html: htmlContent,
      text: `Your RaDynamics OTP is: ${otp}. This code will expire in 10 minutes.`
    };

    console.log(`📤 Sending email via ${emailMethod}...`);
    const info = await transporter.sendMail(mailOptions);
    
    if (emailMethod === 'Test Account') {
      // In development with test account, show preview URL
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log('✅ Test email sent!');
      console.log('📧 Email Preview URL:', previewUrl);
      console.log('   You can view the email at the above URL');
    } else {
      console.log('✅ Email sent successfully via Gmail');
    }
    
    console.log(`📨 Message ID: ${info.messageId}`);
    console.log(`📊 Response: ${info.response}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    
    // Provide helpful debugging information
    if (error.code === 'EAUTH') {
      console.log('\n🔐 Authentication failed! Common issues:');
      console.log('   1. Gmail requires an "App Password" not your regular password');
      console.log('   2. Enable 2-Step Verification in your Google Account');
      console.log('   3. Generate App Password: Google Account → Security → App Passwords');
      console.log('   4. Make sure "Less secure app access" is ON (if not using App Password)');
    } else if (error.code === 'EENVELOPE') {
      console.log('\n📧 Invalid recipient email address');
    } else if (error.code === 'ECONNECTION') {
      console.log('\n🌐 Connection failed. Check your internet connection');
    }
    
    console.log('\n⚠️  OTP has been logged to console above. User can use it directly.');
    console.log('   Development OTP:', otp);
    
    // Don't throw error - still allow login with console OTP
    return false;
  }
};

export const generateOTP = () => {
  // Generate 6-digit OTP
  return Math.floor(100000 + Math.random() * 900000).toString();
};