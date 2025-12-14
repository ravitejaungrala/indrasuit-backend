import Organization from '../models/Organization.js';

/**
 * Tenant Isolation Middleware
 * Ensures users can only access data from their organization
 */
export const tenantIsolation = async (req, res, next) => {
  try {
    // Get organization ID from header or user's default
    const orgId = req.headers['x-organization-id'] || req.user?.organizationId;
    
    if (!orgId) {
      return res.status(400).json({ 
        error: 'Organization ID required',
        message: 'Please select an organization'
      });
    }
    
    // Verify user has access to this organization
    const organization = await Organization.findOne({
      _id: orgId,
      isActive: true,
      $or: [
        { ownerId: req.user.userId },
        { 'members.userId': req.user.userId }
      ]
    });
    
    if (!organization) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have access to this organization'
      });
    }
    
    // Check if subscription is active
    if (organization.subscription.status === 'suspended') {
      return res.status(403).json({
        error: 'Subscription suspended',
        message: 'Your organization subscription is suspended. Please contact support.'
      });
    }
    
    if (organization.subscription.status === 'cancelled') {
      return res.status(403).json({
        error: 'Subscription cancelled',
        message: 'Your organization subscription has been cancelled.'
      });
    }
    
    // Attach organization and user role to request
    req.organization = organization;
    req.userRole = organization.getMemberRole(req.user.userId);
    req.organizationId = organization._id;
    
    next();
  } catch (error) {
    console.error('Tenant isolation error:', error);
    res.status(500).json({ 
      error: 'Tenant isolation failed',
      message: error.message
    });
  }
};

/**
 * Check if user has required role
 */
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(403).json({ error: 'Role not determined' });
    }
    
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: `This action requires one of: ${allowedRoles.join(', ')}`
      });
    }
    
    next();
  };
};

/**
 * Check usage limits before action
 */
export const checkUsageLimit = (limitType) => {
  return (req, res, next) => {
    if (!req.organization) {
      return res.status(400).json({ error: 'Organization not loaded' });
    }
    
    const org = req.organization;
    
    switch (limitType) {
      case 'awsAccount':
        if (!org.canAddAWSAccount()) {
          return res.status(403).json({
            error: 'AWS account limit reached',
            message: `Your plan allows ${org.limits.maxAWSAccounts} AWS accounts. Upgrade to add more.`,
            limit: org.limits.maxAWSAccounts,
            current: org.usage.awsAccounts
          });
        }
        break;
        
      case 'deployment':
        if (!org.canDeploy()) {
          return res.status(403).json({
            error: 'Deployment limit reached',
            message: `Your plan allows ${org.limits.maxDeploymentsPerMonth} deployments per month. Upgrade for more.`,
            limit: org.limits.maxDeploymentsPerMonth,
            current: org.usage.deploymentsThisMonth
          });
        }
        break;
        
      case 'user':
        if (!org.canAddMember()) {
          return res.status(403).json({
            error: 'User limit reached',
            message: `Your plan allows ${org.limits.maxUsers} team members. Upgrade to add more.`,
            limit: org.limits.maxUsers,
            current: org.usage.users
          });
        }
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid limit type' });
    }
    
    next();
  };
};
