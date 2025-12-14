import nodemailer from 'nodemailer';
import { Resend } from 'resend';

// Initialize Resend if API key is available
let resend;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
}

// Helper function to create test account for development
const createTestAccount = async () => {
  try {
    console.log('🛠️  Creating test email account for development...');
    const testAccount = await nodemailer.createTestAccount();
    
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

// Create Gmail transporter if credentials are available
const createGmailTransporter = () => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      return null;
    }

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

// Send email via Resend API (for production on Render)
const sendViaResend = async (email, otp, type) => {
  if (!resend) {
    console.log('❌ Resend not configured. Please add RESEND_API_KEY to environment.');
    return false;
  }

  try {
    const subjectMap = {
      'login': '🔐 Your RaDynamics Login OTP',
      'signup': '✅ Verify Your RaDynamics Account',
      'reset': '🔑 RaDynamics Password Reset OTP'
    };

    const htmlContent = generateEmailHTML(otp, type);

    const { data, error } = await resend.emails.send({
      from: 'IndraSuite <onboarding@resend.dev>',
      to: [email],
      subject: subjectMap[type] || 'RaDynamics Verification Code',
      html: htmlContent
    });

    if (error) {
      console.error('❌ Resend API error:', error);
      return false;
    }

    console.log('✅ Email sent successfully via Resend API');
    console.log(`📨 Message ID: ${data.id}`);
    return true;
    
  } catch (error) {
    console.error('❌ Resend email failed:', error.message);
    return false;
  }
};

// Send email via SMTP (for local development)
const sendViaSMTP = async (email, otp, type) => {
  let transporter;
  let emailMethod = '';
  
  try {
    // Check environment and choose email method
    if (process.env.NODE_ENV === 'production') {
      // In production, try Gmail first
      transporter = createGmailTransporter();
      emailMethod = 'Gmail';
    } else {
      // In development, try Gmail if configured
      if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
        transporter = createGmailTransporter();
        emailMethod = 'Gmail';
      }
      
      if (!transporter) {
        transporter = await createTestAccount();
        emailMethod = 'Test Account';
      }
    }
    
    if (!transporter) {
      console.log('⚠️  No email transport configured.');
      return false;
    }

    const subjectMap = {
      'login': '🔐 Your RaDynamics Login OTP',
      'signup': '✅ Verify Your RaDynamics Account',
      'reset': '🔑 RaDynamics Password Reset OTP'
    };

    const htmlContent = generateEmailHTML(otp, type);

    const mailOptions = {
      from: process.env.EMAIL_USER ? 
        `RaDynamics <${process.env.EMAIL_USER}>` : 
        '"RaDynamics" <noreply@radynamics.com>',
      to: email,
      subject: subjectMap[type] || 'RaDynamics Verification Code',
      html: htmlContent
    };

    console.log(`📤 Sending email via ${emailMethod}...`);
    const info = await transporter.sendMail(mailOptions);
    
    if (emailMethod === 'Test Account') {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log('✅ Test email sent!');
      console.log('📧 Email Preview URL:', previewUrl);
    } else {
      console.log('✅ Email sent successfully via Gmail');
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ SMTP email failed:', error.message);
    return false;
  }
};

// Main email service function
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
    let emailSent = false;
    
    // Decide which email service to use
    if (process.env.USE_RESEND === 'true' && resend) {
      // Use Resend API (for Render production)
      console.log('🚀 Using Resend API for email');
      emailSent = await sendViaResend(email, otp, type);
    } else {
      // Use SMTP (for local development or if Resend not configured)
      console.log('📧 Using SMTP for email');
      emailSent = await sendViaSMTP(email, otp, type);
    }
    
    if (!emailSent) {
      console.log('⚠️  Email sending failed. OTP is available in logs above.');
      console.log(`   OTP for ${email}: ${otp}`);
      console.log('   Users can use the OTP from console/logs');
      
      // Even if email fails, we still consider it successful for the flow
      // because OTP is logged and user can proceed
      return true;
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Email service error:', error.message);
    console.log(`⚠️  OTP has been logged above. Users can use: ${otp}`);
    
    // Don't fail the entire process if email fails
    return true;
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
          <p>Your OTP code for <strong>RaDynamics</strong> is:</p>
          
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <p style="color: #64748b; margin-top: 15px; font-size: 15px;">
              ⏰ This code will expire in 10 minutes
            </p>
          </div>
          
          <div class="warning">
            <strong style="color: #92400e;">⚠️ Security Notice:</strong><br>
            <p style="margin: 8px 0 0 0; color: #92400e;">
              If you didn't request this code, please ignore this email.
            </p>
          </div>
          
          <p style="color: #475569; margin-top: 25px;">
            Thank you for using RaDynamics!
          </p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
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
