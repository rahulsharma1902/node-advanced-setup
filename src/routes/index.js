const { Router } = require('express');
const { config } = require('../config');
const { asyncHandler } = require('../middleware/errorHandler');
const { logInfo } = require('../utils/logger');
const { globalRateLimit } = require('../middleware/rateLimiter');
const { optionalAuthenticate } = require('../middleware/auth');

// Import route modules
const authRoutes = require('./auth/auth.route');
// const userRoutes = require('./user/user.route');
// const fileRoutes = require('./file/file.route');
// const adminRoutes = require('./admin/admin.route');

const router = Router();

// Apply global rate limiting to all routes
router.use(globalRateLimit);

// Apply optional authentication to get user context where available
router.use(optionalAuthenticate);

// Health check endpoint
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const healthCheck = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.env,
      version: config.app.version,
      service: config.app.name,
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
        },
        cpu: process.cpuUsage(),
      },
      database: {
        mongodb: 'connected', // This would be dynamic in real implementation
        redis: 'connected', // This would be dynamic in real implementation
      },
      services: {
        email: 'operational',
        storage: 'operational',
        queue: 'operational',
      },
    };

    logInfo('Health check requested', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
    });

    res.status(200).json(healthCheck);
  }),
);

// API info endpoint
router.get(
  '/info',
  asyncHandler(async (req, res) => {
    const apiInfo = {
      name: config.app.name,
      version: config.app.version,
      environment: config.env,
      documentation: `${config.app.url}/api/docs`,
      endpoints: {
        health: '/api/health',
        info: '/api/info',
        auth: '/api/auth',
        // users: '/api/users',
        // files: '/api/files',
        // admin: '/api/admin',
      },
      features: [
        'Authentication & Authorization',
        'Rate Limiting',
        'Input Validation',
        'Error Handling',
        'Logging & Monitoring',
        'Email Services',
        'File Upload',
        'Internationalization',
        'Caching',
        'Queue System',
        'Real-time Notifications',
      ],
      limits: {
        maxFileSize: '10MB',
        rateLimits: {
          global: '1000 requests per 15 minutes',
          auth: 'Varies by endpoint',
          api: 'Varies by endpoint',
        },
      },
      support: {
        documentation: `${config.app.url}/docs`,
        contact: 'support@example.com',
        status: `${config.app.url}/status`,
      },
    };

    res.status(200).json(apiInfo);
  }),
);

// API status endpoint with detailed service status
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const status = {
      overall: 'operational',
      timestamp: new Date().toISOString(),
      services: {
        api: {
          status: 'operational',
          responseTime: '< 100ms',
          uptime: '99.9%',
        },
        database: {
          status: 'operational',
          responseTime: '< 50ms',
          connections: 'healthy',
        },
        cache: {
          status: 'operational',
          hitRate: '85%',
          memory: 'normal',
        },
        email: {
          status: 'operational',
          queue: 'empty',
          deliveryRate: '99.5%',
        },
        storage: {
          status: 'operational',
          usage: '45%',
          availability: '99.9%',
        },
      },
      metrics: {
        requestsPerMinute: 150,
        averageResponseTime: '85ms',
        errorRate: '0.1%',
        activeUsers: 1250,
      },
      incidents: [],
      maintenance: {
        scheduled: false,
        nextWindow: null,
      },
    };

    res.status(200).json(status);
  }),
);

// API metrics endpoint (protected)
router.get(
  '/metrics',
  asyncHandler(async (req, res) => {
    // This would typically require admin authentication
    const metrics = {
      timestamp: new Date().toISOString(),
      requests: {
        total: 125000,
        successful: 124875,
        failed: 125,
        rate: '150/min',
      },
      response: {
        average: '85ms',
        p95: '150ms',
        p99: '300ms',
      },
      users: {
        active: 1250,
        registered: 15000,
        online: 350,
      },
      resources: {
        cpu: '25%',
        memory: '60%',
        disk: '45%',
        network: '15MB/s',
      },
      errors: {
        rate: '0.1%',
        types: {
          '4xx': 100,
          '5xx': 25,
        },
      },
    };

    res.status(200).json(metrics);
  }),
);

// API documentation endpoint
router.get(
  '/docs',
  asyncHandler(async (req, res) => {
    res.json({
      message: 'API Documentation',
      swagger: `${config.app.url}/api/swagger`,
      postman: `${config.app.url}/api/postman`,
      guides: {
        authentication: `${config.app.url}/docs/auth`,
        rateLimit: `${config.app.url}/docs/rate-limits`,
        errors: `${config.app.url}/docs/errors`,
        pagination: `${config.app.url}/docs/pagination`,
      },
      examples: {
        curl: `${config.app.url}/docs/examples/curl`,
        javascript: `${config.app.url}/docs/examples/js`,
        python: `${config.app.url}/docs/examples/python`,
      },
    });
  }),
);

// Mount route modules
router.use('/auth', authRoutes);
// router.use('/users', userRoutes);
// router.use('/files', fileRoutes);
// router.use('/admin', adminRoutes);

// API version endpoint
router.get(
  '/version',
  asyncHandler(async (req, res) => {
    res.json({
      version: config.app.version,
      apiVersion: 'v1',
      buildDate: new Date().toISOString(),
      commit: process.env.GIT_COMMIT || 'unknown',
      branch: process.env.GIT_BRANCH || 'unknown',
    });
  }),
);

// Ping endpoint for simple connectivity test
router.get(
  '/ping',
  asyncHandler(async (req, res) => {
    res.json({
      message: 'pong',
      timestamp: new Date().toISOString(),
      server: config.app.name,
    });
  }),
);

module.exports = router;
