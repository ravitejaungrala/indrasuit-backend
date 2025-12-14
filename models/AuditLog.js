import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  // User information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Optional for unauthenticated requests
    index: true
  },
  userEmail: {
    type: String,
    required: true
  },
  
  // Action details
  action: {
    type: String,
    required: true,
    enum: [
      // Authentication
      'signup','signup_verified', 'login', 'logout', 'login_failed', 'otp_requested', 'otp_verified','password_login', 'password_reset',
      // AWS Accounts
      'aws_account_added', 'aws_account_updated', 'aws_account_deleted', 'aws_account_verified',
      // Deployments
      'deployment_created', 'deployment_completed', 'deployment_failed', 
      'deployment_destroyed', 'deployment_destroy_failed', 'deployment_deleted',
      // Sync
      'sync_initiated', 'sync_completed', 'sync_failed',
      // Profile
      'profile_updated', 'profile_photo_updated',
      // Security
      'unauthorized_access', 'rate_limit_exceeded', 'validation_failed'
    ],
    index: true
  },
  
  // Resource details
  resourceType: {
    type: String,
    enum: ['user', 'aws_account', 'deployment', 'ec2', 's3', 'iam', 'sync', 'profile'],
    index: true
  },
  resourceId: {
    type: String,
    index: true
  },
  resourceName: {
    type: String
  },
  
  // Request details
  method: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  },
  endpoint: {
    type: String
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String
  },
  
  // Status
  status: {
    type: String,
    required: true,
    enum: ['success', 'failure', 'warning'],
    index: true
  },
  
  // Additional details
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  errorMessage: {
    type: String
  },
  
  // Metadata
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  duration: {
    type: Number // Request duration in milliseconds
  }
});

// Compound indexes for common queries
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ status: 1, timestamp: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });

// TTL index - automatically delete logs older than 90 days
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Static method to log an action
auditLogSchema.statics.logAction = async function(data) {
  try {
    const log = new this(data);
    await log.save();
    return log;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw error - audit logging should not break the application
  }
};

// Static method to get user activity
auditLogSchema.statics.getUserActivity = async function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('-__v');
};

// Static method to get failed login attempts
auditLogSchema.statics.getFailedLogins = async function(email, minutes = 15) {
  const since = new Date(Date.now() - minutes * 60 * 1000);
  return this.countDocuments({
    userEmail: email,
    action: 'login_failed',
    timestamp: { $gte: since }
  });
};

// Static method to detect suspicious activity
auditLogSchema.statics.detectSuspiciousActivity = async function(userId, hours = 1) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const failedActions = await this.countDocuments({
    userId,
    status: 'failure',
    timestamp: { $gte: since }
  });
  
  const rateLimitExceeded = await this.countDocuments({
    userId,
    action: 'rate_limit_exceeded',
    timestamp: { $gte: since }
  });
  
  return {
    failedActions,
    rateLimitExceeded,
    suspicious: failedActions > 10 || rateLimitExceeded > 5
  };
};

export default mongoose.model('AuditLog', auditLogSchema);
