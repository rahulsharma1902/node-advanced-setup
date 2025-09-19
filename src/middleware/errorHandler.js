const { logError, logWarning } = require('../utils/logger');
const { sendError, sendValidationError, HTTP_STATUS } = require('../utils/response');

/**
 * Custom error classes for better error handling
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = null, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, HTTP_STATUS.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', details);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', details = null) {
    super(message, HTTP_STATUS.UNAUTHORIZED, 'AUTHENTICATION_ERROR', details);
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access forbidden', details = null) {
    super(message, HTTP_STATUS.FORBIDDEN, 'AUTHORIZATION_ERROR', details);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource', message = null) {
    super(message || `${resource} not found`, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND', { resource });
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, HTTP_STATUS.CONFLICT, 'CONFLICT_ERROR', details);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfter = 60) {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS, 'RATE_LIMIT_ERROR', { retryAfter });
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', details = null) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'DATABASE_ERROR', details);
  }
}

class ExternalServiceError extends AppError {
  constructor(service, message = 'External service error', details = null) {
    super(message, HTTP_STATUS.BAD_GATEWAY, 'EXTERNAL_SERVICE_ERROR', { service, ...details });
  }
}

class FileUploadError extends AppError {
  constructor(message = 'File upload failed', details = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, 'FILE_UPLOAD_ERROR', details);
  }
}

class BusinessLogicError extends AppError {
  constructor(message, details = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, 'BUSINESS_LOGIC_ERROR', details);
  }
}

/**
 * Handle different types of errors
 */
const handleCastError = error => {
  const message = `Invalid ${error.path}: ${error.value}`;
  return new ValidationError(message, { field: error.path, value: error.value });
};

const handleDuplicateFieldsError = error => {
  const field = Object.keys(error.keyValue)[0];
  const value = error.keyValue[field];
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new ConflictError(message, { field, value });
};

const handleValidationError = error => {
  const errors = Object.values(error.errors).map(err => ({
    field: err.path,
    message: err.message,
    value: err.value,
  }));
  return new ValidationError('Invalid input data', errors);
};

const handleJWTError = () => {
  return new AuthenticationError('Invalid token. Please log in again!');
};

const handleJWTExpiredError = () => {
  return new AuthenticationError('Your token has expired! Please log in again.');
};

const handleMulterError = error => {
  let message = 'File upload error';
  let details = null;

  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      message = 'File too large';
      details = { maxSize: error.limit };
      break;
    case 'LIMIT_FILE_COUNT':
      message = 'Too many files';
      details = { maxCount: error.limit };
      break;
    case 'LIMIT_UNEXPECTED_FILE':
      message = 'Unexpected field';
      details = { field: error.field };
      break;
    default:
      message = error.message;
  }

  return new FileUploadError(message, details);
};

const handleCelebrateError = error => {
  const details = error.details;
  const errors = [];

  details.forEach(detail => {
    detail.details.forEach(item => {
      errors.push({
        field: item.path.join('.'),
        message: item.message,
        type: item.type,
      });
    });
  });

  return new ValidationError('Request validation failed', errors);
};

/**
 * Send error response in development
 */
const sendErrorDev = (err, res) => {
  return sendError(res, err.message, err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR, {
    code: err.code,
    details: err.details,
    stack: err.stack,
  });
};

/**
 * Send error response in production
 */
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    return sendError(res, err.message, err.statusCode, {
      code: err.code,
      details: err.details,
    });
  }

  // Programming or other unknown error: don't leak error details
  logError(err, { context: 'Unknown error in production' });

  return sendError(res, 'Something went wrong!', HTTP_STATUS.INTERNAL_SERVER_ERROR, {
    code: 'INTERNAL_ERROR',
  });
};

/**
 * Global error handling middleware
 */
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;

  // Log error details
  logError(err, {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    body: req.method !== 'GET' ? req.body : undefined,
    params: req.params,
    query: req.query,
  });

  let error = { ...err };
  error.message = err.message;

  // Handle specific error types
  if (err.name === 'CastError') error = handleCastError(error);
  if (err.code === 11000) error = handleDuplicateFieldsError(error);
  if (err.name === 'ValidationError') error = handleValidationError(error);
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();
  if (err.name === 'MulterError') error = handleMulterError(error);
  if (err.name === 'CelebrateError') error = handleCelebrateError(error);

  // Handle JSON parsing errors
  if (err.name === 'SyntaxError' && err.message.includes('JSON')) {
    error = new AppError('Invalid JSON format', HTTP_STATUS.BAD_REQUEST, 'INVALID_JSON');
  }

  // Send appropriate error response
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

/**
 * Handle unhandled routes
 */
const handleNotFound = (req, res, next) => {
  const err = new NotFoundError('Route', `Can't find ${req.originalUrl} on this server!`);
  next(err);
};

/**
 * Async error handler wrapper
 */
const asyncHandler = fn => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Create error with context
 */
const createError = (
  message,
  statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
  code = null,
  details = null,
) => {
  return new AppError(message, statusCode, code, details);
};

/**
 * Assert condition or throw error
 */
const assert = (condition, message, statusCode = HTTP_STATUS.BAD_REQUEST, code = null) => {
  if (!condition) {
    throw new AppError(message, statusCode, code);
  }
};

/**
 * Validate required fields
 */
const validateRequired = (data, fields) => {
  const missing = [];

  fields.forEach(field => {
    if (!data[field] && data[field] !== 0 && data[field] !== false) {
      missing.push(field);
    }
  });

  if (missing.length > 0) {
    throw new ValidationError('Missing required fields', { missing });
  }
};

/**
 * Handle promise rejections
 */
const handlePromiseRejection = () => {
  process.on('unhandledRejection', (err, promise) => {
    logError(err, {
      context: 'Unhandled Promise Rejection',
      promise: promise.toString(),
    });

    // Close server gracefully
    process.exit(1);
  });
};

/**
 * Handle uncaught exceptions
 */
const handleUncaughtException = () => {
  process.on('uncaughtException', err => {
    logError(err, { context: 'Uncaught Exception' });

    // Close server gracefully
    process.exit(1);
  });
};

/**
 * Graceful shutdown handler
 */
const gracefulShutdown = server => {
  const shutdown = signal => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    server.close(() => {
      console.log('Process terminated');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      console.log('Forcing shutdown...');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

/**
 * Error monitoring and alerting
 */
const monitorErrors = (err, req) => {
  // In production, you might want to send alerts for critical errors
  if (err.statusCode >= 500) {
    // Send alert to monitoring service (e.g., Sentry, DataDog, etc.)
    logError(err, {
      context: 'Critical error detected',
      url: req?.originalUrl,
      method: req?.method,
      userId: req?.user?.id,
      severity: 'critical',
    });
  }
};

/**
 * Rate limit error handler
 */
const handleRateLimit = (req, res) => {
  const error = new RateLimitError('Too many requests from this IP, please try again later.');

  logWarning('Rate limit exceeded', {
    ip: req.ip,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
  });

  return sendError(res, {
    statusCode: error.statusCode,
    message: error.message,
    code: error.code,
    details: error.details,
  });
};

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  FileUploadError,
  BusinessLogicError,

  // Middleware
  globalErrorHandler,
  handleNotFound,
  asyncHandler,

  // Utilities
  createError,
  assert,
  validateRequired,
  handlePromiseRejection,
  handleUncaughtException,
  gracefulShutdown,
  monitorErrors,
  handleRateLimit,
};
