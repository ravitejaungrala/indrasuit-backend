import mongoose from 'mongoose';

const deploymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Multi-Tenancy (optional for backward compatibility)
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },
  awsAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AWSAccount',
    required: true
  },
  resourceType: {
    type: String,
    enum: ['ec2', 's3', 'iam'],
    required: true
  },
  resourceName: {
    type: String
  },
  config: {
    type: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'destroying', 'destroyed', 'destroy_failed', 'deleted_externally'],
    default: 'pending'
  },
  terraformOutput: {
    type: String
  },
  errorLog: {
    type: String
  },
  workspaceId: {
    type: String
  },
  deletedBy: {
    type: String,
    enum: ['ui', 'aws_console', 'unknown'],
    default: null
  },
  deletedAt: {
    type: Date,
    default: null
  },
  lastSyncedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Deployment', deploymentSchema);
