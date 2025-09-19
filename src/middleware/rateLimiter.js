const rateLimit = require('express-rate-limit');
const { config } = require('../config');
const { logInfo, logError, logWarning } = require('../utils/logger');

// Redis client for distributed rate limiting (optional)
// const redis = require('../database/redis');

/**
 * Create a rate limiter with custom options
 */
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: config.rateLimiting.windowMs || 15 * 60 * 1000, // 15 minutes
    max: config.rateLimiting.maxRequests || 100, // limit each IP to 100 requests per windowMs
    message: {
      status: 'error',
      message: 'Too many requests, please try again later.',
      retryAfter: Math.ceil((options.windowMs || 15 * 60 * 1000) / 1000),
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skipSuccessfulRequests: false, // Don't count successful requests
    skipFailedRequests: false, // Don't count failed requests
    keyGenerator: req => {
      // Use user ID if authenticated, otherwise use IP
      return req.user?.id || req.ip;
    },
    handler: (req, res) => {
      logWarning('Rate limit exceeded', {
        ip: req.ip,
        userId: req.user?.id,
        endpoint: req.originalUrl,
        userAgent: req.get('User-Agent'),
      });

      res.status(429).json(options.message || defaultOptions.message);
    },
    // Note: onLimitReached is deprecated in express-rate-limit v7
    // We handle logging in the handler instead
  };

  return rateLimit({ ...defaultOptions, ...options });
};

/**
 * Global rate limiter for all requests
 */
const globalRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again later.',
  },
});

/**
 * Strict rate limiter for sensitive endpoints
 */
const strictRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many attempts, please try again later.',
  },
});

/**
 * Authentication rate limiters
 */
const authRateLimiters = {
  // Login attempts
  login: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 login attempts per windowMs
    skipSuccessfulRequests: true, // Don't count successful logins
    message: {
      status: 'error',
      message: 'Too many login attempts, please try again later.',
    },
  }),

  // Registration attempts
  register: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // limit each IP to 5 registration attempts per hour
    message: {
      status: 'error',
      message: 'Too many registration attempts, please try again later.',
    },
  }),

  // Password reset attempts
  forgotPassword: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // limit each IP to 3 password reset attempts per hour
    message: {
      status: 'error',
      message: 'Too many password reset attempts, please try again later.',
    },
  }),

  // Password reset confirmation
  resetPassword: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 reset confirmations per 15 minutes
    message: {
      status: 'error',
      message: 'Too many password reset confirmations, please try again later.',
    },
  }),

  // Email verification resend
  resendVerification: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // limit each IP to 3 resend attempts per hour
    message: {
      status: 'error',
      message: 'Too many verification email requests, please try again later.',
    },
  }),

  // Token refresh
  refreshToken: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // limit each IP to 20 refresh attempts per 15 minutes
    message: {
      status: 'error',
      message: 'Too many token refresh attempts, please try again later.',
    },
  }),

  // Password change
  changePassword: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // limit each user to 5 password changes per hour
    message: {
      status: 'error',
      message: 'Too many password change attempts, please try again later.',
    },
  }),
};

/**
 * API rate limiters for different endpoints
 */
const apiRateLimiters = {
  // File upload rate limiter
  fileUpload: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // limit each user to 50 file uploads per hour
    message: {
      status: 'error',
      message: 'Too many file uploads, please try again later.',
    },
  }),

  // Email sending rate limiter
  sendEmail: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // limit each user to 10 emails per hour
    message: {
      status: 'error',
      message: 'Too many emails sent, please try again later.',
    },
  }),

  // Search rate limiter
  search: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // limit each user to 30 searches per minute
    message: {
      status: 'error',
      message: 'Too many search requests, please try again later.',
    },
  }),

  // Data export rate limiter
  export: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // limit each user to 5 exports per hour
    message: {
      status: 'error',
      message: 'Too many export requests, please try again later.',
    },
  }),
};

/**
 * Dynamic rate limiter based on user role
 */
const dynamicRateLimit = (req, res, next) => {
  const userRole = req.user?.role || 'guest';

  const limits = {
    admin: { windowMs: 15 * 60 * 1000, max: 2000 },
    moderator: { windowMs: 15 * 60 * 1000, max: 1000 },
    user: { windowMs: 15 * 60 * 1000, max: 500 },
    guest: { windowMs: 15 * 60 * 1000, max: 100 },
  };

  const limit = limits[userRole] || limits.guest;

  const rateLimiter = createRateLimiter({
    ...limit,
    keyGenerator: req => `${userRole}:${req.user?.id || req.ip}`,
    message: {
      status: 'error',
      message: `Rate limit exceeded for ${userRole} role.`,
    },
  });

  rateLimiter(req, res, next);
};

/**
 * Sliding window rate limiter
 */
const slidingWindowRateLimit = (options = {}) => {
  const { windowMs = 15 * 60 * 1000, max = 100, keyPrefix = 'sw' } = options;

  const requests = new Map();

  return (req, res, next) => {
    const key = req.user?.id || req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    if (requests.has(key)) {
      const userRequests = requests.get(key).filter(timestamp => timestamp > windowStart);
      requests.set(key, userRequests);
    } else {
      requests.set(key, []);
    }

    const userRequests = requests.get(key);

    if (userRequests.length >= max) {
      logWarning('Sliding window rate limit exceeded', {
        ip: req.ip,
        userId: req.user?.id,
        endpoint: req.originalUrl,
        requestCount: userRequests.length,
        limit: max,
      });

      return res.status(429).json({
        status: 'error',
        message: 'Too many requests, please try again later.',
        retryAfter: Math.ceil((userRequests[0] + windowMs - now) / 1000),
      });
    }

    // Add current request
    userRequests.push(now);
    requests.set(key, userRequests);

    next();
  };
};

/**
 * Progressive rate limiter - increases restrictions based on violations
 */
const progressiveRateLimit = (req, res, next) => {
  const key = req.user?.id || req.ip;
  const violations = req.session?.rateLimitViolations || 0;

  const baseLimit = 100;
  const reductionFactor = Math.max(0.1, 1 - violations * 0.2);
  const adjustedLimit = Math.floor(baseLimit * reductionFactor);

  const rateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: adjustedLimit,
    keyGenerator: () => `progressive:${key}`,
    handler: (req, res) => {
      if (req.session) {
        req.session.rateLimitViolations = (req.session.rateLimitViolations || 0) + 1;
      }

      logWarning('Progressive rate limit exceeded', {
        ip: req.ip,
        userId: req.user?.id,
        violations: req.session?.rateLimitViolations || 0,
        adjustedLimit,
      });

      res.status(429).json({
        status: 'error',
        message: `Rate limit exceeded. Limit adjusted due to previous violations: ${adjustedLimit} requests per 15 minutes.`,
      });
    },
  });

  rateLimiter(req, res, next);
};

/**
 * Whitelist/Blacklist rate limiter
 */
const createWhitelistRateLimit = (whitelist = [], blacklist = []) => {
  return (req, res, next) => {
    const ip = req.ip;
    const userId = req.user?.id;

    // Check blacklist first
    if (blacklist.includes(ip) || (userId && blacklist.includes(userId))) {
      return res.status(429).json({
        status: 'error',
        message: 'Access denied.',
      });
    }

    // Skip rate limiting for whitelisted IPs/users
    if (whitelist.includes(ip) || (userId && whitelist.includes(userId))) {
      return next();
    }

    // Apply normal rate limiting
    globalRateLimit(req, res, next);
  };
};

/**
 * Simple memory-based rate limiter for basic use cases
 */
const createMemoryRateLimit = (options = {}) => {
  const { windowMs = 15 * 60 * 1000, max = 100 } = options;

  const requests = new Map();

  return (req, res, next) => {
    const key = req.user?.id || req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries periodically
    if (Math.random() < 0.01) {
      // 1% chance to clean up
      for (const [k, timestamps] of requests.entries()) {
        const filtered = timestamps.filter(t => t > windowStart);
        if (filtered.length === 0) {
          requests.delete(k);
        } else {
          requests.set(k, filtered);
        }
      }
    }

    // Get or create user requests
    let userRequests = requests.get(key) || [];
    userRequests = userRequests.filter(timestamp => timestamp > windowStart);

    if (userRequests.length >= max) {
      const oldestRequest = Math.min(...userRequests);
      const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);

      return res.status(429).json({
        status: 'error',
        message: 'Too many requests, please try again later.',
        retryAfter,
      });
    }

    // Add current request
    userRequests.push(now);
    requests.set(key, userRequests);

    next();
  };
};

module.exports = {
  // Basic rate limiters
  globalRateLimit,
  strictRateLimit,

  // Authentication rate limiters
  rateLimiter: authRateLimiters,

  // API rate limiters
  apiRateLimiters,

  // Advanced rate limiters
  dynamicRateLimit,
  slidingWindowRateLimit,
  progressiveRateLimit,

  // Utility functions
  createRateLimiter,
  createWhitelistRateLimit,
  createMemoryRateLimit,
};
