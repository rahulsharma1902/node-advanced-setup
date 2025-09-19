const mongoose = require('mongoose');
const { config } = require('../config');
const { logInfo, logError, logDatabaseOperation } = require('../utils/logger');

// MongoDB connection options
const mongoOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

// Connect to MongoDB
const connectMongoDB = async () => {
  try {
    const startTime = Date.now();

    const uri =
      config.env === 'test' ? config.database.mongodb.testUri : config.database.mongodb.uri;

    await mongoose.connect(uri, mongoOptions);

    logDatabaseOperation('MongoDB Connected', 'connection', Date.now() - startTime, {
      database: mongoose.connection.name,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
    });

    // Connection event handlers
    mongoose.connection.on('connected', () => {
      logInfo('MongoDB connected successfully');
    });

    mongoose.connection.on('error', err => {
      logError(err, { context: 'MongoDB connection error' });
    });

    mongoose.connection.on('disconnected', () => {
      logInfo('MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logInfo('MongoDB connection closed through app termination');
      process.exit(0);
    });
  } catch (error) {
    // Don't exit process in development mode, just log the error
    if (config.env === 'development') {
      logError(error, { context: 'MongoDB connection failed - continuing without database' });
      throw error; // Re-throw to be handled by the caller
    } else {
      logError(error, { context: 'MongoDB connection failed' });
      process.exit(1);
    }
  }
};

// Disconnect from MongoDB
const disconnectMongoDB = async () => {
  try {
    await mongoose.connection.close();
    logInfo('MongoDB disconnected successfully');
  } catch (error) {
    logError(error, { context: 'MongoDB disconnection failed' });
  }
};

// Check MongoDB connection status
const isMongoDBConnected = () => {
  return mongoose.connection.readyState === 1;
};

// Get MongoDB connection info
const getMongoDBInfo = () => {
  return {
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    name: mongoose.connection.name,
  };
};

// MongoDB health check
const mongoHealthCheck = async () => {
  try {
    if (!isMongoDBConnected()) {
      return {
        status: 'unhealthy',
        details: {
          error: 'MongoDB not connected',
          connection: getMongoDBInfo(),
        },
      };
    }

    const adminDb = mongoose.connection.db.admin();
    const result = await adminDb.ping();

    return {
      status: 'healthy',
      details: {
        ping: result,
        connection: getMongoDBInfo(),
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        error: error.message,
        connection: getMongoDBInfo(),
      },
    };
  }
};

module.exports = {
  connectMongoDB,
  disconnectMongoDB,
  isMongoDBConnected,
  getMongoDBInfo,
  mongoHealthCheck,
  mongoose,
};
