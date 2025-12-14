import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';

/**
 * Helmet configuration for security headers
 */
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

/**
 * MongoDB injection protection
 * Removes $ and . from user input
 */
export const mongoSanitizeConfig = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`Potential MongoDB injection attempt detected: ${key} in ${req.originalUrl}`);
  },
});

/**
 * XSS Protection middleware
 */
export const xssProtection = (req, res, next) => {
  // Add XSS protection header
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
};

/**
 * CORS configuration
 */
export const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(url => url.trim())
      : ['http://localhost:5173', 'http://localhost:3000'];
    
    console.log('CORS Check - Origin:', origin);
    console.log('CORS Check - Allowed Origins:', allowedOrigins);
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS Error - Origin not allowed:', origin);
      callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar']
};

/**
 * Request size limiter
 */
export const requestSizeLimiter = (req, res, next) => {
  const contentLength = req.headers['content-length'];
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (contentLength && parseInt(contentLength) > maxSize) {
    return res.status(413).json({
      error: 'Request entity too large',
      maxSize: '10MB'
    });
  }
  
  next();
};

/**
 * Prevent parameter pollution
 */
export const preventParameterPollution = (req, res, next) => {
  // Check for duplicate query parameters
  const params = new URLSearchParams(req.url.split('?')[1]);
  const keys = Array.from(params.keys());
  const uniqueKeys = new Set(keys);
  
  if (keys.length !== uniqueKeys.size) {
    return res.status(400).json({
      error: 'Duplicate query parameters detected'
    });
  }
  
  next();
};

/**
 * Security headers middleware
 */
export const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
};

/**
 * IP whitelist middleware (optional)
 */
export const ipWhitelist = (whitelist = []) => {
  return (req, res, next) => {
    if (whitelist.length === 0) {
      return next(); // No whitelist configured
    }
    
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (whitelist.includes(clientIp)) {
      next();
    } else {
      res.status(403).json({
        error: 'Access denied from your IP address'
      });
    }
  };
};

/**
 * Detect and block suspicious patterns
 */
export const detectSuspiciousPatterns = (req, res, next) => {
  const suspiciousPatterns = [
    /(\$where|\$ne|\$gt|\$lt)/i, // MongoDB operators
    /(union|select|insert|update|delete|drop|create|alter)/i, // SQL keywords
    /(<script|javascript:|onerror=|onload=)/i, // XSS patterns
    /(\.\.\/|\.\.\\)/i, // Path traversal
  ];
  
  const checkString = JSON.stringify(req.body) + JSON.stringify(req.query);
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(checkString)) {
      console.warn(`Suspicious pattern detected from ${req.ip}: ${pattern}`);
      return res.status(400).json({
        error: 'Invalid request detected'
      });
    }
  }
  
  next();
};
