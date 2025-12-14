import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[a-z0-9-]+$/
  },
  
  // Owner
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Members
  members: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'read_only'],
      default: 'member'
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Billing Information
  billing: {
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    paymentMethodId: String,
    lastPaymentDate: Date,
    nextPaymentDate: Date
  },
  
  // Subscription & Limits
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'cancelled', 'trial'],
      default: 'trial'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date
    },
    trialEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days trial
    }
  },
  
  // Usage Limits
  limits: {
    maxAWSAccounts: {
      type: Number,
      default: 3
    },
    maxDeployments: {
      type: Number,
      default: 50
    },
    maxUsers: {
      type: Number,
      default: 5
    },
    maxDeploymentsPerMonth: {
      type: Number,
      default: 100
    }
  },
  
  // Current Usage
  usage: {
    awsAccounts: {
      type: Number,
      default: 0
    },
    deployments: {
      type: Number,
      default: 0
    },
    users: {
      type: Number,
      default: 1
    },
    deploymentsThisMonth: {
      type: Number,
      default: 0
    },
    lastResetDate: {
      type: Date,
      default: Date.now
    }
  },
  
  // Settings
  settings: {
    allowMemberInvites: {
      type: Boolean,
      default: false
    },
    requireMFA: {
      type: Boolean,
      default: false
    },
    allowedDomains: [{
      type: String
    }],
    ipWhitelist: [{
      type: String
    }]
  },
  
  // Metadata
  isActive: {
    type: Boolean,
    default: true
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

// Indexes
organizationSchema.index({ slug: 1 });
organizationSchema.index({ ownerId: 1 });
organizationSchema.index({ 'members.userId': 1 });
organizationSchema.index({ 'subscription.status': 1 });

// Update timestamp on save
organizationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Methods
organizationSchema.methods.isMember = function(userId) {
  return this.members.some(m => m.userId.toString() === userId.toString()) || 
         this.ownerId.toString() === userId.toString();
};

organizationSchema.methods.getMemberRole = function(userId) {
  if (this.ownerId.toString() === userId.toString()) {
    return 'owner';
  }
  const member = this.members.find(m => m.userId.toString() === userId.toString());
  return member ? member.role : null;
};

organizationSchema.methods.canAddMember = function() {
  return this.usage.users < this.limits.maxUsers;
};

organizationSchema.methods.canAddAWSAccount = function() {
  return this.usage.awsAccounts < this.limits.maxAWSAccounts;
};

organizationSchema.methods.canDeploy = function() {
  return this.usage.deploymentsThisMonth < this.limits.maxDeploymentsPerMonth;
};

organizationSchema.methods.incrementUsage = function(type) {
  if (type === 'deployment') {
    this.usage.deployments += 1;
    this.usage.deploymentsThisMonth += 1;
  } else if (type === 'awsAccount') {
    this.usage.awsAccounts += 1;
  } else if (type === 'user') {
    this.usage.users += 1;
  }
};

organizationSchema.methods.decrementUsage = function(type) {
  if (type === 'awsAccount' && this.usage.awsAccounts > 0) {
    this.usage.awsAccounts -= 1;
  } else if (type === 'user' && this.usage.users > 0) {
    this.usage.users -= 1;
  }
};

// Static methods
organizationSchema.statics.createDefaultOrganization = async function(userId, userName, userEmail) {
  const slug = userEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  const organization = new this({
    name: `${userName || userEmail.split('@')[0]}'s Organization`,
    slug: `${slug}-${Date.now()}`,
    ownerId: userId,
    members: [],
    usage: {
      users: 1,
      awsAccounts: 0,
      deployments: 0,
      deploymentsThisMonth: 0,
      lastResetDate: new Date()
    }
  });
  
  return await organization.save();
};

organizationSchema.statics.resetMonthlyUsage = async function() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  
  await this.updateMany(
    { 'usage.lastResetDate': { $lt: lastMonth } },
    { 
      $set: { 
        'usage.deploymentsThisMonth': 0,
        'usage.lastResetDate': now
      }
    }
  );
};

// Update limits based on subscription plan
organizationSchema.methods.updateLimitsForPlan = function(plan) {
  const planLimits = {
    free: {
      maxAWSAccounts: 3,
      maxDeployments: 50,
      maxDeploymentsPerMonth: 100,
      maxUsers: 5
    },
    starter: {
      maxAWSAccounts: 5,
      maxDeployments: 200,
      maxDeploymentsPerMonth: 500,
      maxUsers: 10
    },
    professional: {
      maxAWSAccounts: 15,
      maxDeployments: 1000,
      maxDeploymentsPerMonth: 2000,
      maxUsers: 50
    },
    enterprise: {
      maxAWSAccounts: -1, // Unlimited
      maxDeployments: -1,
      maxDeploymentsPerMonth: -1,
      maxUsers: -1
    }
  };
  
  if (planLimits[plan]) {
    this.limits = planLimits[plan];
  }
};

export default mongoose.model('Organization', organizationSchema);
