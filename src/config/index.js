const Joi = require('joi');
require('dotenv').config();

// Define configuration schema
const envVarsSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  APP_NAME: Joi.string().default('Node.js App'),
  APP_VERSION: Joi.string().default('1.0.0'),
  APP_URL: Joi.string().uri().default('http://localhost:3000'),

  // Database
  DB_TYPE: Joi.string().valid('mongodb', 'postgres', 'mysql').default('mongodb'),
  MONGODB_URI: Joi.string().default('mongodb://localhost:27017/app_db'),
  MONGODB_TEST_URI: Joi.string().default('mongodb://localhost:27017/app_test_db'),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().default(0),

  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

  // Email
  SMTP_HOST: Joi.string().default(''),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().default(''),
  SMTP_PASS: Joi.string().default(''),
  FROM_EMAIL: Joi.string().email().default('noreply@example.com'),
  FROM_NAME: Joi.string().default('App Name'),

  // File Upload
  UPLOAD_PATH: Joi.string().default('uploads'),
  MAX_FILE_SIZE: Joi.number().default(5242880), // 5MB
  ALLOWED_FILE_TYPES: Joi.string().default('jpg,jpeg,png,gif,pdf,doc,docx'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),

  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FILE_PATH: Joi.string().default('logs'),
  LOG_MAX_SIZE: Joi.string().default('20m'),
  LOG_MAX_FILES: Joi.string().default('14d'),

  // Security
  BCRYPT_ROUNDS: Joi.number().default(12),
  CORS_ORIGIN: Joi.string().default('*'),
  CORS_CREDENTIALS: Joi.boolean().default(true),

  // Debug
  DEBUG: Joi.string().default(''),
  SWAGGER_ENABLED: Joi.boolean().default(true),
}).unknown();

const { error, value: envVars } = envVarsSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  app: {
    name: envVars.APP_NAME,
    version: envVars.APP_VERSION,
    url: envVars.APP_URL,
  },
  database: {
    type: envVars.DB_TYPE,
    mongodb: {
      uri: envVars.MONGODB_URI,
      testUri: envVars.MONGODB_TEST_URI,
      options: {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      },
    },
    redis: {
      host: envVars.REDIS_HOST,
      port: envVars.REDIS_PORT,
      password: envVars.REDIS_PASSWORD || undefined,
      db: envVars.REDIS_DB,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    },
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
    refreshSecret: envVars.JWT_REFRESH_SECRET,
    refreshExpiresIn: envVars.JWT_REFRESH_EXPIRES_IN,
  },
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      secure: envVars.SMTP_SECURE,
      auth: {
        user: envVars.SMTP_USER,
        pass: envVars.SMTP_PASS,
      },
    },
    from: {
      email: envVars.FROM_EMAIL,
      name: envVars.FROM_NAME,
    },
  },
  upload: {
    path: envVars.UPLOAD_PATH,
    maxFileSize: envVars.MAX_FILE_SIZE,
    allowedTypes: envVars.ALLOWED_FILE_TYPES.split(',').map(type => type.trim()),
  },
  rateLimiting: {
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
  },
  logging: {
    level: envVars.LOG_LEVEL,
    filePath: envVars.LOG_FILE_PATH,
    maxSize: envVars.LOG_MAX_SIZE,
    maxFiles: envVars.LOG_MAX_FILES,
  },
  security: {
    bcryptRounds: envVars.BCRYPT_ROUNDS,
    cors: {
      origin:
        envVars.CORS_ORIGIN === '*'
          ? true
          : envVars.CORS_ORIGIN.split(',').map(origin => origin.trim()),
      credentials: envVars.CORS_CREDENTIALS,
    },
  },
  swagger: {
    enabled: envVars.SWAGGER_ENABLED,
  },
  debug: envVars.DEBUG,
  apiKeys: process.env.API_KEYS ? process.env.API_KEYS.split(',').map(key => key.trim()) : [],
};

module.exports = { config };
