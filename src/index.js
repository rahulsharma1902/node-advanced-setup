const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { config } = require('./config');
const { logger, loggerStream, logInfo, logError } = require('./utils/logger');
const {
  globalErrorHandler,
  handleNotFound,
  handleUncaughtException,
  handlePromiseRejection,
  gracefulShutdown,
} = require('./middleware/errorHandler');
const routes = require('./routes');
const { connectMongoDB } = require('./database/mongodb');

// Handle uncaught exceptions and unhandled rejections
handleUncaughtException();
handlePromiseRejection();

// Create Express application
const app = express();

// Trust proxy (for deployment behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// CORS configuration
app.use(
  cors({
    origin: config.security.cors.origin,
    credentials: config.security.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }),
);

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP request logging
app.use(morgan('combined', { stream: loggerStream }));

// API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: `Welcome to ${config.app.name}`,
    version: config.app.version,
    environment: config.env,
    documentation: `${config.app.url}/api/docs`,
    health: `${config.app.url}/api/health`,
  });
});

// 404 handler
app.use(handleNotFound);

// Global error handler
app.use(globalErrorHandler);

// Database connection (optional for development)
const initializeDatabase = async () => {
  try {
    if (config.database.type === 'mongodb') {
      await connectMongoDB();
    }
    // Add other database connections here
    // if (config.database.type === 'postgres') {
    //   await connectPostgreSQL();
    // }
  } catch (error) {
    logError(error, { context: 'Database initialization failed' });

    // In development, continue without database
    if (config.env === 'development') {
      logInfo('Continuing without database connection in development mode');
      return;
    }

    // In production, exit on database connection failure
    process.exit(1);
  }
};

// Start server
const startServer = async () => {
  try {
    // Initialize database (optional in development)
    await initializeDatabase();

    // Start HTTP server
    const server = app.listen(config.port, () => {
      logInfo('Server started successfully', {
        port: config.port,
        environment: config.env,
        name: config.app.name,
        version: config.app.version,
        url: config.app.url,
      });

      console.log(`
        🚀 Server is running!
        📍 URL: ${config.app.url}
        🌍 Environment: ${config.env}
        📊 Health Check: ${config.app.url}/api/health
        📚 API Info: ${config.app.url}/api/info
      `);
    });

    // Handle graceful shutdown
    gracefulShutdown(server);
  } catch (error) {
    logError(error, { context: 'Server startup failed' });
    process.exit(1);
  }
};

// Start the application
if (require.main === module) {
  startServer();
}

module.exports = app;
