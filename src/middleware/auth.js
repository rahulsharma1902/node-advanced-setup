const jwt = require('jsonwebtoken');
const { config } = require('../config');
const authService = require('../services/auth/auth.service');
const userService = require('../services/user/user.service');
const { AuthenticationError, AuthorizationError } = require('./errorHandler');
const { logInfo, logError } = require('../utils/logger');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AuthenticationError('Authorization header is required');
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!token) {
      throw new AuthenticationError('Access token is required');
    }

    // Validate token format
    if (!authService.validateTokenFormat(token)) {
      throw new AuthenticationError('Invalid token format');
    }

    // Verify token
    const decoded = authService.verifyToken(token);

    // Get user from database
    const user = await userService.findUserById(decoded.id);

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    // Check if account is locked
    if (user.isLocked && user.lockedUntil && new Date() < user.lockedUntil) {
      throw new AuthenticationError('Account is temporarily locked');
    }

    // Attach user to request
    req.user = user;
    req.token = token;

    logInfo('User authenticated successfully', {
      userId: user.id,
      email: user.email,
      ip: req.ip,
    });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AuthenticationError('Invalid token'));
    }

    if (error.name === 'TokenExpiredError') {
      return next(new AuthenticationError('Token expired'));
    }

    next(error);
  }
};

/**
 * Optional authentication middleware
 * Attaches user to request if token is provided, but doesn't require it
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next();
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!token || !authService.validateTokenFormat(token)) {
      return next();
    }

    // Verify token
    const decoded = authService.verifyToken(token);

    // Get user from database
    const user = await userService.findUserById(decoded.id);

    if (
      user &&
      user.isActive &&
      (!user.isLocked || !user.lockedUntil || new Date() >= user.lockedUntil)
    ) {
      req.user = user;
      req.token = token;
    }

    next();
  } catch (error) {
    // Ignore authentication errors in optional auth
    next();
  }
};

/**
 * Authorization middleware factory
 * Checks if user has required role(s)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (roles.length === 0) {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      logError(new Error('Authorization failed'), {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
        endpoint: req.originalUrl,
      });

      return next(new AuthorizationError('Insufficient permissions'));
    }

    logInfo('User authorized successfully', {
      userId: req.user.id,
      userRole: req.user.role,
      endpoint: req.originalUrl,
    });

    next();
  };
};

/**
 * Permission-based authorization middleware
 * Checks if user has specific permissions
 */
const requirePermissions = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    // Admin users have all permissions
    if (req.user.role === 'admin') {
      return next();
    }

    // Check if user has required permissions
    const userPermissions = req.user.permissions || [];
    const hasPermission = permissions.every(permission => userPermissions.includes(permission));

    if (!hasPermission) {
      logError(new Error('Permission denied'), {
        userId: req.user.id,
        userPermissions,
        requiredPermissions: permissions,
        endpoint: req.originalUrl,
      });

      return next(new AuthorizationError('Insufficient permissions'));
    }

    next();
  };
};

/**
 * Resource ownership middleware
 * Checks if user owns the resource or has admin role
 */
const requireOwnership = (resourceIdParam = 'id', userIdField = 'userId') => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    // Admin users can access any resource
    if (req.user.role === 'admin') {
      return next();
    }

    const resourceId = req.params[resourceIdParam];
    const userId = req.user.id;

    // If checking user ID directly
    if (resourceIdParam === 'userId' && resourceId !== userId) {
      return next(new AuthorizationError('Access denied'));
    }

    // For other resources, you would typically fetch the resource
    // and check if it belongs to the user
    // This is a simplified example
    if (req.body && req.body[userIdField] && req.body[userIdField] !== userId) {
      return next(new AuthorizationError('Access denied'));
    }

    next();
  };
};

/**
 * Email verification middleware
 * Requires user to have verified email
 */
const requireEmailVerification = (req, res, next) => {
  if (!req.user) {
    return next(new AuthenticationError('Authentication required'));
  }

  if (!req.user.isEmailVerified) {
    return next(new AuthorizationError('Email verification required'));
  }

  next();
};

/**
 * Account status middleware
 * Checks various account status conditions
 */
const requireAccountStatus = (options = {}) => {
  const { requireActive = true, requireVerified = false, allowLocked = false } = options;

  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (requireActive && !req.user.isActive) {
      return next(new AuthorizationError('Account is deactivated'));
    }

    if (requireVerified && !req.user.isEmailVerified) {
      return next(new AuthorizationError('Email verification required'));
    }

    if (
      !allowLocked &&
      req.user.isLocked &&
      req.user.lockedUntil &&
      new Date() < req.user.lockedUntil
    ) {
      return next(new AuthorizationError('Account is temporarily locked'));
    }

    next();
  };
};

/**
 * Rate limiting by user middleware
 * Applies different rate limits based on user role
 */
const userBasedRateLimit = (limits = {}) => {
  const defaultLimits = {
    admin: { windowMs: 15 * 60 * 1000, max: 1000 }, // 1000 requests per 15 minutes
    moderator: { windowMs: 15 * 60 * 1000, max: 500 }, // 500 requests per 15 minutes
    user: { windowMs: 15 * 60 * 1000, max: 100 }, // 100 requests per 15 minutes
    guest: { windowMs: 15 * 60 * 1000, max: 50 }, // 50 requests per 15 minutes
  };

  const rateLimits = { ...defaultLimits, ...limits };

  return (req, res, next) => {
    const userRole = req.user?.role || 'guest';
    const limit = rateLimits[userRole] || rateLimits.guest;

    // Store rate limit info for potential use by rate limiter
    req.rateLimit = limit;

    next();
  };
};

/**
 * API key authentication middleware
 * Alternative authentication method using API keys
 */
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey) {
      throw new AuthenticationError('API key is required');
    }

    // In a real application, you would validate the API key against a database
    // This is a simplified example
    const validApiKeys = config.apiKeys || [];

    if (!validApiKeys.includes(apiKey)) {
      throw new AuthenticationError('Invalid API key');
    }

    // You might also want to associate the API key with a user or service
    req.apiKey = apiKey;
    req.authMethod = 'api-key';

    logInfo('API key authentication successful', { apiKey: apiKey.substring(0, 8) + '...' });

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Dual authentication middleware
 * Accepts either JWT token or API key
 */
const authenticateFlexible = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (authHeader) {
    return authenticate(req, res, next);
  } else if (apiKey) {
    return authenticateApiKey(req, res, next);
  } else {
    return next(new AuthenticationError('Authentication required (JWT token or API key)'));
  }
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  authorize,
  requirePermissions,
  requireOwnership,
  requireEmailVerification,
  requireAccountStatus,
  userBasedRateLimit,
  authenticateApiKey,
  authenticateFlexible,
};
