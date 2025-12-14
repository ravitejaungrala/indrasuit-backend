/**
 * Test script to verify email configuration
 * Usage: node backend/scripts/test-email.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendOTPEmail, generateOTP } from '../utils/emailService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testEmail() {
  console.log('🧪 Testing Email Configuration\n');
  console.log('=' .repeat(50));
  
  // Check if credentials are configured
  console.log('\n📋 Configuration Check:');
  console.log(`EMAIL_USER: ${process.env.EMAIL_USER ? '✅ Set' : '❌ Not set'}`);
  console.log(`EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD ? '✅ Set' : '❌ Not set'}`);
  
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.log('\n❌ Email credentials not configured!');
    console.log('Please set EMAIL_USER and EMAIL_PASSWORD in backend/.env\n');
    process.exit(1);
  }
  
  console.log(`\nFrom: ${process.env.EMAIL_USER}`);
  
  // Generate test OTP
  const testOTP = generateOTP();
  
  // Ask for test email
  console.log('\n📧 Sending test email...');
  console.log(`Test OTP: ${testOTP}`);
  console.log(`To: ${process.env.EMAIL_USER} (sending to self for testing)`);
  
  try {
    await sendOTPEmail(process.env.EMAIL_USER, testOTP, 'login');
    
    console.log('\n✅ Email test completed!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Check your inbox: ' + process.env.EMAIL_USER);
    console.log('   2. Look for email from IndraSuite');
    console.log('   3. Verify OTP code matches: ' + testOTP);
    console.log('   4. Check spam folder if not in inbox\n');
    
    console.log('🎉 If you received the email, configuration is working!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Email test failed:', error.message);
    console.log('\n🔍 Troubleshooting:');
    console.log('   1. Verify Gmail App Password is correct');
    console.log('   2. Check 2-Step Verification is enabled');
    console.log('   3. Make sure App Password has no spaces');
    console.log('   4. Try generating a new App Password\n');
    process.exit(1);
  }
}

// Run the test
testEmail();
