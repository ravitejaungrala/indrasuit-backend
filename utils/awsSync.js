import AWS from 'aws-sdk';

// Check if S3 bucket exists
export const checkS3BucketExists = async (bucketName, credentials) => {
  try {
    const s3 = new AWS.S3({
      accessKeyId: credentials.accessKey,
      secretAccessKey: credentials.secretKey,
      region: credentials.region
    });

    await s3.headBucket({ Bucket: bucketName }).promise();
    return { exists: true, error: null };
  } catch (error) {
    if (error.code === 'NotFound' || error.code === 'NoSuchBucket') {
      return { exists: false, error: 'Bucket not found in AWS' };
    }
    return { exists: false, error: error.message };
  }
};

// Check if EC2 instance exists
export const checkEC2InstanceExists = async (instanceId, credentials) => {
  try {
    const ec2 = new AWS.EC2({
      accessKeyId: credentials.accessKey,
      secretAccessKey: credentials.secretKey,
      region: credentials.region
    });

    const result = await ec2.describeInstances({
      InstanceIds: [instanceId]
    }).promise();

    if (result.Reservations.length > 0 && result.Reservations[0].Instances.length > 0) {
      const instance = result.Reservations[0].Instances[0];
      const state = instance.State.Name;
      
      // Consider terminated instances as not existing
      if (state === 'terminated') {
        return { exists: false, error: 'Instance is terminated', state };
      }
      
      return { exists: true, error: null, state };
    }
    
    return { exists: false, error: 'Instance not found in AWS' };
  } catch (error) {
    if (error.code === 'InvalidInstanceID.NotFound') {
      return { exists: false, error: 'Instance not found in AWS' };
    }
    return { exists: false, error: error.message };
  }
};

// Check if IAM user exists
export const checkIAMUserExists = async (username, credentials) => {
  try {
    const iam = new AWS.IAM({
      accessKeyId: credentials.accessKey,
      secretAccessKey: credentials.secretKey,
      region: credentials.region
    });

    await iam.getUser({ UserName: username }).promise();
    return { exists: true, error: null };
  } catch (error) {
    if (error.code === 'NoSuchEntity') {
      return { exists: false, error: 'IAM user not found in AWS' };
    }
    return { exists: false, error: error.message };
  }
};

// Main sync function
export const syncDeploymentWithAWS = async (deployment, awsAccount) => {
  // Get decrypted credentials
  const decryptedCreds = awsAccount.getDecryptedCredentials();
  const credentials = {
    accessKey: decryptedCreds.accessKeyId,
    secretKey: decryptedCreds.secretAccessKey,
    region: awsAccount.region
  };

  let result = { exists: false, error: null };

  try {
    // Parse terraform output to get resource identifiers
    const outputs = deployment.terraformOutput ? JSON.parse(deployment.terraformOutput) : {};

    switch (deployment.resourceType) {
      case 's3':
        const bucketName = outputs.bucketName || deployment.config.bucketName;
        if (bucketName) {
          result = await checkS3BucketExists(bucketName, credentials);
        }
        break;

      case 'ec2':
        const instanceId = outputs.instanceId;
        if (instanceId) {
          result = await checkEC2InstanceExists(instanceId, credentials);
        }
        break;

      case 'iam':
        const username = outputs.username || deployment.config.username;
        if (username) {
          result = await checkIAMUserExists(username, credentials);
        }
        break;

      default:
        result = { exists: false, error: 'Unknown resource type' };
    }
  } catch (error) {
    result = { exists: false, error: error.message };
  }

  return result;
};
