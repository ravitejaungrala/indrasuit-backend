import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import Deployment from '../models/Deployment.js';
import AWSAccount from '../models/AWSAccount.js';
import Notification from '../models/Notification.js';
import { executeTerraform } from '../utils/terraform.js';
import { deployLimiter } from '../middleware/rateLimiter.js';
import { validateEC2Deployment, validateS3Deployment, validateIAMDeployment, validateMongoId } from '../middleware/validation.js';
import { auditLogger, setAuditResource } from '../middleware/auditLogger.js';

const router = express.Router();

// Deploy EC2
router.post('/ec2', 
  authMiddleware, 
  deployLimiter,
  validateEC2Deployment,
  auditLogger('deployment_created', 'ec2'),
  async (req, res) => {
  try {
    const {
      instance_name,
      region,
      availability_zone,
      instance_type,
      ami_id,
      key_name,
      vpc_id,
      subnet_id,
      assign_public_ip,
      security_group_ids,
      root_volume_size,
      root_volume_type,
      enable_ebs_encryption,
      iam_role,
      user_data,
      shutdown_behavior,
      enable_monitoring,
      awsAccountId
    } = req.body;

    if (!instance_name || !instance_type || !ami_id || !key_name || !awsAccountId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const awsAccount = await AWSAccount.findOne({
      _id: awsAccountId,
      userId: req.user.userId
    });

    if (!awsAccount) {
      return res.status(404).json({ error: 'AWS account not found' });
    }

    const config = {
      instance_name,
      region: region || awsAccount.region,
      availability_zone,
      instance_type,
      ami_id,
      key_name,
      vpc_id,
      subnet_id,
      assign_public_ip: assign_public_ip !== false,
      security_group_ids: security_group_ids || [],
      root_volume_size: root_volume_size || 20,
      root_volume_type: root_volume_type || 'gp3',
      enable_ebs_encryption: enable_ebs_encryption !== false,
      iam_role,
      user_data,
      shutdown_behavior: shutdown_behavior || 'stop',
      enable_monitoring: enable_monitoring || false
    };

    const deployment = new Deployment({
      userId: req.user.userId,
      awsAccountId,
      resourceType: 'ec2',
      resourceName: instance_name,
      config,
      status: 'pending'
    });

    await deployment.save();

    // Increment organization usage
    if (req.organization) {
      req.organization.incrementUsage('deployment');
      await req.organization.save();
    }

    // Create notification for deployment started
    try {
      await Notification.createNotification({
        userId: req.user.userId,
        type: 'deployment_started',
        title: 'EC2 Deployment Started',
        message: `Starting deployment of EC2 instance "${instance_name}" in ${config.region}`,
        priority: 'low',
        data: {
          deploymentId: deployment._id,
          resourceName: instance_name,
          resourceType: 'ec2'
        }
      });
      console.log('✅ Notification created for deployment start'); // Debug log
    } catch (notifError) {
      console.error('⚠️ Failed to create deployment notification:', notifError); // Don't fail the request
    }

    // Set audit resource info
    setAuditResource(req, deployment._id.toString(), instance_name);

    // Execute Terraform asynchronously with decrypted credentials
    const credentials = awsAccount.getDecryptedCredentials();
    executeTerraform('ec2', config, {
      accessKey: credentials.accessKeyId,
      secretKey: credentials.secretAccessKey,
      region: config.region
    }).then(async (result) => {
      deployment.status = result.success ? 'completed' : 'failed';
      deployment.terraformOutput = result.output;
      deployment.errorLog = result.error;
      deployment.workspaceId = result.workspaceId;
      deployment.updatedAt = new Date();
      await deployment.save();
      
      // Create notification for deployment result
      try {
        await Notification.createNotification({
          userId: req.user.userId,
          type: result.success ? 'deployment_success' : 'deployment_failed',
          title: result.success ? 'EC2 Deployment Successful' : 'EC2 Deployment Failed',
          message: result.success 
            ? `EC2 instance "${instance_name}" has been deployed successfully in ${config.region}`
            : `Failed to deploy EC2 instance "${instance_name}". ${result.error || 'Unknown error'}`,
          priority: result.success ? 'medium' : 'high',
          data: {
            deploymentId: deployment._id,
            resourceName: instance_name,
            resourceType: 'ec2'
          }
        });
        console.log('✅ Notification created for deployment result:', result.success ? 'success' : 'failed'); // Debug log
      } catch (notifError) {
        console.error('⚠️ Failed to create deployment result notification:', notifError); // Don't fail the request
      }
    });

    res.status(201).json({ deploymentId: deployment._id, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Deploy S3
router.post('/s3', 
  authMiddleware, 
  deployLimiter,
  validateS3Deployment,
  auditLogger('deployment_created', 's3'),
  async (req, res) => {
  try {
    const { bucketName, isPublic, versioning, encryption, awsAccountId } = req.body;

    if (!bucketName || !awsAccountId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const awsAccount = await AWSAccount.findOne({
      _id: awsAccountId,
      userId: req.user.userId
    });

    if (!awsAccount) {
      return res.status(404).json({ error: 'AWS account not found' });
    }

    const config = { bucketName, isPublic, versioning, encryption };

    const deployment = new Deployment({
      userId: req.user.userId,
      awsAccountId,
      resourceType: 's3',
      resourceName: bucketName,
      config,
      status: 'pending'
    });

    await deployment.save();

    // Create notification for deployment started
    try {
      await Notification.createNotification({
        userId: req.user.userId,
        type: 'deployment_started',
        title: 'S3 Deployment Started',
        message: `Starting deployment of S3 bucket "${bucketName}"`,
        priority: 'low',
        data: {
          deploymentId: deployment._id,
          resourceName: bucketName,
          resourceType: 's3'
        }
      });
      console.log('✅ Notification created for S3 deployment start');
    } catch (notifError) {
      console.error('⚠️ Failed to create S3 deployment notification:', notifError);
    }

    // Set audit resource info
    setAuditResource(req, deployment._id.toString(), bucketName);

    // Execute Terraform asynchronously with decrypted credentials
    const credentials = awsAccount.getDecryptedCredentials();
    executeTerraform('s3', config, {
      accessKey: credentials.accessKeyId,
      secretKey: credentials.secretAccessKey,
      region: awsAccount.region
    }).then(async (result) => {
      deployment.status = result.success ? 'completed' : 'failed';
      deployment.terraformOutput = result.output;
      deployment.errorLog = result.error;
      deployment.workspaceId = result.workspaceId;
      deployment.updatedAt = new Date();
      await deployment.save();
      
      // Create notification for deployment result
      try {
        await Notification.createNotification({
          userId: req.user.userId,
          type: result.success ? 'deployment_success' : 'deployment_failed',
          title: result.success ? 'S3 Deployment Successful' : 'S3 Deployment Failed',
          message: result.success 
            ? `S3 bucket "${bucketName}" has been deployed successfully`
            : `Failed to deploy S3 bucket "${bucketName}". ${result.error || 'Unknown error'}`,
          priority: result.success ? 'medium' : 'high',
          data: {
            deploymentId: deployment._id,
            resourceName: bucketName,
            resourceType: 's3'
          }
        });
        console.log('✅ Notification created for S3 deployment result:', result.success ? 'success' : 'failed');
      } catch (notifError) {
        console.error('⚠️ Failed to create S3 deployment result notification:', notifError);
      }
    });

    res.status(201).json({ deploymentId: deployment._id, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Deploy IAM
router.post('/iam', 
  authMiddleware, 
  deployLimiter,
  validateIAMDeployment,
  auditLogger('deployment_created', 'iam'),
  async (req, res) => {
  try {
    const { username, permissions, awsAccountId } = req.body;

    if (!username || !permissions || !awsAccountId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const awsAccount = await AWSAccount.findOne({
      _id: awsAccountId,
      userId: req.user.userId
    });

    if (!awsAccount) {
      return res.status(404).json({ error: 'AWS account not found' });
    }

    const config = { username, permissions };

    const deployment = new Deployment({
      userId: req.user.userId,
      awsAccountId,
      resourceType: 'iam',
      resourceName: username,
      config,
      status: 'pending'
    });

    await deployment.save();

    // Increment organization usage
    if (req.organization) {
      req.organization.incrementUsage('deployment');
      await req.organization.save();
    }

    // Set audit resource info
    setAuditResource(req, deployment._id.toString(), username);

    // Execute Terraform asynchronously with decrypted credentials
    const credentials = awsAccount.getDecryptedCredentials();
    executeTerraform('iam', config, {
      accessKey: credentials.accessKeyId,
      secretKey: credentials.secretAccessKey,
      region: awsAccount.region
    }).then(async (result) => {
      deployment.status = result.success ? 'completed' : 'failed';
      deployment.terraformOutput = result.output;
      deployment.errorLog = result.error;
      deployment.workspaceId = result.workspaceId;
      deployment.updatedAt = new Date();
      await deployment.save();
    });

    res.status(201).json({ deploymentId: deployment._id, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Deployment Status
router.get('/:id/status', 
  authMiddleware,
  validateMongoId('id'),
  async (req, res) => {
  try {
    const deployment = await Deployment.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    res.json({ deployment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get All Deployments
router.get('/list/all', authMiddleware, async (req, res) => {
  try {
    const deployments = await Deployment.find({ userId: req.user.userId })
      .sort({ createdAt: -1 });

    res.json({ deployments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Deployment (just record)
router.delete('/:id', 
  authMiddleware,
  validateMongoId('id'),
  auditLogger('deployment_deleted', 'deployment'),
  async (req, res) => {
  try {
    const deployment = await Deployment.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Destroy Deployment (destroy AWS resources)
router.post('/:id/destroy', 
  authMiddleware,
  validateMongoId('id'),
  auditLogger('deployment_destroyed', 'deployment'),
  async (req, res) => {
  try {
    const deployment = await Deployment.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    if (!deployment.workspaceId) {
      return res.status(400).json({ error: 'No workspace found for this deployment' });
    }

    // Update status to destroying
    deployment.status = 'destroying';
    await deployment.save();

    // Import destroyTerraform
    const { destroyTerraform } = await import('../utils/terraform.js');

    // Destroy resources asynchronously
    destroyTerraform(deployment.workspaceId).then(async (result) => {
      if (result.success) {
        deployment.status = 'destroyed';
        deployment.deletedBy = 'ui';
        deployment.deletedAt = new Date();
        deployment.terraformOutput = result.output;
        deployment.updatedAt = new Date();
        await deployment.save();
      } else {
        deployment.status = 'destroy_failed';
        deployment.errorLog = result.error;
        deployment.updatedAt = new Date();
        await deployment.save();
      }
    });

    res.json({ success: true, message: 'Destroy initiated', status: 'destroying' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
