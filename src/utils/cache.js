const Redis = require('ioredis');
const { logInfo, logError, logWarning } = require('./logger');
const { config } = require('../config');

/**
 * Redis Cache Utility
 * Provides caching functionality with Redis
 */
class CacheManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.retryAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 1000;
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    try {
      const redisConfig = {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        keyPrefix: config.redis.keyPrefix,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000,
      };

      this.client = new Redis(redisConfig);

      // Connection event handlers
      this.client.on('connect', () => {
        logInfo('Redis connected successfully');
        this.isConnected = true;
        this.retryAttempts = 0;
      });

      this.client.on('ready', () => {
        logInfo('Redis ready to accept commands');
      });

      this.client.on('error', error => {
        logError(error, { context: 'Redis connection error' });
        this.isConnected = false;
      });

      this.client.on('close', () => {
        logWarning('Redis connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnecting', delay => {
        logInfo('Redis reconnecting', { delay });
      });

      // Connect to Redis
      await this.client.connect();

      return this.client;
    } catch (error) {
      logError(error, { context: 'Failed to connect to Redis' });
      throw error;
    }
  }

  /**
   * Check if Redis is connected
   */
  isReady() {
    return this.client && this.isConnected;
  }

  /**
   * Get value from cache
   */
  async get(key, options = {}) {
    if (!this.isReady()) {
      logWarning('Redis not connected, skipping cache get', { key });
      return null;
    }

    try {
      const value = await this.client.get(key);

      if (value === null) {
        return null;
      }

      // Parse JSON if needed
      if (options.json !== false) {
        try {
          return JSON.parse(value);
        } catch (parseError) {
          logWarning('Failed to parse cached JSON', { key, value });
          return value;
        }
      }

      return value;
    } catch (error) {
      logError(error, { context: 'Cache get error', key });
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key, value, ttl = 3600, options = {}) {
    if (!this.isReady()) {
      logWarning('Redis not connected, skipping cache set', { key });
      return false;
    }

    try {
      let serializedValue = value;

      // Serialize to JSON if needed
      if (options.json !== false && typeof value === 'object') {
        serializedValue = JSON.stringify(value);
      }

      if (ttl > 0) {
        await this.client.setex(key, ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }

      return true;
    } catch (error) {
      logError(error, { context: 'Cache set error', key });
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async del(key) {
    if (!this.isReady()) {
      logWarning('Redis not connected, skipping cache delete', { key });
      return false;
    }

    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      logError(error, { context: 'Cache delete error', key });
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    if (!this.isReady()) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logError(error, { context: 'Cache exists error', key });
      return false;
    }
  }

  /**
   * Set expiration for key
   */
  async expire(key, ttl) {
    if (!this.isReady()) {
      return false;
    }

    try {
      const result = await this.client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      logError(error, { context: 'Cache expire error', key });
      return false;
    }
  }

  /**
   * Get multiple keys
   */
  async mget(keys, options = {}) {
    if (!this.isReady() || !keys.length) {
      return [];
    }

    try {
      const values = await this.client.mget(...keys);

      if (options.json !== false) {
        return values.map(value => {
          if (value === null) return null;
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        });
      }

      return values;
    } catch (error) {
      logError(error, { context: 'Cache mget error', keys });
      return [];
    }
  }

  /**
   * Set multiple keys
   */
  async mset(keyValuePairs, ttl = 3600, options = {}) {
    if (!this.isReady() || !keyValuePairs.length) {
      return false;
    }

    try {
      const pipeline = this.client.pipeline();

      for (let i = 0; i < keyValuePairs.length; i += 2) {
        const key = keyValuePairs[i];
        let value = keyValuePairs[i + 1];

        if (options.json !== false && typeof value === 'object') {
          value = JSON.stringify(value);
        }

        if (ttl > 0) {
          pipeline.setex(key, ttl, value);
        } else {
          pipeline.set(key, value);
        }
      }

      await pipeline.exec();
      return true;
    } catch (error) {
      logError(error, { context: 'Cache mset error' });
      return false;
    }
  }

  /**
   * Increment counter
   */
  async incr(key, amount = 1) {
    if (!this.isReady()) {
      return 0;
    }

    try {
      if (amount === 1) {
        return await this.client.incr(key);
      } else {
        return await this.client.incrby(key, amount);
      }
    } catch (error) {
      logError(error, { context: 'Cache incr error', key });
      return 0;
    }
  }

  /**
   * Decrement counter
   */
  async decr(key, amount = 1) {
    if (!this.isReady()) {
      return 0;
    }

    try {
      if (amount === 1) {
        return await this.client.decr(key);
      } else {
        return await this.client.decrby(key, amount);
      }
    } catch (error) {
      logError(error, { context: 'Cache decr error', key });
      return 0;
    }
  }

  /**
   * Get keys by pattern
   */
  async keys(pattern) {
    if (!this.isReady()) {
      return [];
    }

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logError(error, { context: 'Cache keys error', pattern });
      return [];
    }
  }

  /**
   * Clear all cache
   */
  async flush() {
    if (!this.isReady()) {
      return false;
    }

    try {
      await this.client.flushdb();
      return true;
    } catch (error) {
      logError(error, { context: 'Cache flush error' });
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.isReady()) {
      return null;
    }

    try {
      const info = await this.client.info('memory');
      const keyspace = await this.client.info('keyspace');

      return {
        connected: this.isConnected,
        memory: info,
        keyspace: keyspace,
        uptime: await this.client.lastsave(),
      };
    } catch (error) {
      logError(error, { context: 'Cache stats error' });
      return null;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect() {
    if (this.client) {
      try {
        await this.client.quit();
        logInfo('Redis connection closed gracefully');
      } catch (error) {
        logError(error, { context: 'Error closing Redis connection' });
      }
    }
  }
}

// Create cache instance
const cache = new CacheManager();

/**
 * Cache middleware for Express routes
 */
const cacheMiddleware = (ttl = 3600, keyGenerator = null) => {
  return async (req, res, next) => {
    if (!cache.isReady()) {
      return next();
    }

    try {
      // Generate cache key
      const cacheKey = keyGenerator ? keyGenerator(req) : `route:${req.method}:${req.originalUrl}`;

      // Try to get from cache
      const cachedData = await cache.get(cacheKey);

      if (cachedData) {
        logInfo('Cache hit', { key: cacheKey });
        return res.json(cachedData);
      }

      // Store original res.json
      const originalJson = res.json;

      // Override res.json to cache the response
      res.json = function (data) {
        // Cache successful responses only
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cache.set(cacheKey, data, ttl).catch(error => {
            logError(error, { context: 'Failed to cache response', key: cacheKey });
          });
        }

        // Call original json method
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logError(error, { context: 'Cache middleware error' });
      next();
    }
  };
};

/**
 * Cache decorator for functions
 */
const cacheFunction = (fn, ttl = 3600, keyPrefix = 'fn') => {
  return async (...args) => {
    const cacheKey = `${keyPrefix}:${JSON.stringify(args)}`;

    // Try to get from cache
    const cachedResult = await cache.get(cacheKey);
    if (cachedResult !== null) {
      return cachedResult;
    }

    // Execute function and cache result
    const result = await fn(...args);
    await cache.set(cacheKey, result, ttl);

    return result;
  };
};

/**
 * Session store for Express sessions
 */
class RedisSessionStore {
  constructor(options = {}) {
    this.prefix = options.prefix || 'sess:';
    this.ttl = options.ttl || 86400; // 24 hours
  }

  async get(sid) {
    const key = this.prefix + sid;
    const data = await cache.get(key);
    return data;
  }

  async set(sid, session) {
    const key = this.prefix + sid;
    await cache.set(key, session, this.ttl);
  }

  async destroy(sid) {
    const key = this.prefix + sid;
    await cache.del(key);
  }

  async touch(sid, session) {
    const key = this.prefix + sid;
    await cache.expire(key, this.ttl);
  }
}

module.exports = {
  cache,
  cacheMiddleware,
  cacheFunction,
  RedisSessionStore,
  CacheManager,
};
