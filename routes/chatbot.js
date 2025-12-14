import express from 'express';
import { authMiddleware as authenticateToken } from '../middleware/auth.js';
import Application from '../models/Application.js';
import AWSAccount from '../models/AWSAccount.js';
import Deployment from '../models/Deployment.js';

const router = express.Router();

// AI Knowledge Base
const knowledgeBase = {
  services: {
    ec2: {
      name: 'Amazon EC2',
      description: 'Virtual servers in the cloud',
      useCases: ['Web hosting', 'Application servers', 'Development environments'],
      pricing: 'Pay per hour/second based on instance type'
    },
    s3: {
      name: 'Amazon S3',
      description: 'Object storage service',
      useCases: ['File storage', 'Static website hosting', 'Backup and archive'],
      pricing: 'Pay per GB stored and data transfer'
    },
    iam: {
      name: 'AWS IAM',
      description: 'Identity and Access Management',
      useCases: ['User management', 'Access control', 'Security policies'],
      pricing: 'Free service'
    },
    ecs: {
      name: 'Amazon ECS',
      description: 'Container orchestration service',
      useCases: ['Docker containers', 'Microservices', 'Batch processing'],
      pricing: 'Pay for underlying resources (EC2 or Fargate)'
    },
    rds: {
      name: 'Amazon RDS',
      description: 'Managed relational database',
      useCases: ['MySQL', 'PostgreSQL', 'SQL Server databases'],
      pricing: 'Pay per hour based on instance type'
    }
  },
  
  howTo: {
    'deploy ec2': 'To deploy an EC2 instance:\n1. Go to Deploy → EC2\n2. Select your AWS account\n3. Choose instance type (t2.micro for testing)\n4. Select key pair\n5. Configure security group\n6. Click Deploy',
    'add aws account': 'To add an AWS account:\n1. Go to AWS Accounts page\n2. Click "Add AWS Account"\n3. Enter Access Key ID and Secret Access Key\n4. Select region\n5. Click Add Account',
    'deploy application': 'To deploy an application:\n1. Go to Applications\n2. Click "Deploy New Application"\n3. Choose GitHub or Docker method\n4. Fill in details\n5. Select deployment target (ECS or EC2)\n6. Click Deploy',
    'create s3 bucket': 'To create an S3 bucket:\n1. Go to Deploy → S3\n2. Select AWS account\n3. Enter bucket name (must be globally unique)\n4. Choose region\n5. Configure access settings\n6. Click Deploy'
  }
};

// AI Response Generator with Real Context
async function generateResponse(question, userContext, userId) {
  const lowerQuestion = question.toLowerCase();
  
  // Check for ERROR-related questions FIRST (highest priority)
  if (lowerQuestion.includes('error') || lowerQuestion.includes('fail') || lowerQuestion.includes('problem') || lowerQuestion.includes('issue')) {
    // Get recent failed deployments and applications
    const [failedApps, failedDeployments] = await Promise.all([
      Application.find({ userId, status: { $in: ['failed', 'error'] } })
        .sort({ updatedAt: -1 })
        .limit(5)
        .populate('aws.accountId', 'accountName'),
      Deployment.find({ userId, status: { $in: ['failed', 'error'] } })
        .sort({ createdAt: -1 })
        .limit(5)
    ]);
    
    if (failedApps.length === 0 && failedDeployments.length === 0) {
      return `Good news! I don't see any recent errors in your account.\n\n✅ All your deployments appear to be successful.\n\nIf you're experiencing an issue, please describe it in detail and I'll help you troubleshoot.`;
    }
    
    let response = `I found ${failedApps.length + failedDeployments.length} recent error(s) in your account:\n\n`;
    
    // Show failed applications with specific errors
    if (failedApps.length > 0) {
      response += `**Failed Applications:**\n`;
      failedApps.forEach((app, index) => {
        response += `\n${index + 1}. **${app.name}**\n`;
        response += `   Status: ${app.status}\n`;
        response += `   Target: ${app.deploymentTarget?.toUpperCase() || 'Unknown'}\n`;
        
        if (app.errorMessage) {
          // Parse common errors and provide solutions
          if (app.errorMessage.includes('not in a valid state') || app.errorMessage.includes('SSM')) {
            response += `   ❌ Error: EC2 instance not registered with AWS Systems Manager\n`;
            response += `   ✅ Solution:\n`;
            response += `      1. Attach IAM role with AmazonSSMManagedInstanceCore policy\n`;
            response += `      2. SSH to instance and run: sudo systemctl restart amazon-ssm-agent\n`;
            response += `      3. Wait 2-3 minutes and redeploy\n`;
          } else if (app.errorMessage.includes('credentials') || app.errorMessage.includes('not valid')) {
            response += `   ❌ Error: Invalid AWS credentials\n`;
            response += `   ✅ Solution:\n`;
            response += `      1. Go to AWS Accounts page\n`;
            response += `      2. Update credentials for: ${app.aws?.accountId?.accountName || 'your account'}\n`;
            response += `      3. Verify credentials are correct\n`;
            response += `      4. Redeploy application\n`;
          } else if (app.errorMessage.includes('Docker') || app.errorMessage.includes('image')) {
            response += `   ❌ Error: Docker image issue\n`;
            response += `   ✅ Solution:\n`;
            response += `      1. Verify image exists: ${app.docker?.image || 'your image'}\n`;
            response += `      2. Check image tag: ${app.docker?.tag || 'latest'}\n`;
            response += `      3. Ensure image is public or you have access\n`;
            response += `      4. Try redeploying\n`;
          } else if (app.errorMessage.includes('key pair') || app.errorMessage.includes('KeyPair')) {
            response += `   ❌ Error: EC2 key pair not found\n`;
            response += `   ✅ Solution:\n`;
            response += `      1. Go to AWS Console → EC2 → Key Pairs\n`;
            response += `      2. Create a new key pair or use existing one\n`;
            response += `      3. Update deployment with correct key pair name\n`;
            response += `      4. Redeploy\n`;
          } else {
            response += `   ❌ Error: ${app.errorMessage.substring(0, 100)}${app.errorMessage.length > 100 ? '...' : ''}\n`;
            response += `   ✅ Solution: Check deployment logs in application details\n`;
          }
        }
        
        response += `   📋 Last updated: ${new Date(app.updatedAt).toLocaleString()}\n`;
      });
    }
    
    // Show failed deployments
    if (failedDeployments.length > 0) {
      response += `\n**Failed Deployments:**\n`;
      failedDeployments.forEach((dep, index) => {
        response += `\n${index + 1}. **${dep.resourceType?.toUpperCase() || 'Resource'}**\n`;
        response += `   Status: ${dep.status}\n`;
        if (dep.errorMessage) {
          response += `   Error: ${dep.errorMessage.substring(0, 100)}${dep.errorMessage.length > 100 ? '...' : ''}\n`;
        }
        response += `   Date: ${new Date(dep.createdAt).toLocaleString()}\n`;
      });
    }
    
    response += `\n**Need more help?**\n`;
    response += `• Click "View" on the failed application for detailed logs\n`;
    response += `• Check AWS account credentials are valid\n`;
    response += `• Verify EC2 instances have proper IAM roles\n`;
    response += `• Ask me specific questions about the error\n`;
    
    return response;
  }
  
  // Check for greetings
  if (lowerQuestion.match(/^(hi|hello|hey|good morning|good afternoon)/)) {
    let greeting = `Hello! I'm your RaDynamics AI assistant. 👋\n\n`;
    
    // Add personalized context
    if (userContext.applicationsCount > 0) {
      greeting += `I see you have ${userContext.applicationsCount} application(s) deployed.\n`;
    }
    if (userContext.awsAccountsCount > 0) {
      greeting += `You have ${userContext.awsAccountsCount} AWS account(s) connected.\n`;
    }
    
    greeting += `\nI can help you with:\n`;
    greeting += `• 🔍 Troubleshooting deployment errors\n`;
    greeting += `• 🚀 Deploying applications and resources\n`;
    greeting += `• ☁️  AWS service information\n`;
    greeting += `• 📊 Checking your deployment status\n`;
    greeting += `• ⚙️  Configuration and setup help\n`;
    greeting += `\nWhat would you like to know?`;
    
    return greeting;
  }
  
  // Check for service information
  for (const [key, service] of Object.entries(knowledgeBase.services)) {
    if (lowerQuestion.includes(key) || lowerQuestion.includes(service.name.toLowerCase())) {
      return `**${service.name}**\n\n${service.description}\n\n**Common Use Cases:**\n${service.useCases.map(uc => `• ${uc}`).join('\n')}\n\n**Pricing:** ${service.pricing}\n\nWould you like to deploy ${service.name}?`;
    }
  }
  
  // Check for how-to questions
  for (const [key, howTo] of Object.entries(knowledgeBase.howTo)) {
    if (lowerQuestion.includes(key)) {
      return howTo;
    }
  }
  
  // Check for deployment questions
  if (lowerQuestion.includes('deploy') && !lowerQuestion.includes('how')) {
    return `I can help you deploy various AWS resources:\n\n**Available Services:**\n• EC2 - Virtual servers\n• S3 - Object storage\n• IAM - User management\n• Applications - From GitHub or Docker\n\nWhich service would you like to deploy?`;
  }
  
  // Check for account questions
  if (lowerQuestion.includes('account') || lowerQuestion.includes('aws account')) {
    if (userContext.awsAccountsCount > 0) {
      return `You currently have ${userContext.awsAccountsCount} AWS account(s) connected.\n\nYou can:\n• View accounts in AWS Accounts page\n• Add new accounts\n• Update existing accounts\n• Deploy resources using these accounts\n\nNeed help with anything specific?`;
    } else {
      return `You don't have any AWS accounts connected yet.\n\nTo add an AWS account:\n1. Go to AWS Accounts page\n2. Click "Add AWS Account"\n3. Enter your AWS credentials\n4. Select region\n5. Click Add\n\nWould you like help getting your AWS credentials?`;
    }
  }
  
  // Check for deployment status with REAL data
  if (lowerQuestion.includes('deployment') || lowerQuestion.includes('status') || lowerQuestion.includes('my deployment')) {
    const deployments = await Deployment.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10);
    
    if (deployments.length > 0) {
      let response = `You have ${deployments.length} deployment(s):\n\n`;
      
      const statusCounts = {
        completed: 0,
        failed: 0,
        pending: 0,
        inProgress: 0
      };
      
      deployments.forEach((dep) => {
        if (dep.status === 'completed') statusCounts.completed++;
        else if (dep.status === 'failed') statusCounts.failed++;
        else if (dep.status === 'pending') statusCounts.pending++;
        else statusCounts.inProgress++;
      });
      
      response += `**Summary:**\n`;
      response += `✅ Completed: ${statusCounts.completed}\n`;
      response += `❌ Failed: ${statusCounts.failed}\n`;
      response += `⏳ Pending: ${statusCounts.pending}\n`;
      response += `🔄 In Progress: ${statusCounts.inProgress}\n\n`;
      
      response += `**Recent Deployments:**\n`;
      deployments.slice(0, 5).forEach((dep, index) => {
        const statusEmoji = dep.status === 'completed' ? '✅' : 
                           dep.status === 'failed' ? '❌' : 
                           dep.status === 'pending' ? '⏳' : '🔄';
        
        response += `${index + 1}. ${statusEmoji} ${dep.resourceType?.toUpperCase() || 'Resource'} - ${dep.status}\n`;
        response += `   Date: ${new Date(dep.createdAt).toLocaleString()}\n`;
        
        if (dep.status === 'failed' && dep.errorMessage) {
          response += `   Error: ${dep.errorMessage.substring(0, 60)}...\n`;
        }
      });
      
      response += `\n**View all deployments:** Go to Deployments page\n`;
      
      if (statusCounts.failed > 0) {
        response += `\n⚠️  You have ${statusCounts.failed} failed deployment(s). Ask me "what errors do I have?" for help.`;
      }
      
      return response;
    } else {
      return `You don't have any deployments yet.\n\n**Ready to deploy?**\n\n**Available Services:**\n• 💻 EC2 - Virtual servers\n• 📦 S3 - Object storage\n• 👤 IAM - User management\n• 🐳 Applications - From GitHub or Docker\n\n**Quick Start:**\n1. Ensure you have an AWS account connected\n2. Choose a service from the Deploy menu\n3. Configure your resource\n4. Click Deploy!\n\nWhat would you like to deploy first?`;
    }
  }
  
  // Check for application questions with REAL data
  if (lowerQuestion.includes('application') || lowerQuestion.includes('my app')) {
    const apps = await Application.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(10)
      .populate('aws.accountId', 'accountName region');
    
    if (apps.length > 0) {
      let response = `You have ${apps.length} application(s):\n\n`;
      
      apps.forEach((app, index) => {
        const statusEmoji = app.status === 'running' ? '✅' : 
                           app.status === 'failed' ? '❌' : 
                           app.status === 'pending' ? '⏳' : '🔄';
        
        response += `${index + 1}. ${statusEmoji} **${app.name}**\n`;
        response += `   Status: ${app.status}\n`;
        response += `   Image: ${app.docker?.image || app.github?.repoUrl || 'N/A'}\n`;
        response += `   Target: ${app.deploymentTarget?.toUpperCase() || 'Unknown'}\n`;
        response += `   Region: ${app.aws?.accountId?.region || app.aws?.region || 'N/A'}\n`;
        
        if (app.url) {
          response += `   URL: ${app.url}\n`;
        }
        
        if (app.status === 'failed' && app.errorMessage) {
          response += `   ⚠️  Error: ${app.errorMessage.substring(0, 80)}...\n`;
        }
        
        response += `\n`;
      });
      
      response += `**Actions you can take:**\n`;
      response += `• View details: Click "View" on any application\n`;
      response += `• Redeploy: Click "Redeploy" to update\n`;
      response += `• Start/Stop: Control running applications\n`;
      response += `• Check logs: View deployment logs for troubleshooting\n`;
      
      return response;
    } else {
      return `You haven't deployed any applications yet.\n\n**Quick Start:**\n\n1. Go to Applications → Deploy New Application\n2. Choose deployment method:\n   • **GitHub** - Deploy from source code\n   • **Docker** - Deploy pre-built images\n3. Select deployment target:\n   • **ECS/Fargate** - Serverless containers\n   • **EC2** - Your own servers\n4. Configure and deploy!\n\n**Example:** Deploy a Docker image like nginx:latest to test the system.\n\nReady to deploy your first application?`;
    }
  }
  
  // Check for pricing questions
  if (lowerQuestion.includes('price') || lowerQuestion.includes('cost')) {
    return `AWS pricing varies by service:\n\n**EC2:** Pay per hour/second based on instance type\n**S3:** Pay per GB stored + data transfer\n**IAM:** Free\n**ECS/Fargate:** Pay for CPU and memory used\n**RDS:** Pay per hour based on instance type\n\n**Cost Optimization Tips:**\n• Use t2.micro for testing (free tier eligible)\n• Stop instances when not in use\n• Use S3 lifecycle policies\n• Monitor usage with AWS Cost Explorer\n\nNeed specific pricing for a service?`;
    }
  
  // Check for help/support
  if (lowerQuestion.includes('help') || lowerQuestion.includes('support')) {
    return `I'm here to help! I can assist with:\n\n**AWS Services:**\n• EC2, S3, IAM, ECS, RDS information\n• Service comparisons\n• Best practices\n\n**Deployments:**\n• How to deploy resources\n• Troubleshooting\n• Configuration help\n\n**Account Management:**\n• Adding AWS accounts\n• Managing credentials\n• Security settings\n\nWhat specific help do you need?`;
  }
  
  // Default response
  return `I understand you're asking about "${question}".\n\nI can help you with:\n• AWS service information (EC2, S3, IAM, etc.)\n• Deployment guidance\n• Account management\n• Application deployment\n• Troubleshooting\n\nCould you please rephrase your question or ask about a specific AWS service or task?`;
}

// Chat endpoint
router.post('/ask', authenticateToken, async (req, res) => {
  try {
    const { question } = req.body;
    const userId = req.user.userId;
    
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    // Get user context
    const [awsAccounts, deployments, applications] = await Promise.all([
      AWSAccount.countDocuments({ userId }),
      Deployment.countDocuments({ userId }),
      Application.countDocuments({ userId })
    ]);
    
    const userContext = {
      awsAccountsCount: awsAccounts,
      deploymentsCount: deployments,
      applicationsCount: applications
    };
    
    // Generate AI response with real context
    const answer = await generateResponse(question, userContext, userId);
    
    res.json({
      success: true,
      answer,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({
      error: 'Failed to process question',
      message: error.message
    });
  }
});

// Get chat history (optional - for future implementation)
router.get('/history', authenticateToken, async (req, res) => {
  try {
    // TODO: Implement chat history storage
    res.json({
      success: true,
      history: []
    });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

export default router;
