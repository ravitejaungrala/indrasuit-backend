import rateLimit from 'express-rate-limit';

// Rate limiting DISABLED - No limits for better user experience
const DISABLE_RATE_LIMIT = true; // Always disabled

// General API rate limiter - 100 requests per 15 minutes
export const apiLimiter = DISABLE_RATE_LIMIT 
  ? (req, res, next) => next() // Bypass in development
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
      },
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
      handler: (req, res) => {
        res.status(429).json({
          error: 'Too many requests, please slow down.',
          retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
      }
    });

// Strict limiter for authentication endpoints - 20 requests per 15 minutes
export const authLimiter = DISABLE_RATE_LIMIT
  ? (req, res, next) => next() // Bypass in development
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 20, // Increased from 5 to 20 for better development experience
      skipSuccessfulRequests: true, // Don't count successful requests
      message: {
        error: 'Too many login attempts, please try again later.',
        retryAfter: '15 minutes'
      },
      handler: (req, res) => {
        res.status(429).json({
          error: 'Too many authentication attempts. Please try again in 15 minutes.',
          retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
      }
    });

// Deployment limiter - 10 deployments per hour
export const deployLimiter = DISABLE_RATE_LIMIT
  ? (req, res, next) => next() // Bypass in development
  : rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 10,
      message: {
        error: 'Deployment limit exceeded. Maximum 10 deployments per hour.',
        retryAfter: '1 hour'
      },
      keyGenerator: (req) => {
        // Rate limit per user, not per IP
        return req.user?.userId || req.ip;
      },
      handler: (req, res) => {
        res.status(429).json({
          error: 'You have exceeded the deployment limit. Please try again later.',
          limit: 10,
          window: '1 hour',
          retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
      }
    });

// AWS Account creation limiter - 5 accounts per hour
export const accountCreationLimiter = DISABLE_RATE_LIMIT
  ? (req, res, next) => next() // Bypass in development
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 5,
      message: {
        error: 'Account creation limit exceeded. Maximum 5 AWS accounts per hour.',
        retryAfter: '1 hour'
      },
      keyGenerator: (req) => {
        return req.user?.userId || req.ip;
      },
      handler: (req, res) => {
        res.status(429).json({
          error: 'You have exceeded the AWS account creation limit.',
          limit: 5,
          window: '1 hour',
          retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
      }
    });

// Sync limiter - 20 syncs per hour
export const syncLimiter = DISABLE_RATE_LIMIT
  ? (req, res, next) => next() // Bypass in development
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 20,
      message: {
        error: 'Sync limit exceeded. Maximum 20 syncs per hour.',
        retryAfter: '1 hour'
      },
      keyGenerator: (req) => {
        return req.user?.userId || req.ip;
      }
    });
