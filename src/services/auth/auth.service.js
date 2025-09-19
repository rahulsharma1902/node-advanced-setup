const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { config } = require('../../config');
const { generateUUID, generateRandomString } = require('../../utils/helpers');
const { AuthenticationError } = require('../../middleware/errorHandler');
const { logError } = require('../../utils/logger');

// In-memory token storage (in production, use Redis or database)
const refreshTokens = new Map();
const passwordResetTokens = new Map();

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
const hashPassword = async password => {
  return await bcrypt.hash(password, config.security.bcryptRounds);
};

/**
 * Verify password against hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} - True if password matches
 */
const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generate JWT access token
 * @param {Object} payload - Token payload
 * @param {string} expiresIn - Token expiration
 * @returns {string} - JWT token
 */
const generateAccessToken = (payload, expiresIn = config.jwt.expiresIn) => {
  return jwt.sign(payload, config.jwt.secret, { expiresIn });
};

/**
 * Generate JWT refresh token
 * @param {Object} payload - Token payload
 * @param {string} expiresIn - Token expiration
 * @returns {string} - JWT refresh token
 */
const generateRefreshToken = (payload, expiresIn = config.jwt.refreshExpiresIn) => {
  return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn });
};

/**
 * Generate both access and refresh tokens
 * @param {Object} user - User object
 * @param {boolean} rememberMe - Extended expiration for refresh token
 * @returns {Object} - Object containing both tokens
 */
const generateTokens = async (user, rememberMe = false) => {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = generateAccessToken(payload);
  const refreshTokenExpiry = rememberMe ? '30d' : config.jwt.refreshExpiresIn;
  const refreshToken = generateRefreshToken({ id: user.id }, refreshTokenExpiry);

  // Store refresh token (in production, store in database)
  refreshTokens.set(refreshToken, {
    userId: user.id,
    createdAt: new Date(),
    expiresAt: new Date(
      Date.now() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000),
    ),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: config.jwt.expiresIn,
  };
};

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @param {string} secret - JWT secret
 * @returns {Object} - Decoded token payload
 */
const verifyToken = (token, secret = config.jwt.secret) => {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    throw new AuthenticationError('Invalid or expired token');
  }
};

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Object} - New tokens
 */
const refreshAccessToken = async refreshToken => {
  // Check if refresh token exists in storage
  const tokenData = refreshTokens.get(refreshToken);
  if (!tokenData) {
    throw new AuthenticationError('Invalid refresh token');
  }

  // Check if token is expired
  if (new Date() > tokenData.expiresAt) {
    refreshTokens.delete(refreshToken);
    throw new AuthenticationError('Refresh token expired');
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);

    // Generate new tokens (mock user data - in real app, fetch from database)
    const user = {
      id: decoded.id,
      email: 'user@example.com', // Fetch from database
      role: 'user', // Fetch from database
    };

    // Remove old refresh token
    refreshTokens.delete(refreshToken);

    // Generate new tokens
    return await generateTokens(user);
  } catch (error) {
    refreshTokens.delete(refreshToken);
    throw new AuthenticationError('Invalid refresh token');
  }
};

/**
 * Revoke refresh token
 * @param {string} refreshToken - Refresh token to revoke
 */
const revokeRefreshToken = async refreshToken => {
  refreshTokens.delete(refreshToken);
};

/**
 * Revoke all refresh tokens for a user
 * @param {string} userId - User ID
 */
const revokeAllUserTokens = async userId => {
  for (const [token, data] of refreshTokens.entries()) {
    if (data.userId === userId) {
      refreshTokens.delete(token);
    }
  }
};

/**
 * Generate password reset token
 * @param {string} userId - User ID
 * @returns {string} - Password reset token
 */
const generatePasswordResetToken = async userId => {
  const token = generateRandomString(32);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  passwordResetTokens.set(token, {
    userId,
    createdAt: new Date(),
    expiresAt,
  });

  return token;
};

/**
 * Verify password reset token
 * @param {string} token - Password reset token
 * @returns {string} - User ID
 */
const verifyPasswordResetToken = async token => {
  const tokenData = passwordResetTokens.get(token);
  if (!tokenData) {
    throw new AuthenticationError('Invalid or expired reset token');
  }

  if (new Date() > tokenData.expiresAt) {
    passwordResetTokens.delete(token);
    throw new AuthenticationError('Reset token expired');
  }

  // Remove token after use
  passwordResetTokens.delete(token);

  return tokenData.userId;
};

/**
 * Clean up expired tokens (should be run periodically)
 */
const cleanupExpiredTokens = () => {
  const now = new Date();

  // Clean up refresh tokens
  for (const [token, data] of refreshTokens.entries()) {
    if (now > data.expiresAt) {
      refreshTokens.delete(token);
    }
  }

  // Clean up password reset tokens
  for (const [token, data] of passwordResetTokens.entries()) {
    if (now > data.expiresAt) {
      passwordResetTokens.delete(token);
    }
  }
};

/**
 * Get token statistics (for monitoring)
 * @returns {Object} - Token statistics
 */
const getTokenStats = () => {
  return {
    activeRefreshTokens: refreshTokens.size,
    activePendingResets: passwordResetTokens.size,
  };
};

/**
 * Validate token strength and format
 * @param {string} token - Token to validate
 * @returns {boolean} - True if token is valid format
 */
const validateTokenFormat = token => {
  if (!token || typeof token !== 'string') {
    return false;
  }

  // JWT tokens have 3 parts separated by dots
  const parts = token.split('.');
  return parts.length === 3;
};

// Set up periodic cleanup (every hour)
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

module.exports = {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  generateTokens,
  verifyToken,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  cleanupExpiredTokens,
  getTokenStats,
  validateTokenFormat,
};
