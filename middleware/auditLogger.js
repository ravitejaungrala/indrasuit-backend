import AuditLog from '../models/AuditLog.js';

/**
 * Middleware to automatically log all requests
 */
export const auditLogger = (action, resourceType) => {
  return async (req, res, next) => {
    // Store start time
    req.auditStartTime = Date.now();
    
    // Store audit metadata
    req.auditAction = action;
    req.auditResourceType = resourceType;
    
    // Capture the original res.json to log after response
    const originalJson = res.json.bind(res);
    
    res.json = function(data) {
      // Log the action after response
      setImmediate(async () => {
        try {
          const duration = Date.now() - req.auditStartTime;
          const status = res.statusCode < 400 ? 'success' : 'failure';
          
          // Get email from user, request body, or default to anonymous
          const userEmail = req.user?.email || req.body?.email || 'anonymous';
          
          await AuditLog.logAction({
            userId: req.user?.userId || null,
            userEmail,
            action: req.auditAction || action,
            resourceType: req.auditResourceType || resourceType,
            resourceId: req.auditResourceId,
            resourceName: req.auditResourceName,
            method: req.method,
            endpoint: req.originalUrl,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent'),
            status,
            details: req.auditDetails,
            errorMessage: status === 'failure' ? data.error : undefined,
            timestamp: new Date(req.auditStartTime),
            duration
          });
        } catch (error) {
          console.error('Audit logging failed:', error);
        }
      });
      
      return originalJson(data);
    };
    
    next();
  };
};

/**
 * Helper to set audit details in route handlers
 */
export const setAuditDetails = (req, details) => {
  req.auditDetails = { ...req.auditDetails, ...details };
};

/**
 * Helper to set resource info
 */
export const setAuditResource = (req, resourceId, resourceName) => {
  req.auditResourceId = resourceId;
  req.auditResourceName = resourceName;
};

/**
 * Middleware to log failed authentication attempts
 */
export const logFailedAuth = async (email, ipAddress, userAgent, reason) => {
  try {
    await AuditLog.logAction({
      userId: null,
      userEmail: email,
      action: 'login_failed',
      resourceType: 'user',
      method: 'POST',
      endpoint: '/auth/verify-otp',
      ipAddress,
      userAgent,
      status: 'failure',
      details: { reason },
      errorMessage: reason
    });
  } catch (error) {
    console.error('Failed to log authentication failure:', error);
  }
};

/**
 * Middleware to log rate limit exceeded
 */
export const logRateLimitExceeded = async (req) => {
  try {
    await AuditLog.logAction({
      userId: req.user?.userId,
      userEmail: req.user?.email || 'anonymous',
      action: 'rate_limit_exceeded',
      method: req.method,
      endpoint: req.originalUrl,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      status: 'warning',
      details: {
        limit: req.rateLimit?.limit,
        remaining: req.rateLimit?.remaining,
        resetTime: req.rateLimit?.resetTime
      }
    });
  } catch (error) {
    console.error('Failed to log rate limit:', error);
  }
};

/**
 * Middleware to log validation errors
 */
export const logValidationError = async (req, errors) => {
  try {
    await AuditLog.logAction({
      userId: req.user?.userId,
      userEmail: req.user?.email || 'anonymous',
      action: 'validation_failed',
      method: req.method,
      endpoint: req.originalUrl,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      status: 'failure',
      details: { errors }
    });
  } catch (error) {
    console.error('Failed to log validation error:', error);
  }
};

/**
 * Middleware to log unauthorized access attempts
 */
export const logUnauthorizedAccess = async (req, reason) => {
  try {
    await AuditLog.logAction({
      userId: req.user?.userId,
      userEmail: req.user?.email || 'anonymous',
      action: 'unauthorized_access',
      method: req.method,
      endpoint: req.originalUrl,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      status: 'failure',
      details: { reason },
      errorMessage: reason
    });
  } catch (error) {
    console.error('Failed to log unauthorized access:', error);
  }
};

export default auditLogger;
