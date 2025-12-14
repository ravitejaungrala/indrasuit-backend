#!/usr/bin/env node

/**
 * Quick diagnostic script for the specific repository
 * Usage: node diagnose-repo.js
 */

import { execSync } from 'child_process';

async function diagnoseRepository() {
  console.log('🔍 Diagnosing Repository Access');
  console.log('=' .repeat(50));
  
  const repoUrl = 'https://github.com/fly-hii/Triaright_EduCareer.git';
  console.log(`📂 Repository: ${repoUrl}`);
  console.log('');
  
  try {
    // Test 1: Check if repository exists and is accessible
    console.log('🧪 Test 1: Repository Accessibility');
    console.log('Running: git ls-remote --heads --tags');
    
    const startTime = Date.now();
    const result = execSync(`git ls-remote --heads --tags ${repoUrl}`, { 
      encoding: 'utf8',
      timeout: 30000 // 30 second timeout
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Repository is accessible (${duration}s)`);
    console.log('Available branches and tags:');
    console.log(result.trim());
    
  } catch (error) {
    console.log('❌ Repository access failed');
    console.log(`Error: ${error.message}`);
    
    if (error.message.includes('Repository not found')) {
      console.log('');
      console.log('💡 Possible causes:');
      console.log('   1. Repository is private (requires authentication)');
      console.log('   2. Repository URL is incorrect');
      console.log('   3. Repository has been deleted or moved');
      console.log('');
      console.log('🔧 Solutions:');
      console.log('   1. If private: Add GitHub Personal Access Token');
      console.log('   2. Verify the repository URL is correct');
      console.log('   3. Try using Docker deployment instead');
    }
    
    return;
  }
  
  try {
    // Test 2: Check clone speed with basic shallow clone
    console.log('');
    console.log('🧪 Test 2: Clone Speed Test');
    console.log('Running: git clone --depth 1 --single-branch');
    
    const tempDir = `temp-test-${Date.now()}`;
    const cloneStartTime = Date.now();
    
    execSync(`git clone --depth 1 --single-branch --branch main ${repoUrl} ${tempDir}`, {
      encoding: 'utf8',
      timeout: 180000, // 3 minute timeout
      stdio: 'pipe'
    });
    
    const cloneDuration = ((Date.now() - cloneStartTime) / 1000).toFixed(2);
    console.log(`✅ Clone completed in ${cloneDuration}s`);
    
    // Check repository size
    const sizeResult = execSync(`du -sh ${tempDir} 2>/dev/null || dir ${tempDir} /-s`, { 
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();
    console.log(`📦 Repository size: ${sizeResult}`);
    
    // Performance analysis
    if (cloneDuration < 10) {
      console.log('⚡ EXCELLENT - Very fast clone!');
    } else if (cloneDuration < 30) {
      console.log('✅ GOOD - Acceptable clone time');
    } else if (cloneDuration < 60) {
      console.log('⚠️  SLOW - Large repository detected');
    } else {
      console.log('❌ VERY SLOW - Consider Docker deployment');
    }
    
    // Cleanup
    execSync(`rm -rf ${tempDir} 2>/dev/null || rmdir /s /q ${tempDir}`, { stdio: 'ignore' });
    
  } catch (cloneError) {
    console.log('❌ Clone test failed');
    console.log(`Error: ${cloneError.message}`);
    
    if (cloneError.message.includes('timeout')) {
      console.log('');
      console.log('⏰ Clone timed out after 3 minutes');
      console.log('💡 This repository is very large or network is slow');
      console.log('🚀 Recommendation: Use Docker deployment instead');
    }
  }
  
  console.log('');
  console.log('🏁 Diagnosis completed');
}

// Run the diagnosis
diagnoseRepository().catch(console.error);