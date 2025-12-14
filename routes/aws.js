import express from 'express';
import AWS from 'aws-sdk';
import { authMiddleware } from '../middleware/auth.js';
import AWSAccount from '../models/AWSAccount.js';
import Notification from '../models/Notification.js';
import { accountCreationLimiter } from '../middleware/rateLimiter.js';
import { validateAWSAccount, validateMongoId } from '../middleware/validation.js';
import { auditLogger, setAuditResource } from '../middleware/auditLogger.js';

const router = express.Router();

// Verify AWS Credentials and Save Account
router.post('/verify', 
  authMiddleware,
  accountCreationLimiter,
  validateAWSAccount,
  auditLogger('aws_account_added', 'aws_account'),
  async (req, res) => {
  try {
    const {
      organizationName,
      organizationId,
      accountName,
      accountId,
      accountType,
      accessKey,
      secretKey,
      region,
      description,
      tags,
      isPrimary
    } = req.body;

    // Validate required fields
    if (!organizationName || !accountName || !accessKey || !secretKey || !region) {
      return res.status(400).json({ error: 'Organization name, account name, credentials, and region are required' });
    }

    // Verify credentials with AWS STS
    const sts = new AWS.STS({
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      region,
    });

    let awsAccountId;
    try {
      const identity = await sts.getCallerIdentity().promise();
      awsAccountId = identity.Account;
    } catch (error) {
      return res.status(400).json({ error: 'Invalid AWS credentials. Please check your access key and secret key.' });
    }

    // If setting as primary, unset other primary accounts in the same organization
    if (isPrimary) {
      await AWSAccount.updateMany(
        { 
          userId: req.user.userId,
          organizationName: organizationName
        },
        { isPrimary: false }
      );
    }

    // Check if this is the first account for the organization
    const existingAccounts = await AWSAccount.find({
      userId: req.user.userId,
      organizationName: organizationName
    });

    const isFirstAccount = existingAccounts.length === 0;

    // Save to database
    const awsAccount = new AWSAccount({
      userId: req.user.userId,
      organizationName,
      organizationId: organizationId || undefined,
      accountName,
      accountId: accountId || awsAccountId,
      accountType: accountType || 'production',
      accessKey,
      secretKey,
      region,
      description: description || undefined,
      tags: tags || [],
      verified: true,
      isPrimary: isPrimary || isFirstAccount, // First account is automatically primary
      lastVerified: new Date()
    });

    await awsAccount.save();
    console.log('✅ AWS account saved:', { 
      accountId: awsAccount._id, 
      accountName, 
      userId: req.user.userId 
    }); // Debug log

    // Create notification for AWS account added
    try {
      await Notification.createNotification({
        userId: req.user.userId,
        type: 'system',
        title: 'AWS Account Added',
        message: `AWS account "${accountName}" (${awsAccountId}) has been successfully added and verified`,
        priority: 'medium',
        data: {
          accountId: awsAccount._id,
          accountName: accountName,
          region: region
        }
      });
      console.log('✅ Notification created for AWS account addition'); // Debug log
    } catch (notifError) {
      console.error('⚠️ Failed to create notification:', notifError); // Don't fail the request
    }

    // Set audit resource info
    setAuditResource(req, awsAccount._id.toString(), accountName);

    res.json({ 
      success: true, 
      accountId: awsAccount._id,
      awsAccountId: awsAccountId,
      message: 'AWS account verified and saved successfully'
    });
  } catch (error) {
    console.error('Error verifying AWS account:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get AWS Accounts
router.get('/accounts', authMiddleware, async (req, res) => {
  try {
    console.log('Fetching AWS accounts for userId:', req.user.userId); // Debug log
    
    const accounts = await AWSAccount.find({ 
      userId: req.user.userId,
      isActive: true
    })
      .select('-accessKey -secretKey')
      .sort({ organizationName: 1, isPrimary: -1, accountName: 1 });

    console.log(`Found ${accounts.length} AWS accounts`); // Debug log
    res.json({ accounts });
  } catch (error) {
    console.error('Error fetching AWS accounts:', error); // Debug log
    res.status(500).json({ error: error.message });
  }
});

// Get Single AWS Account
router.get('/accounts/:id', authMiddleware, async (req, res) => {
  try {
    const account = await AWSAccount.findOne({
      _id: req.params.id,
      userId: req.user.userId
    }).select('-accessKey -secretKey');

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ account });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update AWS Account
router.put('/accounts/:id', 
  authMiddleware,
  validateMongoId('id'),
  auditLogger('aws_account_updated', 'aws_account'),
  async (req, res) => {
  try {
    const {
      accountName,
      accountType,
      description,
      tags,
      region
    } = req.body;

    const account = await AWSAccount.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Update fields
    if (accountName) account.accountName = accountName;
    if (accountType) account.accountType = accountType;
    if (description !== undefined) account.description = description;
    if (tags) account.tags = tags;
    if (region) account.region = region;

    await account.save();

    res.json({ 
      success: true, 
      account: {
        ...account.toObject(),
        accessKey: undefined,
        secretKey: undefined
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set Primary Account
router.put('/accounts/:id/primary', authMiddleware, async (req, res) => {
  try {
    const account = await AWSAccount.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Unset other primary accounts in the same organization
    await AWSAccount.updateMany(
      { 
        userId: req.user.userId,
        organizationName: account.organizationName,
        _id: { $ne: account._id }
      },
      { isPrimary: false }
    );

    // Set this account as primary
    account.isPrimary = true;
    await account.save();

    res.json({ 
      success: true, 
      message: 'Primary account updated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete AWS Account
router.delete('/accounts/:id', 
  authMiddleware,
  validateMongoId('id'),
  auditLogger('aws_account_deleted', 'aws_account'),
  async (req, res) => {
  try {
    const account = await AWSAccount.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Soft delete by marking as inactive
    account.isActive = false;
    await account.save();

    // If this was the primary account, set another account as primary
    if (account.isPrimary) {
      const nextAccount = await AWSAccount.findOne({
        userId: req.user.userId,
        organizationName: account.organizationName,
        isActive: true,
        _id: { $ne: account._id }
      });

      if (nextAccount) {
        nextAccount.isPrimary = true;
        await nextAccount.save();
      }
    }

    res.json({ 
      success: true, 
      message: 'Account deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Organizations
router.get('/organizations', authMiddleware, async (req, res) => {
  try {
    const organizations = await AWSAccount.distinct('organizationName', {
      userId: req.user.userId,
      isActive: true
    });

    res.json({ organizations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Re-verify Account Credentials
router.post('/accounts/:id/verify', authMiddleware, async (req, res) => {
  try {
    const account = await AWSAccount.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Verify credentials with AWS STS
    const sts = new AWS.STS({
      accessKeyId: account.accessKey,
      secretAccessKey: account.secretKey,
      region: account.region,
    });

    try {
      await sts.getCallerIdentity().promise();
      account.verified = true;
      account.lastVerified = new Date();
      await account.save();

      res.json({ 
        success: true, 
        message: 'Account credentials verified successfully'
      });
    } catch (error) {
      account.verified = false;
      await account.save();
      return res.status(400).json({ error: 'Invalid AWS credentials' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
