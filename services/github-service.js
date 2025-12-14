import simpleGit from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GitHubService {
  constructor() {
    this.tempDir = path.join(__dirname, '../temp');
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creating temp directory:', error);
    }
  }

  async cloneRepository(repoUrl, branch = 'main', appId, githubToken = null) {
    await this.ensureTempDir();
    
    const repoPath = path.join(this.tempDir, appId);
    
    try {
      // Remove existing directory if it exists
      await fs.rm(repoPath, { recursive: true, force: true });
      
      console.log(`🔄 Starting optimized clone: ${repoUrl} (branch: ${branch})`);
      console.log(`📁 Target path: ${repoPath}`);
      
      // Prepare authenticated URL for private repos
      let cloneUrl = repoUrl;
      if (githubToken && repoUrl.includes('github.com')) {
        // Convert https://github.com/user/repo to https://token@github.com/user/repo
        cloneUrl = repoUrl.replace('https://github.com/', `https://${githubToken}@github.com/`);
        console.log('🔐 Using GitHub token for private repository access');
      }
      
      // Create git instance with aggressive optimizations
      const git = simpleGit({
        timeout: {
          block: 180000, // Reduced to 3 minutes for faster failure detection
        },
        progress: (progress) => {
          console.log(`📥 Clone progress: ${progress.stage} ${progress.progress}%`);
        }
      });
      
      console.log('🚀 Starting optimized git clone...');
      const startTime = Date.now();
      
      // Enhanced clone with maximum optimizations for speed
      try {
        await git.clone(cloneUrl, repoPath, [
          '--branch', branch, 
          '--single-branch',        // Only clone the specified branch
          '--depth', '1',           // Shallow clone - only latest commit
          '--no-tags',              // Skip all tags
          '--filter=blob:none',     // Skip large files initially (Git 2.19+)
          '--recurse-submodules=no', // Skip submodules
          '--progress'              // Show progress
        ]);
      } catch (advancedError) {
        // If advanced clone fails, try with basic optimizations
        console.log('🔄 Advanced clone failed, trying basic shallow clone...');
        await git.clone(cloneUrl, repoPath, [
          '--branch', branch, 
          '--single-branch',
          '--depth', '1',
          '--no-tags'
        ]);
      }
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Repository cloned successfully in ${duration}s`);
      
      // Verify the clone was successful
      const clonedFiles = await fs.readdir(repoPath);
      console.log(`📂 Cloned ${clonedFiles.length} items`);
      
      // For very large repos, try to fetch missing blobs if needed
      if (duration > 30) {
        console.log('⚡ Large repository detected - optimizing for deployment...');
        try {
          // Only fetch blobs we actually need for deployment
          await git.cwd(repoPath).raw(['sparse-checkout', 'init', '--cone']);
          await git.cwd(repoPath).raw(['sparse-checkout', 'set', '/*']);
        } catch (sparseError) {
          console.log('ℹ️ Sparse checkout not available, continuing with full clone');
        }
      }
      
      return repoPath;
    } catch (error) {
      console.error('❌ Clone failed:', error);
      
      // Clean up failed clone
      try {
        await fs.rm(repoPath, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Failed to cleanup after clone error:', cleanupError);
      }
      
      // Enhanced error handling with fallback suggestions
      if (error.message.includes('Authentication failed') || error.message.includes('invalid username or password')) {
        throw new Error('Authentication failed. Please check your GitHub token or make sure the repository is public.');
      } else if (error.message.includes('Repository not found') || error.message.includes('not found')) {
        throw new Error('Repository not found. Please check the URL or ensure you have access to this private repository.');
      } else if (error.message.includes('Permission denied') || error.message.includes('access denied')) {
        throw new Error('Permission denied. Please provide a valid GitHub token for private repositories.');
      } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
        throw new Error('Clone timed out after 3 minutes. The repository might be very large. Try using a Docker image instead for faster deployment.');
      } else if (error.message.includes('network') || error.message.includes('connection')) {
        throw new Error('Network error. Please check your internet connection and try again.');
      } else if (error.message.includes('filter') || error.message.includes('blob:none')) {
        // Fallback for older Git versions that don't support blob filtering
        console.log('🔄 Retrying with basic shallow clone (Git version compatibility)...');
        return this.cloneRepositoryFallback(cloneUrl, repoPath, branch, git);
      }
      
      throw new Error(`Failed to clone repository: ${error.message}`);
    }
  }

  async cloneRepositoryFallback(cloneUrl, repoPath, branch, git) {
    try {
      console.log('🔄 Using fallback clone method...');
      const startTime = Date.now();
      
      // Basic shallow clone without advanced filters
      await git.clone(cloneUrl, repoPath, [
        '--branch', branch, 
        '--single-branch',
        '--depth', '1',
        '--no-tags'
      ]);
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Fallback clone completed in ${duration}s`);
      
      return repoPath;
    } catch (fallbackError) {
      console.error('❌ Fallback clone also failed:', fallbackError);
      throw fallbackError;
    }
  }

  async detectAppType(repoPath) {
    try {
      const files = await fs.readdir(repoPath);
      
      // Check for package.json (Node.js/React/Next.js)
      if (files.includes('package.json')) {
        const packageJson = JSON.parse(
          await fs.readFile(path.join(repoPath, 'package.json'), 'utf-8')
        );
        
        // Check for Next.js
        if (packageJson.dependencies?.next || files.includes('next.config.js')) {
          return 'nextjs';
        }
        
        // Check for React
        if (packageJson.dependencies?.react && files.includes('src')) {
          return 'react';
        }
        
        // Default to Node.js
        return 'nodejs';
      }
      
      // Check for Python
      if (files.includes('requirements.txt') || files.includes('app.py')) {
        return 'python';
      }
      
      // Check for static site
      if (files.includes('index.html')) {
        return 'static';
      }
      
      return 'unknown';
    } catch (error) {
      console.error('Error detecting app type:', error);
      return 'unknown';
    }
  }

  async getDefaultCommands(appType) {
    const commands = {
      nodejs: {
        buildCommand: 'npm install',
        startCommand: 'npm start',
        port: 3000
      },
      react: {
        buildCommand: 'npm install && npm run build',
        startCommand: 'npx serve -s build -l 3000',
        port: 3000
      },
      nextjs: {
        buildCommand: 'npm install && npm run build',
        startCommand: 'npm start',
        port: 3000
      },
      python: {
        buildCommand: 'pip install -r requirements.txt',
        startCommand: 'python app.py',
        port: 8080
      },
      static: {
        buildCommand: '',
        startCommand: 'npx serve -s . -l 8080',
        port: 8080
      }
    };
    
    return commands[appType] || commands.nodejs;
  }

  async cleanupRepo(appId) {
    const repoPath = path.join(this.tempDir, appId);
    try {
      await fs.rm(repoPath, { recursive: true, force: true });
      console.log(`Cleaned up repository: ${repoPath}`);
    } catch (error) {
      console.error('Error cleaning up repository:', error);
    }
  }
}

export default new GitHubService();
