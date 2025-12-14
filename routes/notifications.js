import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import Notification from '../models/Notification.js';

const router = express.Router();

// Get notifications
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { limit = 50, skip = 0, unreadOnly = false } = req.query;
    
    const query = {
      userId: req.user.userId
    };
    
    if (unreadOnly === 'true') {
      query.read = false;
    }
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    const unreadCount = await Notification.getUnreadCount(req.user.userId);
    
    res.json({
      notifications,
      unreadCount,
      total: await Notification.countDocuments(query)
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get unread count
router.get('/unread/count', authMiddleware, async (req, res) => {
  try {
    const count = await Notification.getUnreadCount(req.user.userId);
    
    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    await notification.markAsRead();
    
    res.json({
      message: 'Notification marked as read',
      notification
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark all as read
router.put('/read/all', authMiddleware, async (req, res) => {
  try {
    const result = await Notification.markAllAsRead(req.user.userId);
    
    res.json({
      message: 'All notifications marked as read',
      count: result.modifiedCount
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete notification
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId
    });
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create notification (for testing)
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const { type, title, message, priority } = req.body;
    
    const notification = await Notification.createNotification({
      userId: req.user.userId,
      type: type || 'system',
      title: title || 'Test Notification',
      message: message || 'This is a test notification',
      priority: priority || 'medium'
    });
    
    res.json({
      message: 'Test notification created',
      notification
    });
  } catch (error) {
    console.error('Create test notification error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
