const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const { config } = require('../config');

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint(),
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;

    if (stack) {
      log += `\n${stack}`;
    }

    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }

    return log;
  }),
);

// Create logs directory if it doesn't exist
const logsDir = path.resolve(config.logging.filePath);

// Transport configurations
const transports = [];

// Console transport (always enabled in development)
if (config.env === 'development') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: config.logging.level,
    }),
  );
}

// File transports for production
if (config.env === 'production' || config.env === 'test') {
  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      format: logFormat,
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      zippedArchive: true,
    }),
  );

  // Combined logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      format: logFormat,
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      zippedArchive: true,
      level: config.logging.level,
    }),
  );

  // Console transport for production (errors only)
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: 'error',
    }),
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  exitOnError: false,
});

// Create a stream object for Morgan HTTP logging
const loggerStream = {
  write: message => {
    logger.info(message.trim());
  },
};

// Helper functions for structured logging
const logError = (error, context = {}) => {
  logger.error({
    message: error.message,
    stack: error.stack,
    ...context,
  });
};

const logInfo = (message, context = {}) => {
  logger.info({
    message,
    ...context,
  });
};

const logWarn = (message, context = {}) => {
  logger.warn({
    message,
    ...context,
  });
};

const logDebug = (message, context = {}) => {
  logger.debug({
    message,
    ...context,
  });
};

// Performance logging helper
const logPerformance = (operation, startTime, context = {}) => {
  const duration = Date.now() - startTime;
  logger.info({
    message: `Performance: ${operation}`,
    duration: `${duration}ms`,
    ...context,
  });
};

// Database operation logging
const logDatabaseOperation = (operation, collection, duration, context = {}) => {
  logger.info({
    message: `Database: ${operation}`,
    collection,
    duration: duration ? `${duration}ms` : undefined,
    ...context,
  });
};

// API request logging
const logApiRequest = (method, url, statusCode, duration, userId) => {
  logger.info({
    message: 'API Request',
    method,
    url,
    statusCode,
    duration: `${duration}ms`,
    userId,
  });
};

module.exports = {
  logger,
  loggerStream,
  logError,
  logInfo,
  logWarn,
  logDebug,
  logPerformance,
  logDatabaseOperation,
  logApiRequest,
};
