import mongoose from 'mongoose';

const analyticsSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  metrics: {
    // Deployment metrics
    totalDeployments: { type: Number, default: 0 },
    successfulDeployments: { type: Number, default: 0 },
    failedDeployments: { type: Number, default: 0 },
    pendingDeployments: { type: Number, default: 0 },
    
    // Resource metrics
    ec2Instances: { type: Number, default: 0 },
    s3Buckets: { type: Number, default: 0 },
    iamUsers: { type: Number, default: 0 },
    
    // Usage metrics
    awsAccountsUsed: { type: Number, default: 0 },
    activeUsers: { type: Number, default: 0 },
    
    // Performance metrics
    avgDeploymentTime: { type: Number, default: 0 }, // in seconds
    totalDeploymentTime: { type: Number, default: 0 },
    
    // Cost metrics (estimated)
    estimatedCost: { type: Number, default: 0 }
  },
  
  // Hourly breakdown for detailed analytics
  hourlyData: [{
    hour: Number,
    deployments: Number,
    successes: Number,
    failures: Number
  }],
  
  // Resource type breakdown
  resourceBreakdown: {
    ec2: { type: Number, default: 0 },
    s3: { type: Number, default: 0 },
    iam: { type: Number, default: 0 },
    rds: { type: Number, default: 0 },
    lambda: { type: Number, default: 0 },
    other: { type: Number, default: 0 }
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
analyticsSchema.index({ organizationId: 1, date: -1 });
analyticsSchema.index({ date: -1 });

// Static method to aggregate daily analytics
analyticsSchema.statics.aggregateDailyMetrics = async function(organizationId, date) {
  const Deployment = mongoose.model('Deployment');
  const AWSAccount = mongoose.model('AWSAccount');
  const User = mongoose.model('User');
  
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  // Get deployment stats
  const deployments = await Deployment.find({
    organizationId,
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  });
  
  const metrics = {
    totalDeployments: deployments.length,
    successfulDeployments: deployments.filter(d => d.status === 'completed').length,
    failedDeployments: deployments.filter(d => d.status === 'failed').length,
    pendingDeployments: deployments.filter(d => d.status === 'pending').length,
    
    ec2Instances: deployments.filter(d => d.resourceType === 'ec2').length,
    s3Buckets: deployments.filter(d => d.resourceType === 's3').length,
    iamUsers: deployments.filter(d => d.resourceType === 'iam').length,
    
    awsAccountsUsed: await AWSAccount.countDocuments({ organizationId, isActive: true }),
    activeUsers: await User.countDocuments({ organizationId, isActive: true })
  };
  
  // Calculate average deployment time
  const completedDeployments = deployments.filter(d => d.status === 'completed' && d.updatedAt);
  if (completedDeployments.length > 0) {
    const totalTime = completedDeployments.reduce((sum, d) => {
      return sum + (new Date(d.updatedAt) - new Date(d.createdAt));
    }, 0);
    metrics.avgDeploymentTime = Math.round(totalTime / completedDeployments.length / 1000); // in seconds
    metrics.totalDeploymentTime = Math.round(totalTime / 1000);
  }
  
  // Resource breakdown
  const resourceBreakdown = {
    ec2: metrics.ec2Instances,
    s3: metrics.s3Buckets,
    iam: metrics.iamUsers,
    rds: 0,
    lambda: 0,
    other: 0
  };
  
  // Hourly breakdown
  const hourlyData = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourStart = new Date(startOfDay);
    hourStart.setHours(hour);
    const hourEnd = new Date(hourStart);
    hourEnd.setHours(hour + 1);
    
    const hourDeployments = deployments.filter(d => {
      const deployTime = new Date(d.createdAt);
      return deployTime >= hourStart && deployTime < hourEnd;
    });
    
    hourlyData.push({
      hour,
      deployments: hourDeployments.length,
      successes: hourDeployments.filter(d => d.status === 'completed').length,
      failures: hourDeployments.filter(d => d.status === 'failed').length
    });
  }
  
  return {
    organizationId,
    date: startOfDay,
    metrics,
    hourlyData,
    resourceBreakdown
  };
};

// Static method to get analytics for date range
analyticsSchema.statics.getAnalyticsRange = async function(organizationId, startDate, endDate) {
  return this.find({
    organizationId,
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: 1 });
};

// Static method to get latest analytics
analyticsSchema.statics.getLatestAnalytics = async function(organizationId, days = 30) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.getAnalyticsRange(organizationId, startDate, endDate);
};

const Analytics = mongoose.model('Analytics', analyticsSchema);

export default Analytics;
