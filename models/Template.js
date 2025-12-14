import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  resourceType: {
    type: String,
    required: true,
    enum: ['ec2', 's3', 'iam', 'rds', 'lambda', 'vpc', 'other'],
    index: true
  },
  config: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  isPublic: {
    type: Boolean,
    default: false,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  version: {
    type: Number,
    default: 1
  },
  usageCount: {
    type: Number,
    default: 0
  },
  lastUsedAt: {
    type: Date
  },
  category: {
    type: String,
    enum: ['compute', 'storage', 'database', 'networking', 'security', 'serverless', 'other'],
    default: 'other'
  }
}, {
  timestamps: true
});

// Compound indexes
templateSchema.index({ organizationId: 1, isActive: 1 });
templateSchema.index({ isPublic: 1, isActive: 1 });
templateSchema.index({ resourceType: 1, isActive: 1 });

// Instance method to increment usage
templateSchema.methods.incrementUsage = function() {
  this.usageCount++;
  this.lastUsedAt = new Date();
  return this.save();
};

// Static method to get popular templates
templateSchema.statics.getPopularTemplates = async function(organizationId, limit = 10) {
  return this.find({
    $or: [
      { organizationId, isActive: true },
      { isPublic: true, isActive: true }
    ]
  })
  .sort({ usageCount: -1 })
  .limit(limit);
};

// Static method to search templates
templateSchema.statics.searchTemplates = async function(organizationId, query) {
  const searchRegex = new RegExp(query, 'i');
  
  return this.find({
    $or: [
      { organizationId, isActive: true },
      { isPublic: true, isActive: true }
    ],
    $or: [
      { name: searchRegex },
      { description: searchRegex },
      { tags: searchRegex }
    ]
  });
};

const Template = mongoose.model('Template', templateSchema);

export default Template;
