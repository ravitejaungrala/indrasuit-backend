import { body, param, query, validationResult } from 'express-validator';

// Middleware to handle validation errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// AWS Account validation
export const validateAWSAccount = [
  body('accountName')
    .trim()
    .notEmpty().withMessage('Account name is required')
    .isLength({ min: 3, max: 50 }).withMessage('Account name must be 3-50 characters')
    .matches(/^[a-zA-Z0-9-_\s]+$/).withMessage('Account name can only contain letters, numbers, hyphens, and underscores'),
  
  body('organizationName')
    .trim()
    .notEmpty().withMessage('Organization name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Organization name must be 2-100 characters'),
  
  body('accessKey')
    .trim()
    .notEmpty().withMessage('Access key is required')
    .isLength({ min: 16, max: 128 }).withMessage('Invalid access key format'),
  
  body('secretKey')
    .trim()
    .notEmpty().withMessage('Secret key is required')
    .isLength({ min: 16, max: 128 }).withMessage('Invalid secret key format'),
  
  body('region')
    .trim()
    .notEmpty().withMessage('Region is required')
    .matches(/^[a-z]{2}-[a-z]+-\d{1}$/).withMessage('Invalid AWS region format'),
  
  body('accountType')
    .optional()
    .isIn(['production', 'staging', 'development', 'testing', 'sandbox'])
    .withMessage('Invalid account type'),
  
  handleValidationErrors
];

// EC2 Deployment validation
export const validateEC2Deployment = [
  body('instance_name')
    .trim()
    .notEmpty().withMessage('Instance name is required')
    .isLength({ min: 3, max: 50 }).withMessage('Instance name must be 3-50 characters')
    .matches(/^[a-zA-Z0-9-_]+$/).withMessage('Instance name can only contain letters, numbers, hyphens, and underscores'),
  
  body('instance_type')
    .trim()
    .notEmpty().withMessage('Instance type is required')
    .matches(/^[a-z0-9]+\.[a-z0-9]+$/).withMessage('Invalid instance type format'),
  
  body('ami_id')
    .trim()
    .notEmpty().withMessage('AMI ID is required')
    .matches(/^ami-[a-f0-9]{8,17}$/).withMessage('Invalid AMI ID format'),
  
  body('key_name')
    .trim()
    .notEmpty().withMessage('Key pair name is required')
    .isLength({ min: 1, max: 255 }).withMessage('Key name must be 1-255 characters'),
  
  body('awsAccountId')
    .trim()
    .notEmpty().withMessage('AWS account ID is required')
    .isMongoId().withMessage('Invalid AWS account ID'),
  
  body('region')
    .optional()
    .matches(/^[a-z]{2}-[a-z]+-\d{1}$/).withMessage('Invalid AWS region format'),
  
  body('root_volume_size')
    .optional()
    .isInt({ min: 8, max: 16384 }).withMessage('Volume size must be between 8 and 16384 GB'),
  
  body('security_group_ids')
    .optional()
    .isArray().withMessage('Security group IDs must be an array'),
  
  handleValidationErrors
];

// S3 Deployment validation
export const validateS3Deployment = [
  body('bucketName')
    .trim()
    .notEmpty().withMessage('Bucket name is required')
    .isLength({ min: 3, max: 63 }).withMessage('Bucket name must be 3-63 characters')
    .matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/).withMessage('Invalid bucket name format')
    .custom((value) => {
      if (value.includes('..') || value.startsWith('-') || value.endsWith('-')) {
        throw new Error('Bucket name cannot contain consecutive dots or start/end with hyphens');
      }
      return true;
    }),
  
  body('awsAccountId')
    .trim()
    .notEmpty().withMessage('AWS account ID is required')
    .isMongoId().withMessage('Invalid AWS account ID'),
  
  body('isPublic')
    .optional()
    .isBoolean().withMessage('isPublic must be a boolean'),
  
  body('versioning')
    .optional()
    .isBoolean().withMessage('versioning must be a boolean'),
  
  body('encryption')
    .optional()
    .isBoolean().withMessage('encryption must be a boolean'),
  
  handleValidationErrors
];

// IAM Deployment validation
export const validateIAMDeployment = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 1, max: 64 }).withMessage('Username must be 1-64 characters')
    .matches(/^[a-zA-Z0-9+=,.@_-]+$/).withMessage('Invalid IAM username format'),
  
  body('permissions')
    .notEmpty().withMessage('Permissions are required')
    .isIn(['read-only', 'power-user', 'admin']).withMessage('Invalid permission level'),
  
  body('awsAccountId')
    .trim()
    .notEmpty().withMessage('AWS account ID is required')
    .isMongoId().withMessage('Invalid AWS account ID'),
  
  handleValidationErrors
];

// MongoDB ID validation
export const validateMongoId = (paramName = 'id') => [
  param(paramName)
    .trim()
    .notEmpty().withMessage(`${paramName} is required`)
    .isMongoId().withMessage(`Invalid ${paramName} format`),
  
  handleValidationErrors
];

// Email validation
export const validateEmail = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  handleValidationErrors
];

// OTP validation
export const validateOTP = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('otp')
    .trim()
    .notEmpty().withMessage('OTP is required')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
    .isNumeric().withMessage('OTP must contain only numbers'),
  
  handleValidationErrors
];

// Query parameter validation
export const validateQueryParams = [
  query('accountId')
    .optional()
    .isMongoId().withMessage('Invalid account ID'),
  
  query('region')
    .optional()
    .matches(/^[a-z]{2}-[a-z]+-\d{1}$/).withMessage('Invalid AWS region format'),
  
  query('vpcId')
    .optional()
    .matches(/^vpc-[a-f0-9]{8,17}$/).withMessage('Invalid VPC ID format'),
  
  handleValidationErrors
];

// Sync validation
export const validateSync = [
  body('userId')
    .optional()
    .isMongoId().withMessage('Invalid user ID'),
  
  handleValidationErrors
];
