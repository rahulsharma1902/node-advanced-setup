const { logInfo, logWarning, logError } = require('../utils/logger');
const { sendError, HTTP_STATUS } = require('../utils/response');

/**
 * Performance monitoring middleware
 * Tracks request timing, memory usage, and performance metrics
 */
const performanceMonitoring = (req, res, next) => {
  // Start timing
  req.startTime = Date.now();
  req.startHrTime = process.hrtime();

  // Memory usage at start
  const startMemory = process.memoryUsage();
  req.startMemory = startMemory;

  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function (...args) {
    // Calculate timing
    const endTime = Date.now();
    const endHrTime = process.hrtime(req.startHrTime);
    const responseTime = endTime - req.startTime;
    const preciseResponseTime = endHrTime[0] * 1000 + endHrTime[1] / 1000000;

    // Memory usage at end
    const endMemory = process.memoryUsage();
    const memoryDelta = {
      rss: endMemory.rss - startMemory.rss,
      heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      heapTotal: endMemory.heapTotal - startMemory.heapTotal,
      external: endMemory.external - startMemory.external,
    };

    // Add performance headers
    res.set({
      'X-Response-Time': `${responseTime}ms`,
      'X-Response-Time-Precise': `${preciseResponseTime.toFixed(3)}ms`,
      'X-Memory-Usage': `${Math.round(endMemory.heapUsed / 1024 / 1024)}MB`,
    });

    // Log performance metrics
    const performanceData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime,
      preciseResponseTime: parseFloat(preciseResponseTime.toFixed(3)),
      memoryDelta,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      contentLength: res.get('Content-Length') || 0,
    };

    // Log based on performance thresholds
    if (responseTime > 5000) {
      logError(new Error('Very slow response'), {
        ...performanceData,
        severity: 'critical',
        threshold: '5000ms',
      });
    } else if (responseTime > 2000) {
      logWarning('Slow response detected', {
        ...performanceData,
        severity: 'warning',
        threshold: '2000ms',
      });
    } else {
      logInfo('Request completed', performanceData);
    }

    // Call original end
    originalEnd.apply(this, args);
  };

  next();
};

/**
 * Request timeout middleware
 * @param {number} timeout - Timeout in milliseconds
 */
const requestTimeout = (timeout = 30000) => {
  return (req, res, next) => {
    // Set timeout
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        logError(new Error('Request timeout'), {
          method: req.method,
          url: req.originalUrl,
          timeout,
          ip: req.ip,
        });

        sendError(res, 'Request timeout', HTTP_STATUS.SERVICE_UNAVAILABLE, {
          code: 'REQUEST_TIMEOUT',
          details: { timeout },
        });
      }
    }, timeout);

    // Clear timeout when response is sent
    const originalEnd = res.end;
    res.end = function (...args) {
      clearTimeout(timeoutId);
      originalEnd.apply(this, args);
    };

    next();
  };
};

/**
 * Memory usage monitoring
 * Warns when memory usage is high
 */
const memoryMonitoring = (req, res, next) => {
  const memory = process.memoryUsage();
  const memoryUsageMB = Math.round(memory.heapUsed / 1024 / 1024);
  const memoryLimitMB = 512; // Configurable limit

  // Add memory info to request
  req.memoryUsage = {
    heapUsed: memoryUsageMB,
    heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
    rss: Math.round(memory.rss / 1024 / 1024),
    external: Math.round(memory.external / 1024 / 1024),
  };

  // Warn if memory usage is high
  if (memoryUsageMB > memoryLimitMB) {
    logWarning('High memory usage detected', {
      memoryUsage: req.memoryUsage,
      limit: memoryLimitMB,
      url: req.originalUrl,
    });

    // Add warning header
    res.set('X-Memory-Warning', `High memory usage: ${memoryUsageMB}MB`);
  }

  next();
};

/**
 * CPU usage monitoring
 * Tracks CPU usage for the request
 */
const cpuMonitoring = (req, res, next) => {
  const startUsage = process.cpuUsage();
  req.startCpuUsage = startUsage;

  // Override res.end to capture CPU usage
  const originalEnd = res.end;
  res.end = function (...args) {
    const endUsage = process.cpuUsage(startUsage);
    const cpuTime = (endUsage.user + endUsage.system) / 1000; // Convert to milliseconds

    // Add CPU time header
    res.set('X-CPU-Time', `${cpuTime.toFixed(3)}ms`);

    // Log high CPU usage
    if (cpuTime > 100) {
      logWarning('High CPU usage detected', {
        cpuTime,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
      });
    }

    originalEnd.apply(this, args);
  };

  next();
};

/**
 * Request size monitoring
 * Monitors and limits request payload size
 */
const requestSizeMonitoring = (req, res, next) => {
  const contentLength = parseInt(req.get('Content-Length') || '0');
  const maxSize = 10 * 1024 * 1024; // 10MB limit

  if (contentLength > maxSize) {
    logWarning('Large request detected', {
      contentLength,
      maxSize,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
    });

    return sendError(res, 'Request payload too large', HTTP_STATUS.BAD_REQUEST, {
      code: 'PAYLOAD_TOO_LARGE',
      details: {
        contentLength,
        maxSize,
      },
    });
  }

  // Add request size info
  req.requestSize = contentLength;
  res.set('X-Request-Size', `${contentLength} bytes`);

  next();
};

/**
 * Database query monitoring
 * Tracks database query performance
 */
const dbQueryMonitoring = (req, res, next) => {
  req.dbQueries = [];
  req.dbQueryCount = 0;
  req.dbQueryTime = 0;

  // Function to log database queries
  req.logDbQuery = (query, duration) => {
    req.dbQueries.push({ query, duration });
    req.dbQueryCount++;
    req.dbQueryTime += duration;
  };

  // Override res.end to add DB metrics
  const originalEnd = res.end;
  res.end = function (...args) {
    if (req.dbQueryCount > 0) {
      res.set({
        'X-DB-Query-Count': req.dbQueryCount.toString(),
        'X-DB-Query-Time': `${req.dbQueryTime.toFixed(3)}ms`,
      });

      // Log slow database operations
      if (req.dbQueryTime > 1000) {
        logWarning('Slow database queries detected', {
          queryCount: req.dbQueryCount,
          totalTime: req.dbQueryTime,
          queries: req.dbQueries,
          url: req.originalUrl,
        });
      }
    }

    originalEnd.apply(this, args);
  };

  next();
};

/**
 * Performance metrics collector
 * Collects and aggregates performance metrics
 */
class PerformanceMetrics {
  constructor() {
    this.metrics = {
      requests: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      slowRequests: 0,
      errors: 0,
      memoryPeaks: 0,
      cpuPeaks: 0,
    };
    this.requestTimes = [];
    this.maxRequestTimes = 1000; // Keep last 1000 request times
  }

  recordRequest(responseTime, statusCode, memoryUsage, cpuTime) {
    this.metrics.requests++;
    this.metrics.totalResponseTime += responseTime;
    this.metrics.averageResponseTime = this.metrics.totalResponseTime / this.metrics.requests;

    // Track request times for percentile calculations
    this.requestTimes.push(responseTime);
    if (this.requestTimes.length > this.maxRequestTimes) {
      this.requestTimes.shift();
    }

    // Count slow requests (>2s)
    if (responseTime > 2000) {
      this.metrics.slowRequests++;
    }

    // Count errors (4xx, 5xx)
    if (statusCode >= 400) {
      this.metrics.errors++;
    }

    // Track memory peaks (>256MB)
    if (memoryUsage > 256) {
      this.metrics.memoryPeaks++;
    }

    // Track CPU peaks (>50ms)
    if (cpuTime > 50) {
      this.metrics.cpuPeaks++;
    }
  }

  getMetrics() {
    const sortedTimes = [...this.requestTimes].sort((a, b) => a - b);
    const p50 = this.getPercentile(sortedTimes, 50);
    const p95 = this.getPercentile(sortedTimes, 95);
    const p99 = this.getPercentile(sortedTimes, 99);

    return {
      ...this.metrics,
      percentiles: { p50, p95, p99 },
      errorRate: (this.metrics.errors / this.metrics.requests) * 100,
      slowRequestRate: (this.metrics.slowRequests / this.metrics.requests) * 100,
    };
  }

  getPercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[index] || 0;
  }

  reset() {
    this.metrics = {
      requests: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      slowRequests: 0,
      errors: 0,
      memoryPeaks: 0,
      cpuPeaks: 0,
    };
    this.requestTimes = [];
  }
}

// Global metrics instance
const globalMetrics = new PerformanceMetrics();

/**
 * Metrics collection middleware
 */
const metricsCollection = (req, res, next) => {
  const originalEnd = res.end;
  res.end = function (...args) {
    const responseTime = Date.now() - req.startTime;
    const memoryUsage = req.memoryUsage?.heapUsed || 0;
    const cpuTime = 0; // Would need to be calculated from CPU monitoring

    globalMetrics.recordRequest(responseTime, res.statusCode, memoryUsage, cpuTime);
    originalEnd.apply(this, args);
  };

  next();
};

/**
 * Get performance metrics endpoint handler
 */
const getPerformanceMetrics = (req, res) => {
  const metrics = globalMetrics.getMetrics();
  const systemMetrics = {
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    cpuUsage: process.cpuUsage(),
  };

  res.json({
    status: 'success',
    data: {
      application: metrics,
      system: systemMetrics,
      timestamp: new Date().toISOString(),
    },
  });
};

module.exports = {
  performanceMonitoring,
  requestTimeout,
  memoryMonitoring,
  cpuMonitoring,
  requestSizeMonitoring,
  dbQueryMonitoring,
  metricsCollection,
  getPerformanceMetrics,
  PerformanceMetrics,
  globalMetrics,
};
