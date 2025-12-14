/**
 * Test Phase 4 APIs
 * Quick test to verify all APIs are working
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000';

// You need to get your token from browser localStorage
const TOKEN = process.argv[2];

if (!TOKEN) {
  console.log('❌ Please provide your token as argument');
  console.log('Usage: node backend/scripts/test-phase4-apis.js YOUR_TOKEN');
  console.log('\nTo get your token:');
  console.log('1. Open browser DevTools (F12)');
  console.log('2. Go to Console tab');
  console.log('3. Type: localStorage.getItem("token")');
  console.log('4. Copy the token (without quotes)');
  process.exit(1);
}

async function testAPIs() {
  console.log('🧪 Testing Phase 4 APIs...\n');
  console.log('='.repeat(60));
  
  try {
    // Test Analytics
    console.log('\n📊 Testing Analytics API...');
    const analyticsRes = await fetch(`${API_URL}/api/analytics/overview`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const analyticsData = await analyticsRes.json();
    
    if (analyticsRes.ok) {
      console.log('✅ Analytics API working');
      console.log(`   Today's Deployments: ${analyticsData.overview?.todayDeployments || 0}`);
      console.log(`   Total Deployments: ${analyticsData.overview?.totalDeployments || 0}`);
      console.log(`   Success Rate: ${analyticsData.overview?.successRate || 0}%`);
    } else {
      console.log('❌ Analytics API failed:', analyticsData.error);
    }
    
    // Test Templates
    console.log('\n📋 Testing Templates API...');
    const templatesRes = await fetch(`${API_URL}/api/templates`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const templatesData = await templatesRes.json();
    
    if (templatesRes.ok) {
      console.log('✅ Templates API working');
      console.log(`   Templates found: ${templatesData.templates?.length || 0}`);
      if (templatesData.templates?.length > 0) {
        console.log(`   First template: ${templatesData.templates[0].name}`);
      }
    } else {
      console.log('❌ Templates API failed:', templatesData.error);
    }
    
    // Test Notifications
    console.log('\n🔔 Testing Notifications API...');
    const notificationsRes = await fetch(`${API_URL}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const notificationsData = await notificationsRes.json();
    
    if (notificationsRes.ok) {
      console.log('✅ Notifications API working');
      console.log(`   Notifications found: ${notificationsData.notifications?.length || 0}`);
      console.log(`   Unread count: ${notificationsData.unreadCount || 0}`);
    } else {
      console.log('❌ Notifications API failed:', notificationsData.error);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ API Test Complete!\n');
    
  } catch (error) {
    console.error('\n❌ Error testing APIs:', error.message);
  }
}

testAPIs();
