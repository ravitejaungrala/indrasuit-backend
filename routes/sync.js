import express from 'express';
import Deployment from '../models/Deployment.js';
import AWSAccount from '../models/AWSAccount.js';
import { syncDeploymentWithAWS } from '../utils/awsSync.js';
import { syncLimiter } from '../middleware/rateLimiter.js';
import { validateMongoId, validateSync } from '../middleware/validation.js';
import { auditLogger } from '../middleware/auditLogger.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Sync single deployment with AWS
router.post('/deployment/:id', 
  authMiddleware,
  syncLimiter,
  validateMongoId('id'),
  auditLogger('sync_initiated', 'deployment'),
  async (req, res) => {
  try {
    const deployment = await Deployment.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });
    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    // Only sync completed deployments
    if (deployment.status !== 'completed') {
      return res.json({ 
        message: 'Deployment not in completed state',
        status: deployment.status 
      });
    }

    const awsAccount = await AWSAccount.findById(deployment.awsAccountId);
    if (!awsAccount) {
      return res.status(404).json({ error: 'AWS account not found' });
    }

    const syncResult = await syncDeploymentWithAWS(deployment, awsAccount);

    // Update deployment based on sync result
    if (!syncResult.exists) {
      deployment.status = 'deleted_externally';
      deployment.deletedBy = 'aws_console';
      deployment.deletedAt = new Date();
      deployment.errorLog = syncResult.error || 'Resource not found in AWS';
    }

    deployment.lastSyncedAt = new Date();
    await deployment.save();

    res.json({
      deploymentId: deployment._id,
      resourceName: deployment.resourceName,
      existsInAWS: syncResult.exists,
      status: deployment.status,
      deletedBy: deployment.deletedBy,
      message: syncResult.exists ? 'Resource exists in AWS' : 'Resource deleted from AWS Console'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sync all deployments for a user
router.post('/all', 
  authMiddleware,
  syncLimiter,
  validateSync,
  auditLogger('sync_initiated', 'deployment'),
  async (req, res) => {
  try {
    const deployments = await Deployment.find({
      organizationId: req.user.organizationId,
      status: 'completed'
    });

    const results = [];

    for (const deployment of deployments) {
      try {
        const awsAccount = await AWSAccount.findById(deployment.awsAccountId);
        if (!awsAccount) continue;

        const syncResult = await syncDeploymentWithAWS(deployment, awsAccount);

        if (!syncResult.exists) {
          deployment.status = 'deleted_externally';
          deployment.deletedBy = 'aws_console';
          deployment.deletedAt = new Date();
          deployment.errorLog = syncResult.error || 'Resource not found in AWS';
        }

        deployment.lastSyncedAt = new Date();
        await deployment.save();

        results.push({
          deploymentId: deployment._id,
          resourceName: deployment.resourceName,
          resourceType: deployment.resourceType,
          existsInAWS: syncResult.exists,
          status: deployment.status,
          deletedBy: deployment.deletedBy
        });
      } catch (error) {
        console.error(`Error syncing deployment ${deployment._id}:`, error);
      }
    }

    const deletedCount = results.filter(r => !r.existsInAWS).length;

    res.json({
      totalChecked: results.length,
      deletedExternally: deletedCount,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auto-sync endpoint (can be called periodically)
router.get('/auto-sync/:userId', authMiddleware, async (req, res) => {
  try {
    const deployments = await Deployment.find({
      organizationId: req.user.organizationId,
      status: 'completed',
      $or: [
        { lastSyncedAt: null },
        { lastSyncedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } } // Not synced in last 5 minutes
      ]
    }).limit(10); // Sync max 10 at a time

    let syncedCount = 0;
    let deletedCount = 0;

    for (const deployment of deployments) {
      try {
        const awsAccount = await AWSAccount.findById(deployment.awsAccountId);
        if (!awsAccount) continue;

        const syncResult = await syncDeploymentWithAWS(deployment, awsAccount);

        if (!syncResult.exists) {
          deployment.status = 'deleted_externally';
          deployment.deletedBy = 'aws_console';
          deployment.deletedAt = new Date();
          deployment.errorLog = syncResult.error || 'Resource not found in AWS';
          deletedCount++;
        }

        deployment.lastSyncedAt = new Date();
        await deployment.save();
        syncedCount++;
      } catch (error) {
        console.error(`Error syncing deployment ${deployment._id}:`, error);
      }
    }

    res.json({
      synced: syncedCount,
      deletedExternally: deletedCount,
      message: `Synced ${syncedCount} deployments, found ${deletedCount} deleted externally`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
