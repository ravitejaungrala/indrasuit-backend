import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import AWSAccount from '../models/AWSAccount.js';
import AWS from 'aws-sdk';

const router = express.Router();

// Helper function to get AWS credentials (with decryption)
const getAWSCredentials = async (accountId, userId) => {
  const awsAccount = await AWSAccount.findOne({
    _id: accountId,
    userId: userId
  });

  if (!awsAccount) {
    throw new Error('AWS account not found');
  }

  // Use the decryption method from the model
  return awsAccount.getDecryptedCredentials();
};

// Get Key Pairs
router.get('/key-pairs', authMiddleware, async (req, res) => {
  try {
    const { accountId, region } = req.query;

    if (!accountId || !region) {
      return res.status(400).json({ error: 'Missing accountId or region' });
    }

    const credentials = await getAWSCredentials(accountId, req.user.userId);
    const ec2 = new AWS.EC2({ ...credentials, region });

    const data = await ec2.describeKeyPairs().promise();
    const keyPairs = data.KeyPairs.map(kp => ({
      name: kp.KeyName,
      fingerprint: kp.KeyFingerprint,
      type: kp.KeyType
    }));

    res.json({ keyPairs });
  } catch (error) {
    console.error('Error fetching key pairs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create Key Pair
router.post('/create-key-pair', authMiddleware, async (req, res) => {
  try {
    const { awsAccountId, region, keyPairName, keyPairType } = req.body;

    if (!awsAccountId || !region || !keyPairName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const credentials = await getAWSCredentials(awsAccountId, req.user.userId);
    const ec2 = new AWS.EC2({ ...credentials, region });

    const params = {
      KeyName: keyPairName,
      KeyType: keyPairType || 'rsa'
    };

    const data = await ec2.createKeyPair(params).promise();

    res.json({
      keyName: data.KeyName,
      keyFingerprint: data.KeyFingerprint,
      privateKey: data.KeyMaterial
    });
  } catch (error) {
    console.error('Error creating key pair:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get VPCs
router.get('/vpcs', authMiddleware, async (req, res) => {
  try {
    const { accountId, region } = req.query;

    if (!accountId || !region) {
      return res.status(400).json({ error: 'Missing accountId or region' });
    }

    const credentials = await getAWSCredentials(accountId, req.user.userId);
    const ec2 = new AWS.EC2({ ...credentials, region });

    const data = await ec2.describeVpcs().promise();
    const vpcs = data.Vpcs.map(vpc => ({
      id: vpc.VpcId,
      name: vpc.Tags?.find(t => t.Key === 'Name')?.Value || '',
      cidr: vpc.CidrBlock,
      isDefault: vpc.IsDefault
    }));

    res.json({ vpcs });
  } catch (error) {
    console.error('Error fetching VPCs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Subnets
router.get('/subnets', authMiddleware, async (req, res) => {
  try {
    const { accountId, region, vpcId } = req.query;

    if (!accountId || !region) {
      return res.status(400).json({ error: 'Missing accountId or region' });
    }

    const credentials = await getAWSCredentials(accountId, req.user.userId);
    const ec2 = new AWS.EC2({ ...credentials, region });

    const params = vpcId ? { Filters: [{ Name: 'vpc-id', Values: [vpcId] }] } : {};
    const data = await ec2.describeSubnets(params).promise();
    
    const subnets = data.Subnets.map(subnet => ({
      id: subnet.SubnetId,
      name: subnet.Tags?.find(t => t.Key === 'Name')?.Value || '',
      vpcId: subnet.VpcId,
      cidr: subnet.CidrBlock,
      availabilityZone: subnet.AvailabilityZone,
      availableIps: subnet.AvailableIpAddressCount
    }));

    res.json({ subnets });
  } catch (error) {
    console.error('Error fetching subnets:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Security Groups
router.get('/security-groups', authMiddleware, async (req, res) => {
  try {
    const { accountId, region, vpcId } = req.query;

    if (!accountId || !region) {
      return res.status(400).json({ error: 'Missing accountId or region' });
    }

    const credentials = await getAWSCredentials(accountId, req.user.userId);
    const ec2 = new AWS.EC2({ ...credentials, region });

    const params = vpcId ? { Filters: [{ Name: 'vpc-id', Values: [vpcId] }] } : {};
    const data = await ec2.describeSecurityGroups(params).promise();
    
    const securityGroups = data.SecurityGroups.map(sg => ({
      id: sg.GroupId,
      name: sg.GroupName,
      description: sg.Description,
      vpcId: sg.VpcId
    }));

    res.json({ securityGroups });
  } catch (error) {
    console.error('Error fetching security groups:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get IAM Roles
router.get('/iam-roles', authMiddleware, async (req, res) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: 'Missing accountId' });
    }

    const credentials = await getAWSCredentials(accountId, req.user.userId);
    const iam = new AWS.IAM(credentials);

    const data = await iam.listRoles().promise();
    
    // Filter roles that can be assumed by EC2
    const ec2Roles = data.Roles.filter(role => {
      try {
        const policy = JSON.parse(decodeURIComponent(role.AssumeRolePolicyDocument));
        return policy.Statement?.some(stmt => 
          stmt.Principal?.Service?.includes('ec2.amazonaws.com')
        );
      } catch {
        return false;
      }
    });

    const roles = ec2Roles.map(role => ({
      name: role.RoleName,
      arn: role.Arn,
      description: role.Description || ''
    }));

    res.json({ roles });
  } catch (error) {
    console.error('Error fetching IAM roles:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get EC2 Instances for an AWS Account
router.get('/instances/:accountId', authMiddleware, async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user.userId;

    // Get AWS credentials
    const credentials = await getAWSCredentials(accountId, userId);
    
    // Get account details for region
    const awsAccount = await AWSAccount.findOne({
      _id: accountId,
      userId: userId
    });

    if (!awsAccount) {
      return res.status(404).json({ error: 'AWS account not found' });
    }

    // Configure AWS SDK
    AWS.config.update({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      region: awsAccount.region
    });

    const ec2 = new AWS.EC2();

    // Describe all EC2 instances
    const data = await ec2.describeInstances().promise();
    
    // Flatten the instances from all reservations
    const instances = [];
    data.Reservations.forEach(reservation => {
      reservation.Instances.forEach(instance => {
        instances.push({
          InstanceId: instance.InstanceId,
          InstanceType: instance.InstanceType,
          State: instance.State,
          PublicIpAddress: instance.PublicIpAddress,
          PrivateIpAddress: instance.PrivateIpAddress,
          LaunchTime: instance.LaunchTime,
          Tags: instance.Tags || [],
          VpcId: instance.VpcId,
          SubnetId: instance.SubnetId,
          SecurityGroups: instance.SecurityGroups
        });
      });
    });

    res.json({ 
      success: true, 
      instances,
      count: instances.length
    });

  } catch (error) {
    console.error('Error fetching EC2 instances:', error);
    res.status(500).json({ 
      error: 'Failed to fetch EC2 instances',
      message: error.message 
    });
  }
});

export default router;
