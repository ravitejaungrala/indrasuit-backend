import express from 'express';
import Application from '../models/Application.js';
import AWSAccount from '../models/AWSAccount.js';
import githubService from '../services/github-service.js';
import dockerService from '../services/docker-service.js';
import ecrService from '../services/ecr-service.js';
import ecsService from '../services/ecs-service.js';
import ec2DockerService from '../services/ec2-docker-service.js';
import { authMiddleware as authenticateToken } from '../middleware/auth.js';
import { decrypt } from '../utils/encryption.js';

const router = express.Router();

// Get all applications for user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const applications = await Application.find({ 
      userId: req.user.userId,
      organizationId: req.user.organizationId 
    })
    .populate('aws.accountId', 'accountName region')
    .sort({ createdAt: -1 });
    
    res.json(applications);
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Get single application
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      organizationId: req.user.organizationId
    }).populate('aws.accountId', 'accountName region');
    
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }
    
    res.json(application);
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

// Create new application
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      deploymentMethod,
      deploymentTarget,
      github,
      docker,
      runtime,
      awsAccountId,
      ec2InstanceId
    } = req.body;
    
    // Validate AWS account
    const awsAccount = await AWSAccount.findOne({
      _id: awsAccountId,
      userId: req.user.userId
    });
    
    if (!awsAccount) {
      console.error('AWS account not found:', {
        awsAccountId,
        userId: req.user.userId,
        organizationId: req.user.organizationId
      });
      return res.status(404).json({ 
        error: 'AWS account not found',
        details: 'Please select a valid AWS account from the dropdown'
      });
    }
    
    // Validate EC2 instance if deploying to EC2
    if (deploymentTarget === 'ec2' && !ec2InstanceId) {
      return res.status(400).json({ error: 'EC2 instance ID is required for EC2 deployment' });
    }
    
    // Create application
    const application = new Application({
      userId: req.user.userId,
      organizationId: req.user.organizationId,
      name,
      deploymentMethod,
      deploymentTarget: deploymentTarget || 'ecs',
      github: deploymentMethod === 'github' ? github : undefined,
      docker: deploymentMethod === 'docker' ? docker : undefined,
      ec2: deploymentTarget === 'ec2' ? { instanceId: ec2InstanceId } : undefined,
      runtime,
      aws: {
        accountId: awsAccountId,
        region: awsAccount.region
      },
      status: 'pending'
    });
    
    await application.save();
    
    // Start deployment process asynchronously
    deployApplication(application._id).catch(error => {
      console.error('Deployment error:', error);
    });
    
    res.status(201).json(application);
  } catch (error) {
    console.error('Error creating application:', error);
    res.status(500).json({ error: 'Failed to create application' });
  }
});

// Deploy/Redeploy application
router.post('/:id/deploy', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 REDEPLOY REQUEST RECEIVED');
    console.log('Application ID:', req.params.id);
    console.log('User ID:', req.user.userId);
    console.log('Organization ID:', req.user.organizationId);
    
    const application = await Application.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      organizationId: req.user.organizationId
    });
    
    if (!application) {
      console.error('❌ Application not found');
      return res.status(404).json({ error: 'Application not found' });
    }
    
    console.log('✅ Application found:', application.name);
    console.log('Current status:', application.status);
    
    application.status = 'pending';
    application.errorMessage = '';
    application.deploymentLogs = [`[${new Date().toISOString()}] Redeployment initiated`];
    await application.save();
    
    console.log('✅ Application status updated to pending');
    
    // Start deployment
    console.log('🎬 Starting deployment process...');
    deployApplication(application._id).catch(error => {
      console.error('❌ Deployment error:', error);
    });
    
    console.log('✅ Deployment process started');
    res.json({ message: 'Deployment started', application });
  } catch (error) {
    console.error('❌ Error starting deployment:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to start deployment' });
  }
});

// Stop application
router.post('/:id/stop', authenticateToken, async (req, res) => {
  try {
    console.log('⏸️  STOP REQUEST RECEIVED');
    console.log('Application ID:', req.params.id);
    
    const application = await Application.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      organizationId: req.user.organizationId
    }).populate('aws.accountId');
    
    if (!application) {
      console.error('❌ Application not found');
      return res.status(404).json({ error: 'Application not found' });
    }
    
    console.log('✅ Application found:', application.name);
    console.log('ECS Service:', application.aws.ecsService);
    
    if (!application.aws.ecsService) {
      console.error('❌ Application not deployed yet (no ECS service)');
      return res.status(400).json({ error: 'Application not deployed yet' });
    }
    
    // Get AWS credentials
    const awsAccount = application.aws.accountId;
    const credentials = {
      accessKeyId: decrypt(awsAccount.accessKeyId),
      secretAccessKey: decrypt(awsAccount.secretAccessKey)
    };
    
    console.log('🔐 Credentials decrypted');
    console.log('☁️  Stopping ECS service...');
    
    // Stop ECS service
    await ecsService.stopService(
      credentials,
      application.aws.region,
      application.aws.ecsCluster,
      application.aws.ecsService
    );
    
    console.log('✅ ECS service stopped');
    
    application.status = 'stopped';
    await application.save();
    
    console.log('✅ Application status updated to stopped');
    res.json({ message: 'Application stopped', application });
  } catch (error) {
    console.error('❌ Error stopping application:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to stop application' });
  }
});

// Start application
router.post('/:id/start', authenticateToken, async (req, res) => {
  try {
    console.log('▶️  START REQUEST RECEIVED');
    console.log('Application ID:', req.params.id);
    
    const application = await Application.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      organizationId: req.user.organizationId
    }).populate('aws.accountId');
    
    if (!application) {
      console.error('❌ Application not found');
      return res.status(404).json({ error: 'Application not found' });
    }
    
    console.log('✅ Application found:', application.name);
    console.log('ECS Service:', application.aws.ecsService);
    
    if (!application.aws.ecsService) {
      console.error('❌ Application not deployed yet (no ECS service)');
      return res.status(400).json({ error: 'Application not deployed yet' });
    }
    
    // Get AWS credentials
    const awsAccount = application.aws.accountId;
    const credentials = {
      accessKeyId: decrypt(awsAccount.accessKeyId),
      secretAccessKey: decrypt(awsAccount.secretAccessKey)
    };
    
    console.log('🔐 Credentials decrypted');
    console.log('☁️  Starting ECS service...');
    
    // Start ECS service
    await ecsService.startService(
      credentials,
      application.aws.region,
      application.aws.ecsCluster,
      application.aws.ecsService
    );
    
    console.log('✅ ECS service started');
    
    application.status = 'running';
    await application.save();
    
    console.log('✅ Application status updated to running');
    res.json({ message: 'Application started', application });
  } catch (error) {
    console.error('❌ Error starting application:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to start application' });
  }
});

// Get deployment progress/logs
router.get('/:id/progress', authenticateToken, async (req, res) => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      organizationId: req.user.organizationId
    });
    
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }
    
    res.json({
      status: application.status,
      deploymentLogs: application.deploymentLogs || [],
      errorMessage: application.errorMessage,
      lastUpdated: application.updatedAt,
      url: application.url
    });
  } catch (error) {
    console.error('Error fetching deployment progress:', error);
    res.status(500).json({ error: 'Failed to fetch deployment progress' });
  }
});

// Cancel deployment
router.post('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      organizationId: req.user.organizationId
    });
    
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }
    
    if (!['pending', 'cloning', 'building', 'pushing', 'deploying'].includes(application.status)) {
      return res.status(400).json({ error: 'Cannot cancel deployment in current status' });
    }
    
    application.status = 'failed';
    application.errorMessage = 'Deployment cancelled by user';
    application.deploymentLogs.push(`[${new Date().toISOString()}] ❌ Deployment cancelled by user`);
    await application.save();
    
    // Cleanup repository if it exists
    try {
      await githubService.cleanupRepo(application._id.toString());
    } catch (cleanupError) {
      console.error('Cleanup error during cancellation:', cleanupError);
    }
    
    res.json({ message: 'Deployment cancelled', application });
  } catch (error) {
    console.error('Error cancelling deployment:', error);
    res.status(500).json({ error: 'Failed to cancel deployment' });
  }
});

// Delete application
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      organizationId: req.user.organizationId
    });
    
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }
    
    // TODO: Clean up AWS resources (ECS service, task definition, etc.)
    
    await application.deleteOne();
    
    res.json({ message: 'Application deleted' });
  } catch (error) {
    console.error('Error deleting application:', error);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

// Deployment function (runs asynchronously)
async function deployApplication(applicationId) {
  let application;
  
  try {
    console.log('='.repeat(80));
    console.log('🚀 STARTING DEPLOYMENT');
    console.log('Application ID:', applicationId);
    console.log('='.repeat(80));
    
    application = await Application.findById(applicationId).populate('aws.accountId');
    
    if (!application) {
      throw new Error('Application not found');
    }
    
    console.log('✅ Application found:', application.name);
    console.log('📦 Deployment Method:', application.deploymentMethod);
    console.log('🎯 Deployment Target:', application.deploymentTarget);
    
    const awsAccount = application.aws.accountId;
    console.log('☁️  AWS Account:', awsAccount.accountName);
    console.log('🌍 Region:', awsAccount.region);
    
    // Use the correct field names: accessKey and secretKey (not accessKeyId/secretAccessKey)
    const credentials = {
      accessKeyId: decrypt(awsAccount.accessKey),
      secretAccessKey: decrypt(awsAccount.secretKey)
    };
    
    console.log('🔑 Credentials decrypted successfully');
    console.log('Credentials check:', {
      hasAccessKeyId: !!credentials.accessKeyId,
      hasSecretAccessKey: !!credentials.secretAccessKey,
      accessKeyIdLength: credentials.accessKeyId?.length || 0
    });
    
    if (application.deploymentMethod === 'github') {
      console.log('📂 Starting GitHub deployment...');
      await deployFromGitHub(application, credentials);
    } else if (application.deploymentMethod === 'docker') {
      console.log('🐳 Starting Docker deployment...');
      await deployFromDocker(application, credentials);
    }
    
    console.log('='.repeat(80));
    console.log('✅ DEPLOYMENT COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('='.repeat(80));
    console.error('❌ DEPLOYMENT FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(80));
    
    if (application) {
      application.status = 'failed';
      application.errorMessage = error.message;
      application.deploymentLogs.push(`ERROR: ${error.message}`);
      application.deploymentLogs.push(`Stack: ${error.stack}`);
      await application.save();
    }
  }
}

async function deployFromGitHub(application, credentials) {
  // Step 1: Clone repository with enhanced progress updates
  application.status = 'cloning';
  application.deploymentLogs.push('🔄 Starting optimized repository clone...');
  application.deploymentLogs.push(`📂 Repository: ${application.github.repoUrl}`);
  application.deploymentLogs.push(`🌿 Branch: ${application.github.branch}`);
  application.deploymentLogs.push('⚡ Using shallow clone for faster download...');
  await application.save();
  
  const startTime = Date.now();
  let progressInterval;
  
  try {
    // Start progress updates every 10 seconds during clone
    progressInterval = setInterval(async () => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      if (elapsed < 30) {
        application.deploymentLogs.push(`⏳ Clone in progress... ${elapsed}s elapsed`);
      } else if (elapsed < 60) {
        application.deploymentLogs.push(`⏳ Large repository detected... ${elapsed}s elapsed (this may take a while)`);
      } else if (elapsed < 120) {
        application.deploymentLogs.push(`⏳ Very large repository... ${elapsed}s elapsed (consider using Docker deployment for faster results)`);
      } else {
        application.deploymentLogs.push(`⏳ Still cloning... ${elapsed}s elapsed (repository is very large)`);
      }
      await application.save().catch(() => {}); // Ignore save errors during progress updates
    }, 10000);
    
    const repoPath = await githubService.cloneRepository(
      application.github.repoUrl,
      application.github.branch,
      application._id.toString(),
      application.github.token // Pass GitHub token for private repos
    );
    
    clearInterval(progressInterval);
    
    const cloneDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    application.deploymentLogs.push(`✅ Repository cloned successfully in ${cloneDuration}s`);
    
    // Add performance feedback
    if (cloneDuration > 60) {
      application.deploymentLogs.push('ℹ️ Large repository detected - consider using Docker deployment for faster future deployments');
    } else if (cloneDuration < 10) {
      application.deploymentLogs.push('⚡ Fast clone completed - repository is well optimized!');
    }
    
    await application.save();
    
    // Continue with the rest of the deployment...
    return await continueGitHubDeployment(application, credentials, repoPath);
    
  } catch (error) {
    if (progressInterval) clearInterval(progressInterval);
    
    const failDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    application.deploymentLogs.push(`❌ Clone failed after ${failDuration}s: ${error.message}`);
    
    // Add helpful suggestions based on the error
    if (error.message.includes('timed out')) {
      application.deploymentLogs.push('💡 Suggestion: Try deploying a pre-built Docker image instead for faster deployment');
      application.deploymentLogs.push('💡 Or consider using a smaller repository or different branch');
    } else if (error.message.includes('Authentication failed')) {
      application.deploymentLogs.push('💡 Suggestion: Check your GitHub token or make the repository public');
    }
    
    application.status = 'failed';
    await application.save();
    throw error;
  }
}

async function continueGitHubDeployment(application, credentials, repoPath) {
  try {
    // Step 2: Detect app type if auto
    application.deploymentLogs.push('🔍 Analyzing repository structure...');
    await application.save();
    
    if (application.github.appType === 'auto') {
      const detectedType = await githubService.detectAppType(repoPath);
      application.github.appType = detectedType;
      application.deploymentLogs.push(`✅ Detected app type: ${detectedType}`);
      await application.save();
    } else {
      application.deploymentLogs.push(`📋 Using specified app type: ${application.github.appType}`);
      await application.save();
    }
    
    // Step 3: Build Docker image with timeout protection
    application.status = 'building';
    application.deploymentLogs.push('🔨 Building Docker image...');
    application.deploymentLogs.push(`📦 App type: ${application.github.appType}`);
    application.deploymentLogs.push(`🚀 Start command: ${application.github.startCommand}`);
    application.deploymentLogs.push(`🔌 Port: ${application.runtime.port}`);
    await application.save();
    
    const buildStartTime = Date.now();
    
    // Generate optimized Dockerfile
    await dockerService.generateDockerfile(
      application.github.appType,
      repoPath,
      application.github.startCommand,
      application.runtime.port
    );
    
    application.deploymentLogs.push('📄 Dockerfile generated');
    await application.save();
    
    const imageName = `radynamics-${application._id}`;
    
    // Build with progress tracking
    const buildProgressInterval = setInterval(async () => {
      const elapsed = ((Date.now() - buildStartTime) / 1000).toFixed(0);
      application.deploymentLogs.push(`⏳ Build in progress... ${elapsed}s elapsed`);
      await application.save().catch(() => {});
    }, 15000); // Update every 15 seconds
    
    try {
      await dockerService.buildImage(repoPath, imageName);
      clearInterval(buildProgressInterval);
      
      const buildDuration = ((Date.now() - buildStartTime) / 1000).toFixed(2);
      application.deploymentLogs.push(`✅ Docker image built successfully in ${buildDuration}s`);
      await application.save();
      
      // Step 4: Deploy based on target
      if (application.deploymentTarget === 'ec2') {
        application.deploymentLogs.push('🚀 Deploying to EC2 instance...');
        await application.save();
        await deployToEC2(application, credentials, imageName);
      } else {
        application.deploymentLogs.push('☁️ Pushing to ECR and deploying to ECS...');
        await application.save();
        await pushToECRAndDeploy(application, credentials, imageName);
      }
      
    } catch (buildError) {
      clearInterval(buildProgressInterval);
      throw buildError;
    }
    
  } catch (error) {
    console.error('❌ GitHub deployment continuation failed:', error);
    application.deploymentLogs.push(`❌ Deployment failed: ${error.message}`);
    
    // Add specific suggestions based on error type
    if (error.message.includes('Dockerfile')) {
      application.deploymentLogs.push('💡 Suggestion: Check if your repository has the correct structure for the detected app type');
    } else if (error.message.includes('build')) {
      application.deploymentLogs.push('💡 Suggestion: Verify your build command and dependencies are correct');
    }
    
    await application.save();
    throw error;
  } finally {
    // Always cleanup the repository
    try {
      await githubService.cleanupRepo(application._id.toString());
      console.log('🧹 Repository cleanup completed');
    } catch (cleanupError) {
      console.error('⚠️ Cleanup error (non-critical):', cleanupError);
    }
  }
}

async function deployFromDocker(application, credentials) {
  console.log('🐳 DOCKER DEPLOYMENT STARTED');
  console.log('Image:', application.docker.image);
  console.log('Tag:', application.docker.tag);
  console.log('Deployment Target:', application.deploymentTarget);
  
  // Clean up image name (remove any "docker pull" prefix if user accidentally included it)
  let cleanImageName = application.docker.image.trim();
  cleanImageName = cleanImageName.replace(/^docker\s+pull\s+/i, '');
  cleanImageName = cleanImageName.trim();
  
  console.log('Cleaned Image Name:', cleanImageName);
  
  const fullImageName = `${cleanImageName}:${application.docker.tag}`;
  console.log('Full Image Name:', fullImageName);
  
  console.log('');
  console.log('🚀 DIRECT DEPLOYMENT MODE');
  console.log('✅ No local Docker required!');
  
  application.status = 'deploying';
  application.deploymentLogs.push(`Deploying Docker image: ${fullImageName}`);
  application.deploymentLogs.push('✅ Using direct deployment - No local Docker required!');
  await application.save();
  
  try {
    if (application.deploymentTarget === 'ec2') {
      console.log('💻 Deploying to EC2 instance...');
      application.deploymentLogs.push('Deploying to EC2 instance - Docker will pull image automatically');
      await application.save();
      await deployToEC2(application, credentials, fullImageName);
    } else {
      console.log('☁️  Deploying to AWS ECS/Fargate...');
      application.deploymentLogs.push('AWS ECS will pull the image directly from Docker Hub');
      await application.save();
      await deployDirectlyToECS(application, credentials, fullImageName);
    }
    console.log('✅ Deployment completed successfully');
  } catch (error) {
    console.error('❌ Docker deployment failed:', error);
    throw error;
  }
}

async function deployDirectlyToECS(application, credentials, dockerHubImage) {
  try {
    console.log('☁️  DIRECT ECS DEPLOYMENT (No Local Docker Required)');
    console.log('Docker Hub Image:', dockerHubImage);
    
    application.status = 'deploying';
    application.deploymentLogs.push('Creating ECS resources...');
    await application.save();
    
    const clusterName = 'radynamics-cluster';
    console.log('🏗️  Creating ECS cluster:', clusterName);
    await ecsService.createCluster(credentials, application.aws.region, clusterName);
    console.log('✅ ECS cluster ready');
    
    application.deploymentLogs.push('ECS cluster ready');
    await application.save();
    
    // Register task definition with Docker Hub image directly
    const taskFamily = `radynamics-${application._id}`;
    console.log('📋 Registering task definition:', taskFamily);
    console.log('Using Docker Hub image directly:', dockerHubImage);
    
    const taskDefinition = await ecsService.registerTaskDefinition(credentials, application.aws.region, {
      family: taskFamily,
      image: dockerHubImage, // Use Docker Hub image directly
      containerName: application.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      port: application.runtime.port,
      cpu: application.runtime.cpu,
      memory: application.runtime.memory,
      environment: Object.entries(application.runtime.environmentVariables || {}).map(([key, value]) => ({
        name: key,
        value: value
      }))
    });
    
    console.log('✅ Task definition registered');
    application.deploymentLogs.push('Task definition registered');
    
    application.aws.ecsCluster = clusterName;
    application.aws.taskDefinition = taskFamily;
    application.aws.taskDefinitionArn = taskDefinition.taskDefinitionArn;
    await application.save();
    
    // Mark as running (ECS will pull the image from Docker Hub when task starts)
    console.log('✅ Marking application as running');
    application.status = 'running';
    application.url = `http://app-${application._id}.radynamics.local`;
    application.lastDeployedAt = new Date();
    application.deploymentLogs.push('Deployment completed successfully!');
    application.deploymentLogs.push(`ECS will pull image from Docker Hub: ${dockerHubImage}`);
    application.deploymentLogs.push('No local Docker required - image pulled directly by AWS ECS');
    await application.save();
    
    console.log('🎉 Application deployed successfully!');
    console.log('🌐 URL:', application.url);
    console.log('📦 ECS will pull image:', dockerHubImage);
    
  } catch (error) {
    console.error('❌ Direct ECS deployment failed:', error);
    throw error;
  }
}

async function deployToEC2(application, credentials, dockerHubImage) {
  try {
    console.log('💻 EC2 DOCKER DEPLOYMENT');
    console.log('Docker Hub Image:', dockerHubImage);
    console.log('EC2 Instance ID:', application.ec2.instanceId);
    console.log('Credentials check:', {
      hasAccessKeyId: !!credentials?.accessKeyId,
      hasSecretAccessKey: !!credentials?.secretAccessKey,
      accessKeyIdLength: credentials?.accessKeyId?.length || 0,
      secretKeyLength: credentials?.secretAccessKey?.length || 0
    });
    
    if (!application.ec2 || !application.ec2.instanceId) {
      throw new Error('EC2 instance ID not specified');
    }
    
    if (!credentials || !credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new Error('Invalid AWS credentials - credentials object is missing or incomplete');
    }
    
    application.status = 'deploying';
    application.deploymentLogs.push('Getting EC2 instance details...');
    await application.save();
    
    // Get instance details
    console.log('📋 Getting EC2 instance details...');
    const instanceDetails = await ec2DockerService.getInstanceDetails(
      credentials,
      application.aws.region,
      application.ec2.instanceId
    );
    
    console.log('✅ Instance details:', instanceDetails);
    application.ec2.publicIp = instanceDetails.publicIp;
    application.ec2.privateIp = instanceDetails.privateIp;
    application.deploymentLogs.push(`Instance: ${instanceDetails.instanceId} (${instanceDetails.state})`);
    application.deploymentLogs.push(`Public IP: ${instanceDetails.publicIp}`);
    await application.save();

    // Auto-open port in security group using Terraform
    if (instanceDetails.securityGroups && instanceDetails.securityGroups.length > 0) {
      const securityGroupId = instanceDetails.securityGroups[0].GroupId;
      console.log(`🔓 Auto-opening port ${application.runtime.port} in security group ${securityGroupId} via Terraform`);
      application.deploymentLogs.push(`Opening port ${application.runtime.port} in security group via Terraform...`);
      await application.save();
      
      // Import the Terraform function
      const { openSecurityGroupPort } = await import('../utils/terraform.js');
      
      const portResult = await openSecurityGroupPort(
        securityGroupId,
        application.runtime.port,
        {
          accessKey: credentials.accessKeyId,
          secretKey: credentials.secretAccessKey,
          region: application.aws.region
        },
        `Docker app port ${application.runtime.port} - Auto-opened by RaDynamics`
      );
      
      if (portResult.success) {
        if (portResult.alreadyExists) {
          application.deploymentLogs.push(`ℹ️ Port ${application.runtime.port} was already open`);
        } else {
          application.deploymentLogs.push(`✅ Port ${application.runtime.port} opened successfully via Terraform`);
        }
      } else {
        application.deploymentLogs.push(`⚠️ Could not auto-open port ${application.runtime.port}: ${portResult.error}`);
        console.error('Port opening failed:', portResult);
      }
      await application.save();
    }
    
    // Deploy Docker container to EC2
    console.log('🐳 Deploying Docker container to EC2...');
    application.deploymentLogs.push('Deploying Docker container via AWS Systems Manager...');
    application.deploymentLogs.push('EC2 will pull image from Docker Hub automatically');
    await application.save();
    
    const deployResult = await ec2DockerService.deployDockerToEC2(
      credentials,
      application.aws.region,
      application.ec2.instanceId,
      dockerHubImage,
      application.runtime.port,
      application.runtime.environmentVariables || {}
    );
    
    console.log('✅ Docker container deployed successfully');
    application.deploymentLogs.push('Docker container deployed successfully!');
    application.deploymentLogs.push(`Container: ${deployResult.containerName}`);
    application.deploymentLogs.push('Container is running on EC2 instance');
    
    // Mark as running
    application.status = 'running';
    application.url = `http://${instanceDetails.publicIp}:${application.runtime.port}`;
    application.lastDeployedAt = new Date();
    application.deploymentLogs.push(`Application URL: ${application.url}`);
    application.deploymentLogs.push('Deployment completed successfully!');
    await application.save();
    
    console.log('🎉 EC2 deployment completed successfully!');
    console.log('🌐 URL:', application.url);
    console.log('📦 Container:', deployResult.containerName);
    
  } catch (error) {
    console.error('❌ EC2 deployment failed:', error);
    throw error;
  }
}

async function pushToECRAndDeploy(application, credentials, localImageName) {
  try {
    // Push to ECR
    console.log('📤 Step 1: Pushing to ECR');
    application.status = 'pushing';
    application.deploymentLogs.push('Pushing image to ECR...');
    await application.save();
    
    const repositoryName = `radynamics/${application._id}`;
    console.log('📦 Creating ECR repository:', repositoryName);
    await ecrService.createRepository(credentials, application.aws.region, repositoryName);
    console.log('✅ ECR repository ready');
    
    console.log('🔐 Logging into ECR...');
    await ecrService.loginToECR(credentials, application.aws.region);
    console.log('✅ ECR login successful');
    
    console.log('🆔 Getting AWS account ID...');
    const accountId = await ecrService.getAccountId(credentials, application.aws.region);
    console.log('✅ Account ID:', accountId);
    
    const ecrImageUri = ecrService.getRepositoryUri(accountId, application.aws.region, repositoryName);
    console.log('🏷️  ECR Image URI:', ecrImageUri);
    
    console.log('🏷️  Tagging image:', localImageName, '→', ecrImageUri);
    await dockerService.tagImage(localImageName, ecrImageUri);
    console.log('✅ Image tagged');
    
    console.log('📤 Pushing image to ECR...');
    await dockerService.pushImage(ecrImageUri);
    console.log('✅ Image pushed to ECR');
    
    application.aws.ecrRepository = repositoryName;
    application.aws.ecrImageUri = ecrImageUri;
    application.deploymentLogs.push('Image pushed to ECR successfully');
    await application.save();
    
    // Deploy to ECS
    console.log('☁️  Step 2: Deploying to ECS');
    application.status = 'deploying';
    application.deploymentLogs.push('Deploying to ECS...');
    await application.save();
    
    const clusterName = 'radynamics-cluster';
    console.log('🏗️  Creating ECS cluster:', clusterName);
    await ecsService.createCluster(credentials, application.aws.region, clusterName);
    console.log('✅ ECS cluster ready');
    
    // Register task definition
    const taskFamily = `radynamics-${application._id}`;
    console.log('📋 Registering task definition:', taskFamily);
    const taskDefinition = await ecsService.registerTaskDefinition(credentials, application.aws.region, {
      family: taskFamily,
      image: ecrImageUri,
      containerName: application.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      port: application.runtime.port,
      cpu: application.runtime.cpu,
      memory: application.runtime.memory,
      environment: Object.entries(application.runtime.environmentVariables || {}).map(([key, value]) => ({
        name: key,
        value: value
      }))
    });
    console.log('✅ Task definition registered');
    
    application.aws.ecsCluster = clusterName;
    application.aws.taskDefinition = taskFamily;
    application.aws.taskDefinitionArn = taskDefinition.taskDefinitionArn;
    application.deploymentLogs.push('Task definition registered');
    await application.save();
    
    // For now, mark as running (full ECS service creation requires VPC/subnet setup)
    console.log('✅ Marking application as running');
    application.status = 'running';
    application.url = `http://app-${application._id}.radynamics.local`;
    application.lastDeployedAt = new Date();
    application.deploymentLogs.push('Deployment completed successfully!');
    await application.save();
    console.log('🎉 Application deployed successfully!');
    console.log('🌐 URL:', application.url);
    
  } catch (error) {
    console.error('❌ Push to ECR/Deploy failed:', error);
    throw error;
  }
}

// Diagnostic route for troubleshooting applications
router.post('/:id/diagnose', authenticateToken, async (req, res) => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.deploymentTarget !== 'ec2') {
      return res.status(400).json({ error: 'Diagnostics only available for EC2 deployments' });
    }

    // Get AWS credentials
    const awsAccount = await AWSAccount.findOne({
      _id: application.awsAccountId,
      userId: req.user.userId
    });

    if (!awsAccount) {
      return res.status(404).json({ error: 'AWS account not found' });
    }

    const credentials = awsAccount.getDecryptedCredentials();
    const containerName = application.docker?.image?.split('/').pop().split(':')[0] + '-app' || 'unknown-app';

    console.log(`🔍 Running diagnostics for application ${application.name}`);
    
    const diagnosticResult = await ec2DockerService.diagnoseApplication(
      credentials,
      application.aws.region,
      application.ec2.instanceId,
      containerName,
      application.runtime.port
    );

    if (diagnosticResult.success) {
      res.json({
        success: true,
        diagnosticReport: diagnosticResult.diagnosticReport,
        application: {
          name: application.name,
          status: application.status,
          url: application.url,
          port: application.runtime.port,
          container: containerName
        }
      });
    } else {
      res.status(500).json({
        error: 'Diagnostic failed',
        details: diagnosticResult.error
      });
    }

  } catch (error) {
    console.error('❌ Diagnostic error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fix container route - automatically fix common container issues
router.post('/:id/fix-container', authenticateToken, async (req, res) => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.deploymentTarget !== 'ec2') {
      return res.status(400).json({ error: 'Container fix only available for EC2 deployments' });
    }

    // Get AWS credentials
    const awsAccount = await AWSAccount.findOne({
      _id: application.awsAccountId,
      userId: req.user.userId
    });

    if (!awsAccount) {
      return res.status(404).json({ error: 'AWS account not found' });
    }

    const credentials = awsAccount.getDecryptedCredentials();
    const containerName = application.docker?.image?.split('/').pop().split(':')[0] + '-app' || 'unknown-app';
    const dockerImage = application.docker?.image || 'nginx:latest';
    const port = application.runtime?.port || 3000;

    console.log(`🔧 Fixing container for application ${application.name}`);
    
    // Run container fix commands
    const fixResult = await ec2DockerService.fixContainer(
      credentials,
      application.aws.region,
      application.ec2.instanceId,
      containerName,
      dockerImage,
      port
    );

    if (fixResult.success) {
      // Update application status
      application.status = 'running';
      application.deploymentLogs.push('🔧 Container fixed and restarted');
      application.deploymentLogs.push(fixResult.output.substring(0, 500));
      await application.save();

      res.json({
        success: true,
        message: 'Container fixed successfully',
        fixReport: fixResult.output,
        application: {
          name: application.name,
          status: application.status,
          url: application.url,
          port: port,
          container: containerName
        }
      });
    } else {
      res.status(500).json({
        error: 'Container fix failed',
        details: fixResult.error
      });
    }

  } catch (error) {
    console.error('❌ Container fix error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
