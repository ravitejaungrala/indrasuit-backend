import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  // Deployment Method
  deploymentMethod: {
    type: String,
    enum: ['github', 'docker'],
    required: true
  },
  
  // GitHub Configuration
  github: {
    repoUrl: String,
    branch: { type: String, default: 'main' },
    buildCommand: String,
    startCommand: String,
    appType: {
      type: String,
      enum: ['nodejs', 'react', 'nextjs', 'python', 'static', 'auto']
    },
    token: String, // GitHub Personal Access Token for private repos
    isPrivate: { type: Boolean, default: false }
  },
  
  // Docker Configuration
  docker: {
    image: String,
    registry: { type: String, default: 'dockerhub' },
    tag: { type: String, default: 'latest' }
  },
  
  // Runtime Configuration
  runtime: {
    port: { type: Number, default: 3000 },
    cpu: { type: String, default: '512' },
    memory: { type: String, default: '1024' },
    environmentVariables: {
      type: Map,
      of: String,
      default: {}
    }
  },
  
  // Deployment Target
  deploymentTarget: {
    type: String,
    enum: ['ecs', 'ec2'],
    default: 'ecs'
  },
  
  // EC2 Deployment (if deploymentTarget is 'ec2')
  ec2: {
    instanceId: String,
    publicIp: String,
    privateIp: String
  },
  
  // AWS Resources
  aws: {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AWSAccount',
      required: true
    },
    region: { type: String, default: 'us-east-1' },
    ecrRepository: String,
    ecrImageUri: String,
    ecsCluster: String,
    ecsService: String,
    taskDefinition: String,
    taskDefinitionArn: String,
    loadBalancerArn: String,
    loadBalancerDns: String,
    targetGroupArn: String,
    securityGroupId: String
  },
  
  // Status & Monitoring
  status: {
    type: String,
    enum: ['pending', 'cloning', 'building', 'pushing', 'deploying', 'running', 'stopped', 'failed', 'error'],
    default: 'pending'
  },
  url: String,
  
  // Logs & History
  buildLogs: [String],
  deploymentLogs: [String],
  errorMessage: String,
  lastDeployedAt: Date,
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update timestamp on save
applicationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Application = mongoose.model('Application', applicationSchema);
export default Application;
