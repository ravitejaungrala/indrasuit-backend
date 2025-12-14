import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import Analytics from '../models/Analytics.js';
import Deployment from '../models/Deployment.js';
import AWSAccount from '../models/AWSAccount.js';

const router = express.Router();

// Get dashboard overview
router.get('/overview', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayDeployments = await Deployment.countDocuments({
      userId,
      createdAt: { $gte: today }
    });
    
    const totalDeployments = await Deployment.countDocuments({
      userId
    });
    
    const successfulDeployments = await Deployment.countDocuments({
      userId,
      status: 'completed'
    });
    
    const failedDeployments = await Deployment.countDocuments({
      userId,
      status: 'failed'
    });
    
    const activeAWSAccounts = await AWSAccount.countDocuments({
      userId,
      isActive: true
    });
    
    // Calculate success rate
    const successRate = totalDeployments > 0 
      ? Math.round((successfulDeployments / totalDeployments) * 100) 
      : 0;
    
    res.json({
      overview: {
        todayDeployments,
        totalDeployments,
        successfulDeployments,
        failedDeployments,
        successRate,
        activeAWSAccounts,
        usage: {
          deployments: totalDeployments,
          awsAccounts: activeAWSAccounts
        },
        limits: {
          maxAWSAccounts: -1,
          maxDeployments: -1
        }
      }
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get deployment statistics
router.get('/deployments', authMiddleware, tenantIsolation, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const org = req.organization;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Get deployments for the period
    const deployments = await Deployment.find({
      organizationId: org._id,
      createdAt: { $gte: startDate }
    }).sort({ createdAt: 1 });
    
    // Group by date
    const dailyStats = {};
    deployments.forEach(deployment => {
      const date = new Date(deployment.createdAt).toISOString().split('T')[0];
      if (!dailyStats[date]) {
        dailyStats[date] = {
          date,
          total: 0,
          successful: 0,
          failed: 0,
          pending: 0
        };
      }
      dailyStats[date].total++;
      if (deployment.status === 'completed') dailyStats[date].successful++;
      if (deployment.status === 'failed') dailyStats[date].failed++;
      if (deployment.status === 'pending') dailyStats[date].pending++;
    });
    
    const stats = Object.values(dailyStats);
    
    res.json({
      deployments: stats,
      summary: {
        total: deployments.length,
        successful: deployments.filter(d => d.status === 'completed').length,
        failed: deployments.filter(d => d.status === 'failed').length,
        pending: deployments.filter(d => d.status === 'pending').length
      }
    });
  } catch (error) {
    console.error('Deployment analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get resource distribution
router.get('/resources', authMiddleware, tenantIsolation, async (req, res) => {
  try {
    const org = req.organization;
    
    const deployments = await Deployment.find({
      organizationId: org._id,
      status: 'completed'
    });
    
    const resourceTypes = {};
    deployments.forEach(deployment => {
      const type = deployment.resourceType || 'other';
      resourceTypes[type] = (resourceTypes[type] || 0) + 1;
    });
    
    const distribution = Object.entries(resourceTypes).map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / deployments.length) * 100)
    }));
    
    res.json({
      distribution,
      total: deployments.length
    });
  } catch (error) {
    console.error('Resource analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get usage trends
router.get('/usage', authMiddleware, tenantIsolation, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const org = req.organization;
    
    const analytics = await Analytics.getLatestAnalytics(org._id, parseInt(days));
    
    const trends = analytics.map(a => ({
      date: a.date,
      deployments: a.metrics.totalDeployments,
      awsAccounts: a.metrics.awsAccountsUsed,
      activeUsers: a.metrics.activeUsers
    }));
    
    res.json({
      trends,
      current: {
        awsAccounts: org.usage.awsAccounts,
        deployments: org.usage.deployments,
        users: org.usage.users,
        deploymentsThisMonth: org.usage.deploymentsThisMonth
      },
      limits: org.limits
    });
  } catch (error) {
    console.error('Usage analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get performance metrics
router.get('/performance', authMiddleware, tenantIsolation, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const org = req.organization;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const deployments = await Deployment.find({
      organizationId: org._id,
      status: 'completed',
      createdAt: { $gte: startDate },
      updatedAt: { $exists: true }
    });
    
    // Calculate deployment times
    const deploymentTimes = deployments.map(d => {
      const duration = new Date(d.updatedAt) - new Date(d.createdAt);
      return {
        date: new Date(d.createdAt).toISOString().split('T')[0],
        duration: Math.round(duration / 1000), // seconds
        resourceType: d.resourceType
      };
    });
    
    // Average by date
    const dailyPerformance = {};
    deploymentTimes.forEach(({ date, duration }) => {
      if (!dailyPerformance[date]) {
        dailyPerformance[date] = { date, total: 0, count: 0 };
      }
      dailyPerformance[date].total += duration;
      dailyPerformance[date].count++;
    });
    
    const performance = Object.values(dailyPerformance).map(d => ({
      date: d.date,
      avgDuration: Math.round(d.total / d.count)
    }));
    
    // Overall average
    const totalDuration = deploymentTimes.reduce((sum, d) => sum + d.duration, 0);
    const avgDuration = deploymentTimes.length > 0 
      ? Math.round(totalDuration / deploymentTimes.length) 
      : 0;
    
    res.json({
      performance,
      summary: {
        avgDuration,
        totalDeployments: deployments.length,
        fastestDeployment: Math.min(...deploymentTimes.map(d => d.duration)),
        slowestDeployment: Math.max(...deploymentTimes.map(d => d.duration))
      }
    });
  } catch (error) {
    console.error('Performance analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate daily analytics (can be called by cron job)
router.post('/generate-daily', authMiddleware, tenantIsolation, async (req, res) => {
  try {
    const { date } = req.body;
    const org = req.organization;
    
    const analyticsDate = date ? new Date(date) : new Date();
    analyticsDate.setHours(0, 0, 0, 0);
    
    // Check if analytics already exist for this date
    const existing = await Analytics.findOne({
      organizationId: org._id,
      date: analyticsDate
    });
    
    if (existing) {
      return res.json({ 
        message: 'Analytics already exist for this date',
        analytics: existing 
      });
    }
    
    // Generate analytics
    const analyticsData = await Analytics.aggregateDailyMetrics(org._id, analyticsDate);
    const analytics = new Analytics(analyticsData);
    await analytics.save();
    
    res.json({
      message: 'Daily analytics generated successfully',
      analytics
    });
  } catch (error) {
    console.error('Generate analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get hourly breakdown for today
router.get('/hourly', authMiddleware, tenantIsolation, async (req, res) => {
  try {
    const org = req.organization;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const analytics = await Analytics.findOne({
      organizationId: org._id,
      date: today
    });
    
    if (!analytics) {
      // Generate on-the-fly if not exists
      const analyticsData = await Analytics.aggregateDailyMetrics(org._id, today);
      return res.json({ hourlyData: analyticsData.hourlyData });
    }
    
    res.json({ hourlyData: analytics.hourlyData });
  } catch (error) {
    console.error('Hourly analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
