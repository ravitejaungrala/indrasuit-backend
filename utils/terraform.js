import { exec, spawn, execSync } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, copyFile } from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

// Cross-platform execution function
const execTerraformCommand = (args, options) => {
  return new Promise((resolve, reject) => {
    // Use terraform from specific Program Files path
    const terraformExecutable = 'C:\\Program Files\\Terraform\\terraform.exe';
    
    const child = spawn(terraformExecutable, args, {
      ...options,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(`Command failed with exit code ${code}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
};
const WORKSPACE_DIR = process.env.TERRAFORM_WORKSPACE_DIR || './terraform/workspaces';
const TEMPLATE_DIR = path.join(__dirname, '../terraform/templates');

const generateEC2TfVars = (config, awsCreds, userId) => {
  const tfvars = {
    // AWS Credentials
    aws_region: config.region || awsCreds.region,
    aws_access_key: awsCreds.accessKey,
    aws_secret_key: awsCreds.secretKey,
    
    // Deployment Metadata
    deployment_id: uuidv4(),
    created_by: userId || 'system',
    environment: 'production',
    
    // Instance Configuration
    instance_name: config.instance_name,
    instance_type: config.instance_type,
    ami_id: config.ami_id,
    key_name: config.key_name,
    
    // Network Configuration
    vpc_id: config.vpc_id || '',
    subnet_id: config.subnet_id || '',
    associate_public_ip: config.assign_public_ip !== false,
    
    // Security Group
    create_security_group: config.security_group_ids && config.security_group_ids.length > 0 ? false : true,
    security_group_name: `${config.instance_name}-sg`,
    allowed_ssh_cidrs: ['0.0.0.0/0'], // Default - should be restricted in production
    
    // Storage Configuration
    root_volume_size: config.root_volume_size || 20,
    root_volume_type: config.root_volume_type || 'gp3',
    enable_ebs_encryption: config.enable_ebs_encryption !== false,
    delete_on_termination: true,
    
    // IAM Configuration
    create_iam_instance_profile: config.iam_role ? true : false,
    iam_role_policies: config.iam_role ? [`arn:aws:iam::aws:policy/${config.iam_role}`] : [],
    
    // User Data
    user_data: config.user_data || '',
    
    // Monitoring
    enable_detailed_monitoring: config.enable_monitoring || false,
    
    // Additional Tags
    additional_tags: {
      ShutdownBehavior: config.shutdown_behavior || 'stop',
      AvailabilityZone: config.availability_zone || 'auto'
    }
  };

  // Convert to Terraform variable format
  let tfvarsContent = '';
  for (const [key, value] of Object.entries(tfvars)) {
    if (typeof value === 'string') {
      tfvarsContent += `${key} = "${value}"\n`;
    } else if (typeof value === 'boolean') {
      tfvarsContent += `${key} = ${value}\n`;
    } else if (typeof value === 'number') {
      tfvarsContent += `${key} = ${value}\n`;
    } else if (Array.isArray(value)) {
      tfvarsContent += `${key} = ${JSON.stringify(value)}\n`;
    } else if (typeof value === 'object') {
      tfvarsContent += `${key} = ${JSON.stringify(value)}\n`;
    }
  }

  return tfvarsContent;
};

const generateS3TfVars = (config, awsCreds, userId) => {
  const uniqueBucketName = config.bucketName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  
  // Convert tags array to object
  const tagsObject = {};
  if (config.tags && Array.isArray(config.tags)) {
    config.tags.forEach(tag => {
      if (tag.key && tag.value) {
        tagsObject[tag.key] = tag.value;
      }
    });
  }
  
  const tfvars = {
    // AWS Credentials
    aws_region: config.region || awsCreds.region,
    aws_access_key: awsCreds.accessKey,
    aws_secret_key: awsCreds.secretKey,
    
    // Basic Configuration
    bucket_name: uniqueBucketName,
    bucket_type: config.bucketType || 'general-purpose',
    
    // Versioning
    versioning_enabled: config.versioning || false,
    mfa_delete: config.mfaDelete || false,
    
    // Encryption
    encryption_enabled: config.encryption !== false,
    encryption_type: config.encryptionType || 'SSE-S3',
    kms_key_id: config.kmsKeyId || '',
    bucket_key_enabled: config.bucketKeyEnabled !== false,
    
    // Access Management
    is_public: config.isPublic || false,
    block_public_acls: config.blockPublicAcls !== false,
    block_public_policy: config.blockPublicPolicy !== false,
    ignore_public_acls: config.ignorePublicAcls !== false,
    restrict_public_buckets: config.restrictPublicBuckets !== false,
    
    // Advanced Features
    transfer_acceleration: config.transferAcceleration || false,
    requester_pays: config.requesterPays || false,
    intelligent_tiering: config.intelligentTiering || false,
    
    // Static Website Hosting
    static_website_hosting: config.staticWebsiteHosting || false,
    index_document: config.indexDocument || 'index.html',
    error_document: config.errorDocument || 'error.html',
    
    // Tags
    tags: tagsObject,
    
    // Table Bucket Configuration
    table_format: config.tableFormat || 'iceberg',
    enable_table_metadata: config.enableTableMetadata !== false,
    enable_schema_evolution: config.enableSchemaEvolution || false,
    
    // Vector Bucket Configuration
    vector_dimension: config.vectorDimension || '768',
    custom_vector_dimension: config.customVectorDimension || '',
    distance_metric: config.distanceMetric || 'cosine',
    enable_vector_index: config.enableVectorIndex !== false,
    enable_similarity_search: config.enableSimilaritySearch !== false
  };

  let tfvarsContent = '';
  for (const [key, value] of Object.entries(tfvars)) {
    if (typeof value === 'string') {
      tfvarsContent += `${key} = "${value}"\n`;
    } else if (typeof value === 'boolean') {
      tfvarsContent += `${key} = ${value}\n`;
    } else if (typeof value === 'object' && value !== null) {
      tfvarsContent += `${key} = ${JSON.stringify(value)}\n`;
    }
  }

  return tfvarsContent;
};

const generateIAMTfVars = (config, awsCreds, userId) => {
  const tfvars = {
    aws_region: awsCreds.region,
    aws_access_key: awsCreds.accessKey,
    aws_secret_key: awsCreds.secretKey,
    deployment_id: uuidv4(),
    created_by: userId || 'system',
    environment: 'production',
    username: config.username,
    policy_arn: `arn:aws:iam::aws:policy/${config.permissions}`,
    additional_tags: {}
  };

  let tfvarsContent = '';
  for (const [key, value] of Object.entries(tfvars)) {
    if (typeof value === 'string') {
      tfvarsContent += `${key} = "${value}"\n`;
    } else if (typeof value === 'object') {
      tfvarsContent += `${key} = ${JSON.stringify(value)}\n`;
    }
  }

  return tfvarsContent;
};

export const executeTerraform = async (resourceType, config, awsCredentials, userId = 'system') => {
  const workspaceId = uuidv4();
  const workspacePath = path.join(WORKSPACE_DIR, workspaceId);

  console.log('🚀 Starting Terraform execution:', {
    resourceType,
    workspaceId,
    workspacePath,
    config: JSON.stringify(config, null, 2)
  });

  try {
    await mkdir(workspacePath, { recursive: true });

    let tfvarsContent = '';
    let templateFile = '';

    switch (resourceType) {
      case 'ec2':
        tfvarsContent = generateEC2TfVars(config, awsCredentials, userId);
        templateFile = 'ec2.tf';
        break;
      case 's3':
        tfvarsContent = generateS3TfVars(config, awsCredentials, userId);
        templateFile = 's3.tf';
        break;
      case 'iam':
        tfvarsContent = generateIAMTfVars(config, awsCredentials, userId);
        templateFile = 'iam.tf';
        break;
      default:
        throw new Error(`Unknown resource type: ${resourceType}`);
    }

    // Copy template file to workspace
    const templatePath = path.join(TEMPLATE_DIR, templateFile);
    await copyFile(templatePath, path.join(workspacePath, 'main.tf'));

    // Write tfvars file
    await writeFile(path.join(workspacePath, 'terraform.tfvars'), tfvarsContent);

    // Initialize Terraform
    await execTerraformCommand(['init'], { 
      cwd: workspacePath,
      env: { ...process.env }
    });

    // Apply Terraform
    const { stdout, stderr } = await execTerraformCommand(['apply', '-auto-approve'], {
      cwd: workspacePath,
      env: { ...process.env }
    });

    return { success: true, output: stdout + stderr, workspaceId };
  } catch (error) {
    console.error('🔥 Terraform execution failed:', error);
    console.error('🔍 Error details:', {
      message: error.message,
      code: error.code,
      stderr: error.stderr,
      stdout: error.stdout,
      workspaceId: workspaceId
    });
    console.error('📁 Workspace path:', workspacePath);
    console.error('🛠️ Terraform path:', 'C:\\Program Files\\Terraform\\terraform.exe');
    return { success: false, error: error.message, workspaceId };
  }
};

export const destroyTerraform = async (workspaceId) => {
  const workspacePath = path.join(WORKSPACE_DIR, workspaceId);

  try {
    // Destroy Terraform resources
    const { stdout, stderr } = await execTerraformCommand(['destroy', '-auto-approve'], {
      cwd: workspacePath,
      env: { ...process.env }
    });

    return { success: true, output: stdout + stderr };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const openSecurityGroupPort = async (securityGroupId, port, awsCredentials, description = 'Auto-opened by RaDynamics') => {
  const workspaceId = uuidv4();
  const workspacePath = path.join(WORKSPACE_DIR, workspaceId);

  console.log('🔓 Opening security group port via Terraform:', {
    securityGroupId,
    port,
    workspaceId
  });

  try {
    await mkdir(workspacePath, { recursive: true });

    // Generate tfvars for security group rule
    const tfvars = {
      aws_region: awsCredentials.region || 'us-east-1',
      aws_access_key: awsCredentials.accessKey,
      aws_secret_key: awsCredentials.secretKey,
      security_group_id: securityGroupId,
      port: parseInt(port),
      description: description
    };

    let tfvarsContent = '';
    for (const [key, value] of Object.entries(tfvars)) {
      if (typeof value === 'string') {
        tfvarsContent += `${key} = "${value}"\n`;
      } else if (typeof value === 'number') {
        tfvarsContent += `${key} = ${value}\n`;
      }
    }

    // Copy security group rule template to workspace
    const templatePath = path.join(TEMPLATE_DIR, 'security-group-rule.tf');
    await copyFile(templatePath, path.join(workspacePath, 'main.tf'));

    // Write tfvars file
    await writeFile(path.join(workspacePath, 'terraform.tfvars'), tfvarsContent);

    // Initialize Terraform
    await execTerraformCommand(['init'], { 
      cwd: workspacePath,
      env: { ...process.env }
    });

    // Apply Terraform
    const { stdout, stderr } = await execTerraformCommand(['apply', '-auto-approve'], {
      cwd: workspacePath,
      env: { ...process.env }
    });

    console.log('✅ Security group port opened successfully');
    return { 
      success: true, 
      output: stdout + stderr, 
      workspaceId,
      port: port,
      securityGroupId: securityGroupId
    };

  } catch (error) {
    console.error('❌ Failed to open security group port:', error);
    
    // Check if it's a duplicate rule error (already exists)
    if (error.stderr && error.stderr.includes('already exists')) {
      console.log('ℹ️ Port already open in security group');
      return { 
        success: true, 
        output: `Port ${port} already open in security group ${securityGroupId}`, 
        workspaceId,
        port: port,
        securityGroupId: securityGroupId,
        alreadyExists: true
      };
    }

    return { 
      success: false, 
      error: error.message, 
      workspaceId,
      stderr: error.stderr,
      stdout: error.stdout
    };
  }
};
