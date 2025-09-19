const { logInfo, logError } = require('./logger');

/**
 * Standard API response structure
 */
const RESPONSE_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
  FAIL: 'fail',
};

/**
 * HTTP status codes
 */
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * Main response function - no return needed
 * @param {Object} res - Express response object
 * @param {*} payload - Response data/payload
 * @param {string} message - Response message
 * @param {number} statusCode - HTTP status code
 * @param {Object} options - Additional options
 */
const sendResponse = (res, payload = null, message = 'Success', statusCode = 200, options = {}) => {
  const {
    status = statusCode >= 400 ? RESPONSE_STATUS.ERROR : RESPONSE_STATUS.SUCCESS,
    meta = null,
    pagination = null,
    code = null,
    errors = null,
    includeTimestamp = true,
  } = options;

  const response = {
    status,
    message,
    ...(includeTimestamp && { timestamp: new Date().toISOString() }),
    ...(payload !== null && { data: payload }),
    ...(meta && { meta }),
    ...(pagination && { pagination }),
    ...(code && { code }),
    ...(errors && { errors }),
  };

  // Log response for monitoring
  if (statusCode >= 400) {
    logError(new Error(message), {
      statusCode,
      code,
      hasPayload: payload !== null,
      hasErrors: !!errors,
    });
  } else {
    logInfo('Response sent successfully', {
      statusCode,
      message,
      hasPayload: payload !== null,
      hasMeta: !!meta,
      hasPagination: !!pagination,
    });
  }

  res.status(statusCode).json(response);
};

/**
 * Success response - no return needed
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {Object} options - Additional options
 */
const sendSuccess = (res, data = null, message = 'Success', options = {}) => {
  sendResponse(res, data, message, HTTP_STATUS.OK, {
    status: RESPONSE_STATUS.SUCCESS,
    ...options,
  });
};

/**
 * Created response - no return needed
 * @param {Object} res - Express response object
 * @param {*} data - Created resource data
 * @param {string} message - Success message
 * @param {Object} options - Additional options
 */
const sendCreated = (res, data = null, message = 'Resource created successfully', options = {}) => {
  sendResponse(res, data, message, HTTP_STATUS.CREATED, {
    status: RESPONSE_STATUS.SUCCESS,
    ...options,
  });
};

/**
 * Error response - no return needed
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Object} options - Additional options
 */
const sendError = (
  res,
  message = 'Internal server error',
  statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
  options = {},
) => {
  sendResponse(res, null, message, statusCode, {
    status: RESPONSE_STATUS.ERROR,
    ...options,
  });
};

/**
 * Validation error response - no return needed
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {Array|Object} errors - Validation errors
 * @param {Object} options - Additional options
 */
const sendValidationError = (res, message = 'Validation failed', errors = null, options = {}) => {
  sendResponse(res, null, message, HTTP_STATUS.UNPROCESSABLE_ENTITY, {
    status: RESPONSE_STATUS.ERROR,
    code: 'VALIDATION_ERROR',
    errors: Array.isArray(errors) ? errors : errors ? [errors] : null,
    ...options,
  });
};

/**
 * Not found response - no return needed
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {Object} options - Additional options
 */
const sendNotFound = (res, message = 'Resource not found', options = {}) => {
  sendResponse(res, null, message, HTTP_STATUS.NOT_FOUND, {
    status: RESPONSE_STATUS.ERROR,
    code: 'NOT_FOUND',
    ...options,
  });
};

/**
 * Unauthorized response - no return needed
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {Object} options - Additional options
 */
const sendUnauthorized = (res, message = 'Authentication required', options = {}) => {
  sendResponse(res, null, message, HTTP_STATUS.UNAUTHORIZED, {
    status: RESPONSE_STATUS.ERROR,
    code: 'UNAUTHORIZED',
    ...options,
  });
};

/**
 * Forbidden response - no return needed
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {Object} options - Additional options
 */
const sendForbidden = (res, message = 'Access forbidden', options = {}) => {
  sendResponse(res, null, message, HTTP_STATUS.FORBIDDEN, {
    status: RESPONSE_STATUS.ERROR,
    code: 'FORBIDDEN',
    ...options,
  });
};

/**
 * Conflict response - no return needed
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {Object} options - Additional options
 */
const sendConflict = (res, message = 'Resource conflict', options = {}) => {
  sendResponse(res, null, message, HTTP_STATUS.CONFLICT, {
    status: RESPONSE_STATUS.ERROR,
    code: 'CONFLICT',
    ...options,
  });
};

/**
 * Rate limit response - no return needed
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} retryAfter - Retry after seconds
 * @param {Object} options - Additional options
 */
const sendRateLimit = (res, message = 'Too many requests', retryAfter = 60, options = {}) => {
  res.set('Retry-After', retryAfter);
  sendResponse(res, null, message, HTTP_STATUS.TOO_MANY_REQUESTS, {
    status: RESPONSE_STATUS.ERROR,
    code: 'RATE_LIMIT_EXCEEDED',
    meta: { retryAfter },
    ...options,
  });
};

/**
 * Paginated response - no return needed
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {Object} pagination - Pagination info
 * @param {string} message - Success message
 * @param {Object} options - Additional options
 */
const sendPaginated = (
  res,
  data,
  pagination,
  message = 'Data retrieved successfully',
  options = {},
) => {
  sendResponse(res, data, message, HTTP_STATUS.OK, {
    status: RESPONSE_STATUS.SUCCESS,
    pagination,
    ...options,
  });
};

/**
 * No content response - no return needed
 * @param {Object} res - Express response object
 */
const sendNoContent = res => {
  res.status(HTTP_STATUS.NO_CONTENT).send();
};

/**
 * File download response - no return needed
 * @param {Object} res - Express response object
 * @param {string} filePath - File path
 * @param {string} fileName - File name for download
 * @param {Object} options - Additional options
 */
const sendFile = (res, filePath, fileName = null, options = {}) => {
  const downloadOptions = {
    ...options,
    ...(fileName && { filename: fileName }),
  };

  res.download(filePath, downloadOptions.filename, err => {
    if (err) {
      logError(err, { context: 'File download failed', filePath, fileName });
      sendError(res, 'File download failed', HTTP_STATUS.INTERNAL_SERVER_ERROR, {
        code: 'FILE_DOWNLOAD_ERROR',
      });
    }
  });
};

/**
 * Stream response - no return needed
 * @param {Object} res - Express response object
 * @param {Stream} stream - Readable stream
 * @param {string} contentType - Content type
 * @param {Object} headers - Additional headers
 */
const sendStream = (res, stream, contentType = 'application/octet-stream', headers = {}) => {
  res.set({
    'Content-Type': contentType,
    ...headers,
  });

  stream.pipe(res);

  stream.on('error', err => {
    logError(err, { context: 'Stream response failed' });
    if (!res.headersSent) {
      sendError(res, 'Stream error', HTTP_STATUS.INTERNAL_SERVER_ERROR, {
        code: 'STREAM_ERROR',
      });
    }
  });
};

/**
 * JSON response with custom structure - no return needed
 * @param {Object} res - Express response object
 * @param {Object} responseData - Complete response object
 * @param {number} statusCode - HTTP status code
 */
const sendCustom = (res, responseData, statusCode = HTTP_STATUS.OK) => {
  logInfo('Custom response sent', { statusCode, hasData: !!responseData });
  res.status(statusCode).json(responseData);
};

/**
 * Redirect response - no return needed
 * @param {Object} res - Express response object
 * @param {string} url - Redirect URL
 * @param {number} statusCode - HTTP status code (301, 302, etc.)
 */
const sendRedirect = (res, url, statusCode = 302) => {
  logInfo('Redirect response sent', { url, statusCode });
  res.redirect(statusCode, url);
};

/**
 * Health check response - no return needed
 * @param {Object} res - Express response object
 * @param {Object} healthData - Health check data
 * @param {boolean} isHealthy - Overall health status
 */
const sendHealthCheck = (res, healthData = {}, isHealthy = true) => {
  const statusCode = isHealthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
  const status = isHealthy ? 'healthy' : 'unhealthy';

  sendResponse(res, healthData, `System is ${status}`, statusCode, {
    status: isHealthy ? RESPONSE_STATUS.SUCCESS : RESPONSE_STATUS.ERROR,
    code: isHealthy ? 'HEALTHY' : 'UNHEALTHY',
  });
};

/**
 * API info response - no return needed
 * @param {Object} res - Express response object
 * @param {Object} apiInfo - API information
 */
const sendApiInfo = (res, apiInfo = {}) => {
  sendResponse(res, apiInfo, 'API information retrieved successfully', HTTP_STATUS.OK, {
    status: RESPONSE_STATUS.SUCCESS,
  });
};

/**
 * Batch response for multiple operations - no return needed
 * @param {Object} res - Express response object
 * @param {Array} results - Array of operation results
 * @param {string} message - Response message
 * @param {Object} options - Additional options
 */
const sendBatch = (res, results = [], message = 'Batch operation completed', options = {}) => {
  const successful = results.filter(r => r.success).length;
  const failed = results.length - successful;

  sendResponse(res, results, message, HTTP_STATUS.OK, {
    status: RESPONSE_STATUS.SUCCESS,
    meta: {
      total: results.length,
      successful,
      failed,
    },
    ...options,
  });
};

/**
 * Create response handler with consistent structure - no return needed
 * @param {Function} handler - Async handler function
 * @returns {Function} Express middleware
 */
const createResponseHandler = handler => {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  // Main response function (like your old project but enhanced)
  sendResponse,

  // Specific response functions (no return needed)
  sendSuccess,
  sendCreated,
  sendError,
  sendValidationError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  sendConflict,
  sendRateLimit,
  sendPaginated,
  sendNoContent,
  sendFile,
  sendStream,
  sendCustom,
  sendRedirect,
  sendHealthCheck,
  sendApiInfo,
  sendBatch,

  // Utility functions
  createResponseHandler,

  // Constants
  RESPONSE_STATUS,
  HTTP_STATUS,
};
