import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { tenantIsolation, requireRole } from '../middleware/tenantIsolation.js';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import { auditLogger } from '../middleware/auditLogger.js';

const router = express.Router();

// Get current organization
router.get('/current', authMiddleware, async (req, res) => {
  try {
    const org = await Organization.findById(req.user.organizationId);
    
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    const userRole = org.getMemberRole(req.user.userId);
    
    res.json({ 
      organization: {
        id: org._id,
        name: org.name,
        slug: org.slug,
        subscription: org.subscription,
        limits: org.limits,
        usage: org.usage,
        settings: org.settings,
        role: userRole,
        isOwner: org.ownerId.toString() === req.user.userId.toString()
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get organization usage and limits
router.get('/usage', authMiddleware, tenantIsolation, async (req, res) => {
  try {
    const org = req.organization;
    
    res.json({ 
      usage: org.usage,
      limits: org.limits,
      subscription: org.subscription,
      percentages: {
        awsAccounts: Math.round((org.usage.awsAccounts / org.limits.maxAWSAccounts) * 100),
        users: Math.round((org.usage.users / org.limits.maxUsers) * 100),
        deploymentsThisMonth: Math.round((org.usage.deploymentsThisMonth / org.limits.maxDeploymentsPerMonth) * 100)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update organization settings (owner only)
router.put('/settings', 
  authMiddleware, 
  tenantIsolation,
  requireRole(['owner']),
  auditLogger('organization_settings_updated', 'organization'),
  async (req, res) => {
  try {
    const org = req.organization;
    const { name, allowMemberInvites, requireMFA, allowedDomains, ipWhitelist } = req.body;
    
    if (name) {
      org.name = name;
    }
    
    if (allowMemberInvites !== undefined) {
      org.settings.allowMemberInvites = allowMemberInvites;
    }
    
    if (requireMFA !== undefined) {
      org.settings.requireMFA = requireMFA;
    }
    
    if (allowedDomains) {
      org.settings.allowedDomains = allowedDomains;
    }
    
    if (ipWhitelist) {
      org.settings.ipWhitelist = ipWhitelist;
    }
    
    await org.save();
    
    res.json({ 
      success: true,
      organization: org
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get organization members
router.get('/members', 
  authMiddleware, 
  tenantIsolation,
  async (req, res) => {
  try {
    const org = req.organization;
    
    // Get owner info
    const owner = await User.findById(org.ownerId).select('name email profilePhoto');
    
    // Get members info
    const memberIds = org.members.map(m => m.userId);
    const members = await User.find({ _id: { $in: memberIds } }).select('name email profilePhoto');
    
    const membersWithRoles = org.members.map(member => {
      const user = members.find(u => u._id.toString() === member.userId.toString());
      return {
        id: member.userId,
        name: user?.name || 'Unknown',
        email: user?.email || 'Unknown',
        profilePhoto: user?.profilePhoto,
        role: member.role,
        addedAt: member.addedAt
      };
    });
    
    res.json({
      owner: {
        id: owner._id,
        name: owner.name,
        email: owner.email,
        profilePhoto: owner.profilePhoto,
        role: 'owner'
      },
      members: membersWithRoles,
      total: membersWithRoles.length + 1
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add member to organization (owner/admin only)
router.post('/members', 
  authMiddleware, 
  tenantIsolation,
  requireRole(['owner', 'admin']),
  auditLogger('member_added', 'organization'),
  async (req, res) => {
  try {
    const org = req.organization;
    const { email, role } = req.body;
    
    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role required' });
    }
    
    // Check if can add more members
    if (!org.canAddMember()) {
      return res.status(403).json({
        error: 'Member limit reached',
        message: `Your plan allows ${org.limits.maxUsers} team members`
      });
    }
    
    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found with this email' });
    }
    
    // Check if already a member
    if (org.isMember(user._id)) {
      return res.status(400).json({ error: 'User is already a member' });
    }
    
    // Add member
    org.members.push({
      userId: user._id,
      role: role,
      addedBy: req.user.userId
    });
    
    org.incrementUsage('user');
    await org.save();
    
    // Update user's organization
    user.organizationId = org._id;
    await user.save();
    
    res.json({
      success: true,
      message: 'Member added successfully',
      member: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove member from organization (owner/admin only)
router.delete('/members/:userId', 
  authMiddleware, 
  tenantIsolation,
  requireRole(['owner', 'admin']),
  auditLogger('member_removed', 'organization'),
  async (req, res) => {
  try {
    const org = req.organization;
    const { userId } = req.params;
    
    // Can't remove owner
    if (org.ownerId.toString() === userId) {
      return res.status(400).json({ error: 'Cannot remove organization owner' });
    }
    
    // Remove member
    org.members = org.members.filter(m => m.userId.toString() !== userId);
    org.decrementUsage('user');
    await org.save();
    
    res.json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get subscription plans
router.get('/plans', async (req, res) => {
  const plans = {
    free: {
      name: 'Free',
      price: 0,
      interval: 'forever',
      limits: {
        maxAWSAccounts: 3,
        maxDeployments: 50,
        maxDeploymentsPerMonth: 100,
        maxUsers: 5
      },
      features: [
        '3 AWS Accounts',
        '50 Total Deployments',
        '100 Deployments/Month',
        '5 Team Members',
        'Email Support',
        '14-Day Trial'
      ]
    },
    starter: {
      name: 'Starter',
      price: 29,
      interval: 'month',
      limits: {
        maxAWSAccounts: 5,
        maxDeployments: 200,
        maxDeploymentsPerMonth: 500,
        maxUsers: 10
      },
      features: [
        '5 AWS Accounts',
        '200 Total Deployments',
        '500 Deployments/Month',
        '10 Team Members',
        'Priority Email Support',
        'Audit Logs',
        'API Access'
      ]
    },
    professional: {
      name: 'Professional',
      price: 99,
      interval: 'month',
      limits: {
        maxAWSAccounts: 15,
        maxDeployments: 1000,
        maxDeploymentsPerMonth: 2000,
        maxUsers: 50
      },
      features: [
        '15 AWS Accounts',
        '1000 Total Deployments',
        '2000 Deployments/Month',
        '50 Team Members',
        '24/7 Priority Support',
        'Advanced Audit Logs',
        'API Access',
        'Custom Integrations',
        'SLA Guarantee'
      ]
    },
    enterprise: {
      name: 'Enterprise',
      price: 299,
      interval: 'month',
      limits: {
        maxAWSAccounts: -1, // Unlimited
        maxDeployments: -1,
        maxDeploymentsPerMonth: -1,
        maxUsers: -1
      },
      features: [
        'Unlimited AWS Accounts',
        'Unlimited Deployments',
        'Unlimited Team Members',
        'Dedicated Support',
        'Custom SLA',
        'White Label Option',
        'Advanced Security',
        'Custom Integrations',
        'Training & Onboarding'
      ]
    }
  };
  
  res.json({ plans });
});

export default router;
