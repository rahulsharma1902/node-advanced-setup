const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');
const { logInfo, logError, logWarning } = require('./logger');
const { config } = require('../config');
const { cache } = require('./cache');

/**
 * Advanced Monitoring Manager
 * Handles error tracking, performance monitoring, and observability
 */
class MonitoringManager {
  constructor() {
    this.isInitialized = false;
    this.metrics = {
      requests: 0,
      errors: 0,
      responseTime: [],
      memoryUsage: [],
      cpuUsage: [],
    };
    this.alerts = new Map();
    this.thresholds = {
      errorRate: 0.05, // 5% error rate
      responseTime: 2000, // 2 seconds
      memoryUsage: 0.8, // 80% memory usage
      cpuUsage: 0.8, // 80% CPU usage
    };
  }

  /**
   * Initialize monitoring system
   */
  initialize() {
    try {
      // Initialize Sentry
      if (config.sentry?.dsn) {
        this.initializeSentry();
      }

      // Start system metrics collection
      this.startMetricsCollection();

      // Setup error handlers
      this.setupErrorHandlers();

      // Setup performance monitoring
      this.setupPerformanceMonitoring();

      this.isInitialized = true;
      logInfo('Monitoring system initialized successfully');
    } catch (error) {
      logError(error, { context: 'Failed to initialize monitoring system' });
      throw error;
    }
  }

  /**
   * Initialize Sentry error tracking
   */
  initializeSentry() {
    try {
      Sentry.init({
        dsn: config.sentry.dsn,
        environment: config.app.env || 'development',
        release: config.app.version || '1.0.0',

        // Performance monitoring
        tracesSampleRate: config.sentry.tracesSampleRate || 0.1,

        // Profiling
        profilesSampleRate: config.sentry.profilesSampleRate || 0.1,

        integrations: [
          // Enable HTTP calls tracing
          new Sentry.Integrations.Http({ tracing: true }),

          // Enable Express.js middleware tracing
          new Sentry.Integrations.Express({ app: null }),

          // Enable profiling
          new ProfilingIntegration(),

          // Enable console integration
          new Sentry.Integrations.Console(),

          // Enable modules integration
          new Sentry.Integrations.Modules(),
        ],

        // Custom error filtering
        beforeSend(event, hint) {
          // Filter out certain errors
          if (event.exception) {
            const error = hint.originalException;

            // Skip validation errors
            if (error && error.name === 'ValidationError') {
              return null;
            }

            // Skip 404 errors
            if (error && error.status === 404) {
              return null;
            }
          }

          return event;
        },

        // Custom breadcrumb filtering
        beforeBreadcrumb(breadcrumb) {
          // Filter out noisy breadcrumbs
          if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') {
            return null;
          }

          return breadcrumb;
        },

        // Additional options
        attachStacktrace: true,
        sendDefaultPii: false,
        maxBreadcrumbs: 50,
        debug: config.app.env === 'development',
      });

      logInfo('Sentry initialized successfully', {
        environment: config.app.env,
        release: config.app.version,
      });
    } catch (error) {
      logError(error, { context: 'Failed to initialize Sentry' });
    }
  }

  /**
   * Setup error handlers
   */
  setupErrorHandlers() {
    // Uncaught exception handler
    process.on('uncaughtException', error => {
      logError(error, { context: 'Uncaught exception' });
      this.captureException(error, { level: 'fatal' });

      // Graceful shutdown
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });

    // Unhandled promise rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      logError(error, { context: 'Unhandled promise rejection', promise });
      this.captureException(error, { level: 'error' });
    });

    // Warning handler
    process.on('warning', warning => {
      logWarning(warning.message, {
        context: 'Process warning',
        name: warning.name,
        stack: warning.stack,
      });
      this.captureMessage(warning.message, 'warning');
    });
  }

  /**
   * Setup performance monitoring
   */
  setupPerformanceMonitoring() {
    // Monitor memory usage
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const memoryMetrics = {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        timestamp: Date.now(),
      };

      this.recordMemoryUsage(memoryMetrics);
      this.checkMemoryThreshold(memoryMetrics);
    }, 30000); // Every 30 seconds

    // Monitor CPU usage
    setInterval(() => {
      const cpuUsage = process.cpuUsage();
      const cpuMetrics = {
        user: cpuUsage.user,
        system: cpuUsage.system,
        timestamp: Date.now(),
      };

      this.recordCpuUsage(cpuMetrics);
    }, 30000); // Every 30 seconds

    // Monitor event loop lag
    setInterval(() => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
        this.recordEventLoopLag(lag);
      });
    }, 5000); // Every 5 seconds
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    // Reset metrics every hour
    setInterval(
      () => {
        this.resetMetrics();
      },
      60 * 60 * 1000,
    ); // 1 hour

    // Store metrics in cache every 5 minutes
    setInterval(
      () => {
        this.storeMetrics();
      },
      5 * 60 * 1000,
    ); // 5 minutes
  }

  /**
   * Express middleware for request monitoring
   */
  requestMonitoring() {
    return (req, res, next) => {
      const startTime = Date.now();

      // Add Sentry request handler
      if (this.isInitialized && config.sentry?.dsn) {
        Sentry.Handlers.requestHandler()(req, res, () => {});
      }

      // Set user context for Sentry
      if (req.user) {
        this.setUserContext({
          id: req.user._id || req.user.id,
          email: req.user.email,
          role: req.user.role,
        });
      }

      // Set request context
      this.setRequestContext({
        method: req.method,
        url: req.originalUrl,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        locale: req.locale,
      });

      // Monitor response
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;

        // Record metrics
        this.recordRequest(req, res, responseTime);

        // Check for errors
        if (res.statusCode >= 400) {
          this.recordError(req, res, responseTime);
        }

        // Check response time threshold
        this.checkResponseTimeThreshold(responseTime, req);
      });

      next();
    };
  }

  /**
   * Express error handler middleware
   */
  errorHandler() {
    return (error, req, res, next) => {
      // Capture error in Sentry
      this.captureException(error, {
        level: 'error',
        tags: {
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
        },
        extra: {
          body: req.body,
          query: req.query,
          params: req.params,
        },
      });

      // Record error metrics
      this.recordError(req, res, 0, error);

      next(error);
    };
  }

  /**
   * Capture exception
   */
  captureException(error, options = {}) {
    try {
      if (config.sentry?.dsn) {
        Sentry.captureException(error, options);
      }

      // Also log locally
      logError(error, { context: 'Exception captured', ...options });
    } catch (captureError) {
      logError(captureError, { context: 'Failed to capture exception' });
    }
  }

  /**
   * Capture message
   */
  captureMessage(message, level = 'info', options = {}) {
    try {
      if (config.sentry?.dsn) {
        Sentry.captureMessage(message, level, options);
      }

      // Also log locally
      logInfo(message, { context: 'Message captured', level, ...options });
    } catch (captureError) {
      logError(captureError, { context: 'Failed to capture message' });
    }
  }

  /**
   * Set user context
   */
  setUserContext(user) {
    try {
      if (config.sentry?.dsn) {
        Sentry.setUser(user);
      }
    } catch (error) {
      logError(error, { context: 'Failed to set user context' });
    }
  }

  /**
   * Set request context
   */
  setRequestContext(context) {
    try {
      if (config.sentry?.dsn) {
        Sentry.setContext('request', context);
      }
    } catch (error) {
      logError(error, { context: 'Failed to set request context' });
    }
  }

  /**
   * Add breadcrumb
   */
  addBreadcrumb(breadcrumb) {
    try {
      if (config.sentry?.dsn) {
        Sentry.addBreadcrumb(breadcrumb);
      }
    } catch (error) {
      logError(error, { context: 'Failed to add breadcrumb' });
    }
  }

  /**
   * Record request metrics
   */
  recordRequest(req, res, responseTime) {
    this.metrics.requests++;
    this.metrics.responseTime.push(responseTime);

    // Keep only last 1000 response times
    if (this.metrics.responseTime.length > 1000) {
      this.metrics.responseTime = this.metrics.responseTime.slice(-1000);
    }
  }

  /**
   * Record error metrics
   */
  recordError(req, res, responseTime, error = null) {
    this.metrics.errors++;

    // Check error rate threshold
    this.checkErrorRateThreshold();
  }

  /**
   * Record memory usage
   */
  recordMemoryUsage(memoryMetrics) {
    this.metrics.memoryUsage.push(memoryMetrics);

    // Keep only last 100 memory readings
    if (this.metrics.memoryUsage.length > 100) {
      this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-100);
    }
  }

  /**
   * Record CPU usage
   */
  recordCpuUsage(cpuMetrics) {
    this.metrics.cpuUsage.push(cpuMetrics);

    // Keep only last 100 CPU readings
    if (this.metrics.cpuUsage.length > 100) {
      this.metrics.cpuUsage = this.metrics.cpuUsage.slice(-100);
    }
  }

  /**
   * Record event loop lag
   */
  recordEventLoopLag(lag) {
    if (lag > 100) {
      // More than 100ms lag
      logWarning('High event loop lag detected', { lag });
      this.captureMessage(`High event loop lag: ${lag}ms`, 'warning');
    }
  }

  /**
   * Check error rate threshold
   */
  checkErrorRateThreshold() {
    if (this.metrics.requests === 0) return;

    const errorRate = this.metrics.errors / this.metrics.requests;

    if (errorRate > this.thresholds.errorRate) {
      const alertKey = 'high_error_rate';

      if (!this.alerts.has(alertKey)) {
        this.alerts.set(alertKey, Date.now());

        logError(new Error('High error rate detected'), {
          context: 'Threshold alert',
          errorRate,
          threshold: this.thresholds.errorRate,
          requests: this.metrics.requests,
          errors: this.metrics.errors,
        });

        this.captureMessage(`High error rate: ${(errorRate * 100).toFixed(2)}%`, 'error', {
          tags: { alert: 'high_error_rate' },
          extra: { errorRate, threshold: this.thresholds.errorRate },
        });
      }
    } else {
      this.alerts.delete('high_error_rate');
    }
  }

  /**
   * Check response time threshold
   */
  checkResponseTimeThreshold(responseTime, req) {
    if (responseTime > this.thresholds.responseTime) {
      logWarning('Slow response detected', {
        responseTime,
        threshold: this.thresholds.responseTime,
        method: req.method,
        url: req.originalUrl,
      });

      this.captureMessage(`Slow response: ${responseTime}ms`, 'warning', {
        tags: { alert: 'slow_response' },
        extra: {
          responseTime,
          threshold: this.thresholds.responseTime,
          method: req.method,
          url: req.originalUrl,
        },
      });
    }
  }

  /**
   * Check memory threshold
   */
  checkMemoryThreshold(memoryMetrics) {
    const totalMemory = require('os').totalmem();
    const memoryUsagePercent = memoryMetrics.rss / totalMemory;

    if (memoryUsagePercent > this.thresholds.memoryUsage) {
      const alertKey = 'high_memory_usage';

      if (!this.alerts.has(alertKey)) {
        this.alerts.set(alertKey, Date.now());

        logWarning('High memory usage detected', {
          memoryUsagePercent: (memoryUsagePercent * 100).toFixed(2) + '%',
          threshold: (this.thresholds.memoryUsage * 100).toFixed(2) + '%',
          rss: memoryMetrics.rss,
          heapUsed: memoryMetrics.heapUsed,
        });

        this.captureMessage(
          `High memory usage: ${(memoryUsagePercent * 100).toFixed(2)}%`,
          'warning',
          {
            tags: { alert: 'high_memory_usage' },
            extra: { memoryUsagePercent, threshold: this.thresholds.memoryUsage },
          },
        );
      }
    } else {
      this.alerts.delete('high_memory_usage');
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const avgResponseTime =
      this.metrics.responseTime.length > 0
        ? this.metrics.responseTime.reduce((a, b) => a + b, 0) / this.metrics.responseTime.length
        : 0;

    const errorRate = this.metrics.requests > 0 ? this.metrics.errors / this.metrics.requests : 0;

    const latestMemory =
      this.metrics.memoryUsage.length > 0
        ? this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1]
        : null;

    return {
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      errorRate: (errorRate * 100).toFixed(2) + '%',
      avgResponseTime: Math.round(avgResponseTime),
      memoryUsage: latestMemory,
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
    };
  }

  /**
   * Store metrics in cache
   */
  async storeMetrics() {
    try {
      const metrics = this.getMetrics();
      await cache.set('system_metrics', metrics, 300); // 5 minutes

      // Store historical data
      const timestamp = Date.now();
      const historicalKey = `metrics_history:${Math.floor(timestamp / (5 * 60 * 1000))}`;
      await cache.set(historicalKey, metrics, 86400); // 24 hours
    } catch (error) {
      logError(error, { context: 'Failed to store metrics' });
    }
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      requests: 0,
      errors: 0,
      responseTime: [],
      memoryUsage: [],
      cpuUsage: [],
    };

    logInfo('Metrics reset');
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const metrics = this.getMetrics();
      const memUsage = process.memoryUsage();
      const totalMemory = require('os').totalmem();
      const freeMemory = require('os').freemem();

      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          used: memUsage.heapUsed,
          total: memUsage.heapTotal,
          system: {
            total: totalMemory,
            free: freeMemory,
            used: totalMemory - freeMemory,
          },
        },
        cpu: process.cpuUsage(),
        metrics: metrics,
        alerts: Array.from(this.alerts.keys()),
      };

      // Determine health status
      if (this.alerts.size > 0) {
        health.status = 'degraded';
      }

      return health;
    } catch (error) {
      logError(error, { context: 'Health check failed' });
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  /**
   * Create custom transaction
   */
  startTransaction(name, operation) {
    try {
      if (config.sentry?.dsn) {
        return Sentry.startTransaction({ name, op: operation });
      }
      return null;
    } catch (error) {
      logError(error, { context: 'Failed to start transaction' });
      return null;
    }
  }

  /**
   * Finish transaction
   */
  finishTransaction(transaction) {
    try {
      if (transaction) {
        transaction.finish();
      }
    } catch (error) {
      logError(error, { context: 'Failed to finish transaction' });
    }
  }
}

// Create monitoring manager instance
const monitoringManager = new MonitoringManager();

module.exports = {
  monitoringManager,
  MonitoringManager,
};
