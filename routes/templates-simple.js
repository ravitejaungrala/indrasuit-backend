import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { auditLogger } from '../middleware/auditLogger.js';
import Template from '../models/Template.js';
import Deployment from '../models/Deployment.js';

const router = express.Router();

// Get all templates (user's + public)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { resourceType, category, search } = req.query;
    
    let query = {
      $or: [
        { userId: req.user.userId, isActive: true },
        { isPublic: true, isActive: true }
      ]
    };
    
    if (resourceType) query.resourceType = resourceType;
    if (category) query.category = category;
    if (search) query.$or.push({ name: new RegExp(search, 'i') }, { description: new RegExp(search, 'i') });
    
    const templates = await Template.find(query)
      .sort({ usageCount: -1, createdAt: -1 })
      .limit(100);
    
    res.json({ templates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single template
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user.userId },
        { isPublic: true }
      ],
      isActive: true
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ template });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create template
router.post('/', authMiddleware, auditLogger('template_created', 'template'), async (req, res) => {
  try {
    const { name, description, resourceType, category, configuration, tags, isPublic } = req.body;
    
    const template = new Template({
      userId: req.user.userId,
      createdBy: req.user.userId,
      name,
      description,
      resourceType,
      category: category || 'custom',
      configuration,
      tags: tags || [],
      isPublic: isPublic || false
    });
    
    await template.save();
    res.json({ message: 'Template created successfully', template });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update template
router.put('/:id', authMiddleware, auditLogger('template_updated', 'template'), async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const { name, description, configuration, tags, isPublic } = req.body;
    
    if (name) template.name = name;
    if (description) template.description = description;
    if (configuration) template.configuration = configuration;
    if (tags) template.tags = tags;
    if (isPublic !== undefined) template.isPublic = isPublic;
    
    await template.save();
    res.json({ message: 'Template updated successfully', template });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete template
router.delete('/:id', authMiddleware, auditLogger('template_deleted', 'template'), async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    template.isActive = false;
    await template.save();
    
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Deploy from template
router.post('/:id/deploy', authMiddleware, auditLogger('deployment_from_template', 'deployment'), async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user.userId },
        { isPublic: true }
      ],
      isActive: true
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const { awsAccountId } = req.body;
    
    const deployment = new Deployment({
      userId: req.user.userId,
      awsAccountId,
      resourceType: template.resourceType,
      configuration: template.configuration,
      status: 'pending',
      templateId: template._id
    });
    
    await deployment.save();
    
    template.usageCount += 1;
    await template.save();
    
    res.json({ message: 'Deployment created from template', deployment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get popular templates
router.get('/popular/list', authMiddleware, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const templates = await Template.find({ isPublic: true, isActive: true })
      .sort({ usageCount: -1 })
      .limit(parseInt(limit));
    
    res.json({ templates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get my templates
router.get('/my/list', authMiddleware, async (req, res) => {
  try {
    const templates = await Template.find({
      userId: req.user.userId,
      isActive: true
    }).sort({ createdAt: -1 });
    
    res.json({ templates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
