const axios = require('axios');
const { logInfo, logError, logWarning } = require('./logger');
const { ExternalServiceError } = require('../middleware/errorHandler');

/**
 * Comprehensive HTTP Client Wrapper
 * Handles all possible 3rd party API integration scenarios
 */
class HttpClient {
  constructor(options = {}) {
    this.baseURL = options.baseURL || '';
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.serviceName = options.serviceName || 'External API';

    // Default headers
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Node-API-Client/1.0',
      ...options.headers,
    };

    // Authentication configuration
    this.auth = options.auth || {};

    // Create axios instance
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: this.defaultHeaders,
    });

    // Setup interceptors
    this.setupRequestInterceptor();
    this.setupResponseInterceptor();
  }

  /**
   * Setup request interceptor for authentication and logging
   */
  setupRequestInterceptor() {
    this.client.interceptors.request.use(
      async config => {
        // Add authentication
        await this.addAuthentication(config);

        // Log request
        logInfo('HTTP Request', {
          service: this.serviceName,
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
          headers: this.sanitizeHeaders(config.headers),
          hasData: !!config.data,
        });

        // Add request timestamp
        config.metadata = {
          startTime: Date.now(),
          requestId: this.generateRequestId(),
        };

        return config;
      },
      error => {
        logError(error, { context: 'Request interceptor error' });
        return Promise.reject(error);
      },
    );
  }

  /**
   * Setup response interceptor for logging and error handling
   */
  setupResponseInterceptor() {
    this.client.interceptors.response.use(
      response => {
        const duration = Date.now() - response.config.metadata.startTime;

        logInfo('HTTP Response Success', {
          service: this.serviceName,
          method: response.config.method?.toUpperCase(),
          url: response.config.url,
          status: response.status,
          duration: `${duration}ms`,
          requestId: response.config.metadata.requestId,
          responseSize: JSON.stringify(response.data).length,
        });

        return response;
      },
      async error => {
        const duration = error.config?.metadata ? Date.now() - error.config.metadata.startTime : 0;

        logError(error, {
          service: this.serviceName,
          method: error.config?.method?.toUpperCase(),
          url: error.config?.url,
          status: error.response?.status,
          duration: `${duration}ms`,
          requestId: error.config?.metadata?.requestId,
          responseData: error.response?.data,
        });

        // Handle specific error scenarios
        return this.handleError(error);
      },
    );
  }

  /**
   * Add authentication to request based on auth type
   */
  async addAuthentication(config) {
    if (!this.auth.type) return;

    switch (this.auth.type) {
      case 'bearer':
        config.headers.Authorization = `Bearer ${await this.getToken()}`;
        break;

      case 'basic':
        const credentials = Buffer.from(`${this.auth.username}:${this.auth.password}`).toString(
          'base64',
        );
        config.headers.Authorization = `Basic ${credentials}`;
        break;

      case 'apikey':
        if (this.auth.location === 'header') {
          config.headers[this.auth.key] = await this.getApiKey();
        } else if (this.auth.location === 'query') {
          config.params = { ...config.params, [this.auth.key]: await this.getApiKey() };
        }
        break;

      case 'oauth2':
        config.headers.Authorization = `Bearer ${await this.getOAuth2Token()}`;
        break;

      case 'custom':
        if (this.auth.customAuth) {
          await this.auth.customAuth(config);
        }
        break;
    }
  }

  /**
   * Get authentication token (can be overridden)
   */
  async getToken() {
    if (typeof this.auth.token === 'function') {
      return await this.auth.token();
    }
    return this.auth.token;
  }

  /**
   * Get API key (can be overridden)
   */
  async getApiKey() {
    if (typeof this.auth.apiKey === 'function') {
      return await this.auth.apiKey();
    }
    return this.auth.apiKey;
  }

  /**
   * Get OAuth2 token (can be overridden)
   */
  async getOAuth2Token() {
    if (typeof this.auth.oauth2Token === 'function') {
      return await this.auth.oauth2Token();
    }
    return this.auth.oauth2Token;
  }

  /**
   * Handle different types of errors
   */
  async handleError(error) {
    if (error.code === 'ECONNABORTED') {
      throw new ExternalServiceError(this.serviceName, 'Request timeout', {
        timeout: this.timeout,
        url: error.config?.url,
      });
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new ExternalServiceError(this.serviceName, 'Service unavailable', {
        code: error.code,
        url: error.config?.url,
      });
    }

    if (error.response) {
      const { status, data } = error.response;

      // Handle specific status codes
      switch (status) {
        case 401:
          // Try to refresh token if possible
          if (this.auth.refreshToken) {
            try {
              await this.refreshAuthToken();
              return this.client.request(error.config);
            } catch (refreshError) {
              throw new ExternalServiceError(this.serviceName, 'Authentication failed', {
                status,
                data,
                originalError: error.message,
              });
            }
          }
          break;

        case 429:
          // Rate limited - implement retry with backoff
          const retryAfter = error.response.headers['retry-after'] || this.retryDelay / 1000;
          logWarning('Rate limited, retrying after delay', {
            service: this.serviceName,
            retryAfter,
            url: error.config?.url,
          });

          await this.delay(retryAfter * 1000);
          return this.client.request(error.config);

        case 503:
          // Service unavailable - retry with exponential backoff
          if (error.config.retryCount < this.retries) {
            error.config.retryCount = (error.config.retryCount || 0) + 1;
            const delay = this.retryDelay * Math.pow(2, error.config.retryCount - 1);

            logWarning('Service unavailable, retrying', {
              service: this.serviceName,
              attempt: error.config.retryCount,
              delay,
              url: error.config?.url,
            });

            await this.delay(delay);
            return this.client.request(error.config);
          }
          break;
      }

      throw new ExternalServiceError(this.serviceName, `HTTP ${status} Error`, {
        status,
        data,
        url: error.config?.url,
      });
    }

    throw new ExternalServiceError(this.serviceName, error.message, {
      originalError: error.message,
      url: error.config?.url,
    });
  }

  /**
   * Refresh authentication token
   */
  async refreshAuthToken() {
    if (this.auth.refreshToken && typeof this.auth.refreshToken === 'function') {
      const newToken = await this.auth.refreshToken();
      this.auth.token = newToken;
      return newToken;
    }
    throw new Error('Token refresh not configured');
  }

  /**
   * Generic HTTP methods
   */
  async get(url, options = {}) {
    return this.request('GET', url, null, options);
  }

  async post(url, data = null, options = {}) {
    return this.request('POST', url, data, options);
  }

  async put(url, data = null, options = {}) {
    return this.request('PUT', url, data, options);
  }

  async patch(url, data = null, options = {}) {
    return this.request('PATCH', url, data, options);
  }

  async delete(url, options = {}) {
    return this.request('DELETE', url, null, options);
  }

  /**
   * Main request method with retry logic
   */
  async request(method, url, data = null, options = {}) {
    const config = {
      method,
      url,
      data,
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
    };

    let lastError;

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const response = await this.client.request(config);
        return response.data;
      } catch (error) {
        lastError = error;

        // Don't retry on certain errors
        if (this.shouldNotRetry(error)) {
          throw error;
        }

        if (attempt < this.retries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          logWarning('Request failed, retrying', {
            service: this.serviceName,
            attempt,
            delay,
            error: error.message,
            url,
          });

          await this.delay(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Check if error should not be retried
   */
  shouldNotRetry(error) {
    if (!error.response) return false;

    const status = error.response.status;

    // Don't retry client errors (4xx) except 429
    if (status >= 400 && status < 500 && status !== 429) {
      return true;
    }

    return false;
  }

  /**
   * Upload file with progress tracking
   */
  async uploadFile(url, file, options = {}) {
    const formData = new FormData();
    formData.append(options.fieldName || 'file', file);

    // Add additional fields
    if (options.fields) {
      Object.entries(options.fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const config = {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...options.headers,
      },
      onUploadProgress: options.onProgress,
      ...options,
    };

    return this.post(url, formData, config);
  }

  /**
   * Download file with progress tracking
   */
  async downloadFile(url, options = {}) {
    const config = {
      responseType: 'stream',
      onDownloadProgress: options.onProgress,
      ...options,
    };

    const response = await this.client.get(url, config);
    return response.data;
  }

  /**
   * Batch requests with concurrency control
   */
  async batchRequests(requests, options = {}) {
    const { concurrency = 5, failFast = false } = options;
    const results = [];

    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      const promises = batch.map(async (req, index) => {
        try {
          const result = await this.request(req.method, req.url, req.data, req.options);
          return { success: true, data: result, index: i + index };
        } catch (error) {
          if (failFast) throw error;
          return { success: false, error: error.message, index: i + index };
        }
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Set new authentication
   */
  setAuth(auth) {
    this.auth = { ...this.auth, ...auth };
  }

  /**
   * Update headers
   */
  setHeaders(headers) {
    this.defaultHeaders = { ...this.defaultHeaders, ...headers };
    this.client.defaults.headers = { ...this.client.defaults.headers, ...headers };
  }

  /**
   * Set base URL
   */
  setBaseURL(baseURL) {
    this.baseURL = baseURL;
    this.client.defaults.baseURL = baseURL;
  }

  /**
   * Utility methods
   */
  generateRequestId() {
    return Math.random().toString(36).substring(2, 15);
  }

  sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    const sensitiveKeys = ['authorization', 'x-api-key', 'cookie'];

    sensitiveKeys.forEach(key => {
      if (sanitized[key]) {
        sanitized[key] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check for the external service
   */
  async healthCheck(endpoint = '/health') {
    try {
      const response = await this.get(endpoint, { timeout: 5000 });
      return { healthy: true, response };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Get client statistics
   */
  getStats() {
    return {
      serviceName: this.serviceName,
      baseURL: this.baseURL,
      timeout: this.timeout,
      retries: this.retries,
      authType: this.auth.type,
    };
  }
}

/**
 * Factory function to create HTTP clients for different services
 */
const createHttpClient = (serviceName, config) => {
  return new HttpClient({
    serviceName,
    ...config,
  });
};

/**
 * Pre-configured clients for common services
 */
const createStripeClient = apiKey => {
  return createHttpClient('Stripe', {
    baseURL: 'https://api.stripe.com/v1',
    auth: {
      type: 'basic',
      username: apiKey,
      password: '',
    },
    headers: {
      'Stripe-Version': '2023-10-16',
    },
  });
};

const createSlackClient = token => {
  return createHttpClient('Slack', {
    baseURL: 'https://slack.com/api',
    auth: {
      type: 'bearer',
      token,
    },
  });
};

const createTwilioClient = (accountSid, authToken) => {
  return createHttpClient('Twilio', {
    baseURL: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`,
    auth: {
      type: 'basic',
      username: accountSid,
      password: authToken,
    },
  });
};

const createSendGridClient = apiKey => {
  return createHttpClient('SendGrid', {
    baseURL: 'https://api.sendgrid.com/v3',
    auth: {
      type: 'bearer',
      token: apiKey,
    },
  });
};

const createGoogleAPIClient = apiKey => {
  return createHttpClient('Google API', {
    baseURL: 'https://www.googleapis.com',
    auth: {
      type: 'apikey',
      location: 'query',
      key: 'key',
      apiKey,
    },
  });
};

module.exports = {
  HttpClient,
  createHttpClient,
  createStripeClient,
  createSlackClient,
  createTwilioClient,
  createSendGridClient,
  createGoogleAPIClient,
};
