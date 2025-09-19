module.exports = async () => {
  // Global setup for tests
  console.log('Setting up test environment...');

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';
  process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
};
