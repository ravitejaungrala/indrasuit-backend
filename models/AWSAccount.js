import mongoose from 'mongoose';
import { encrypt, decrypt, isEncrypted } from '../utils/encryption.js';

const awsAccountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Multi-Tenancy
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  // Organization Information
  organizationName: {
    type: String,
    required: true,
    trim: true
  },
  organizationId: {
    type: String,
    trim: true
  },
  // Account Information
  accountName: {
    type: String,
    required: true,
    trim: true
  },
  accountId: {
    type: String,
    trim: true
  },
  accountType: {
    type: String,
    enum: ['production', 'staging', 'development', 'testing', 'sandbox'],
    default: 'production'
  },
  // AWS Credentials
  accessKey: {
    type: String,
    required: true
  },
  secretKey: {
    type: String,
    required: true
  },
  region: {
    type: String,
    required: true,
    default: 'us-east-1'
  },
  // Account Details
  description: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  // Status
  verified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPrimary: {
    type: Boolean,
    default: false
  },
  // Metadata
  lastVerified: {
    type: Date
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

// Index for faster queries
awsAccountSchema.index({ organizationId: 1, accountName: 1 });
awsAccountSchema.index({ userId: 1, organizationName: 1 });
awsAccountSchema.index({ userId: 1, accountName: 1 });
awsAccountSchema.index({ userId: 1, isPrimary: 1 });

// Encrypt credentials before saving
awsAccountSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  try {
    // Encrypt accessKey if not already encrypted
    if (this.accessKey && !isEncrypted(this.accessKey)) {
      this.accessKey = encrypt(this.accessKey);
    }
    
    // Encrypt secretKey if not already encrypted
    if (this.secretKey && !isEncrypted(this.secretKey)) {
      this.secretKey = encrypt(this.secretKey);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Method to get decrypted credentials
awsAccountSchema.methods.getDecryptedCredentials = function() {
  try {
    return {
      accessKeyId: decrypt(this.accessKey),
      secretAccessKey: decrypt(this.secretKey),
      region: this.region
    };
  } catch (error) {
    console.error('Failed to decrypt credentials:', error.message);
    throw new Error('Failed to retrieve AWS credentials');
  }
};

// Method to verify credentials are valid
awsAccountSchema.methods.hasValidCredentials = function() {
  return !!(this.accessKey && this.secretKey && this.region);
};

// Virtual field to check if credentials are encrypted
awsAccountSchema.virtual('isEncrypted').get(function() {
  return isEncrypted(this.accessKey) && isEncrypted(this.secretKey);
});

export default mongoose.model('AWSAccount', awsAccountSchema);
