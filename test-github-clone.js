#!/usr/bin/env node

/**
 * Test script to verify GitHub cloning performance
 * Usage: node test-github-clone.js
 */

import githubService from './services/github-service.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testClone() {
  console.log('🧪 Testing GitHub Clone Performance');
  console.log('=' .repeat(50));
  
  const testRepo = 'https://github.com/expressjs/express.git';
  const testBranch = 'master';
  const testAppId = 'test-clone-' + Date.now();
  
  console.log(`📂 Repository: ${testRepo}`);
  console.log(`🌿 Branch: ${testBranch}`);
  console.log(`🆔 Test ID: ${testAppId}`);
  console.log('');
  
  const startTime = Date.now();
  
  try {
    console.log('🚀 Starting optimized clone...');
    
    const repoPath = await githubService.cloneRepository(
      testRepo,
      testBranch,
      testAppId,
      null // No token for public repo
    );
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('✅ CLONE SUCCESSFUL!');
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`📁 Path: ${repoPath}`);
    
    // Test app type detection
    console.log('');
    console.log('🔍 Testing app type detection...');
    const appType = await githubService.detectAppType(repoPath);
    console.log(`📦 Detected app type: ${appType}`);
    
    // Get default commands
    const defaultCommands = await githubService.getDefaultCommands(appType);
    console.log('🛠️  Default commands:');
    console.log(`   Build: ${defaultCommands.buildCommand}`);
    console.log(`   Start: ${defaultCommands.startCommand}`);
    console.log(`   Port: ${defaultCommands.port}`);
    
    // Performance analysis
    console.log('');
    console.log('📊 PERFORMANCE ANALYSIS:');
    if (duration < 10) {
      console.log('⚡ EXCELLENT - Very fast clone!');
    } else if (duration < 30) {
      console.log('✅ GOOD - Acceptable clone time');
    } else if (duration < 60) {
      console.log('⚠️  SLOW - Consider optimizations');
    } else {
      console.log('❌ VERY SLOW - Repository might be too large');
    }
    
    // Cleanup
    console.log('');
    console.log('🧹 Cleaning up...');
    await githubService.cleanupRepo(testAppId);
    console.log('✅ Cleanup completed');
    
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('❌ CLONE FAILED!');
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`🚨 Error: ${error.message}`);
    
    // Cleanup on failure
    try {
      await githubService.cleanupRepo(testAppId);
    } catch (cleanupError) {
      console.log(`⚠️  Cleanup error: ${cleanupError.message}`);
    }
  }
  
  console.log('');
  console.log('🏁 Test completed');
}

// Run the test
testClone().catch(console.error);