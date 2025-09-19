// Mock email service to prevent initialization during tests
jest.mock('../src/services/email/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
  sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue({ success: true }),
  sendCustomEmail: jest.fn().mockResolvedValue({ success: true }),
  sendBulkEmails: jest.fn().mockResolvedValue([{ success: true }]),
  validateEmail: jest.fn().mockReturnValue(true),
  getEmailTemplate: jest.fn().mockReturnValue(null),
  addEmailTemplate: jest.fn(),
  testEmailConfiguration: jest.fn().mockResolvedValue(true),
  getEmailStats: jest.fn().mockReturnValue({
    isConfigured: true,
    transporterReady: true,
    availableTemplates: ['verification', 'passwordReset', 'welcome'],
  }),
}));

// Mock database connections
jest.mock('../src/database/mongodb', () => ({
  connectMongoDB: jest.fn().mockResolvedValue(true),
}));

// Mock user service for testing
jest.mock('../src/services/user/user.service', () => ({
  findUserByEmail: jest.fn(),
  findUserById: jest.fn(),
  createUser: jest.fn(),
  updateUserProfile: jest.fn(),
  updateUserPreferences: jest.fn(),
  sanitizeUser: jest.fn(user => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  })),
  incrementFailedLoginAttempts: jest.fn(),
  resetFailedLoginAttempts: jest.fn(),
  updateLastLogin: jest.fn(),
  findUserByEmailVerificationToken: jest.fn(),
  verifyUserEmail: jest.fn(),
  updateEmailVerificationToken: jest.fn(),
  updatePassword: jest.fn(),
}));

// Mock auth service for testing
jest.mock('../src/services/auth/auth.service', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashedPassword'),
  verifyPassword: jest.fn().mockResolvedValue(true),
  generateTokens: jest.fn().mockResolvedValue({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresIn: '7d',
  }),
  refreshAccessToken: jest.fn().mockResolvedValue({
    accessToken: 'new-mock-access-token',
    refreshToken: 'new-mock-refresh-token',
    expiresIn: '7d',
  }),
  revokeRefreshToken: jest.fn().mockResolvedValue(true),
  revokeAllUserTokens: jest.fn().mockResolvedValue(true),
  generatePasswordResetToken: jest.fn().mockResolvedValue('reset-token'),
  verifyPasswordResetToken: jest.fn().mockResolvedValue('user-id'),
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long-for-security';
process.env.JWT_REFRESH_SECRET =
  'test-jwt-refresh-secret-that-is-at-least-32-characters-long-for-security';
process.env.PORT = '3001';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.EMAIL_SMTP_HOST = '';
process.env.EMAIL_SMTP_PORT = '587';
process.env.EMAIL_SMTP_USER = '';
process.env.EMAIL_SMTP_PASS = '';

// Global test timeout
jest.setTimeout(10000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global error handler for tests
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Test setup completed successfully');
