const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { config } = require('../../config');
const authService = require('../../services/auth/auth.service');
const userService = require('../../services/user/user.service');
const emailService = require('../../services/email/email.service');
const {
  asyncHandler,
  ValidationError,
  AuthenticationError,
} = require('../../middleware/errorHandler');
const { sendResponse, sendSuccess, sendCreated, sendError } = require('../../utils/response');
const { logInfo, logError } = require('../../utils/logger');
const { generateUUID } = require('../../utils/helpers');

/**
 * Register a new user
 * @route POST /api/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const { email, password, name, role = 'user' } = req.body;

  // Check if user already exists
  const existingUser = await userService.findUserByEmail(email);
  if (existingUser) {
    throw new ValidationError('User already exists with this email');
  }

  // Hash password
  const hashedPassword = await authService.hashPassword(password);

  // Create user
  const userData = {
    id: generateUUID(),
    email,
    name,
    password: hashedPassword,
    role,
    isEmailVerified: false,
    emailVerificationToken: generateUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const user = await userService.createUser(userData);

  // Send verification email
  try {
    await emailService.sendVerificationEmail(user.email, user.emailVerificationToken);
  } catch (error) {
    logError(error, { context: 'Failed to send verification email' });
  }

  // Generate tokens
  const tokens = await authService.generateTokens(user);

  logInfo('User registered successfully', {
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  // Using your preferred style - no return needed
  sendCreated(
    res,
    {
      user: userService.sanitizeUser(user),
      tokens,
    },
    'User registered successfully. Please check your email for verification.',
  );
});

/**
 * Login user
 * @route POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password, rememberMe = false } = req.body;

  // Find user
  const user = await userService.findUserByEmail(email, true);
  if (!user) {
    throw new AuthenticationError('Invalid email or password');
  }

  // Check if account is locked
  if (user.isLocked) {
    throw new AuthenticationError('Account is temporarily locked. Please try again later.');
  }

  // Verify password
  const isPasswordValid = await authService.verifyPassword(password, user.password);
  if (!isPasswordValid) {
    // Increment failed login attempts
    await userService.incrementFailedLoginAttempts(user.id);
    throw new AuthenticationError('Invalid email or password');
  }

  // Reset failed login attempts on successful login
  await userService.resetFailedLoginAttempts(user.id);

  // Generate tokens
  const tokens = await authService.generateTokens(user, rememberMe);

  // Update last login
  await userService.updateLastLogin(user.id, req.ip, req.get('User-Agent'));

  logInfo('User logged in successfully', {
    userId: user.id,
    email: user.email,
    ip: req.ip,
  });

  // Using your preferred style - no return needed
  sendSuccess(
    res,
    {
      user: userService.sanitizeUser(user),
      tokens,
    },
    'Login successful',
  );
});

/**
 * Refresh access token
 * @route POST /api/auth/refresh
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AuthenticationError('Refresh token is required');
  }

  const tokens = await authService.refreshAccessToken(refreshToken);

  // Using your preferred style - no return needed
  sendSuccess(res, { tokens }, 'Token refreshed successfully');
});

/**
 * Logout user
 * @route POST /api/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    await authService.revokeRefreshToken(refreshToken);
  }

  logInfo('User logged out', { userId: req.user?.id });

  // Using your preferred style - no return needed
  sendSuccess(res, null, 'Logout successful');
});

/**
 * Logout from all devices
 * @route POST /api/auth/logout-all
 */
const logoutAll = asyncHandler(async (req, res) => {
  await authService.revokeAllUserTokens(req.user.id);

  logInfo('User logged out from all devices', { userId: req.user.id });

  // Using your preferred style - no return needed
  sendSuccess(res, null, 'Logged out from all devices successfully');
});

/**
 * Forgot password
 * @route POST /api/auth/forgot-password
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await userService.findUserByEmail(email);
  if (!user) {
    // Don't reveal if email exists or not
    sendSuccess(res, null, 'If the email exists, a password reset link has been sent.');
    return;
  }

  const resetToken = await authService.generatePasswordResetToken(user.id);

  try {
    await emailService.sendPasswordResetEmail(user.email, resetToken);
  } catch (error) {
    logError(error, { context: 'Failed to send password reset email' });
  }

  logInfo('Password reset requested', { userId: user.id, email: user.email });

  // Using your preferred style - no return needed
  sendSuccess(res, null, 'If the email exists, a password reset link has been sent.');
});

/**
 * Reset password
 * @route POST /api/auth/reset-password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  const userId = await authService.verifyPasswordResetToken(token);
  const hashedPassword = await authService.hashPassword(newPassword);

  await userService.updatePassword(userId, hashedPassword);
  await authService.revokeAllUserTokens(userId);

  logInfo('Password reset successfully', { userId });

  // Using your preferred style - no return needed
  sendSuccess(res, null, 'Password reset successfully. Please login with your new password.');
});

/**
 * Verify email
 * @route GET /api/auth/verify-email/:token
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const user = await userService.findUserByEmailVerificationToken(token);
  if (!user) {
    throw new ValidationError('Invalid or expired verification token');
  }

  await userService.verifyUserEmail(user.id);

  // Send welcome email
  try {
    await emailService.sendWelcomeEmail(user.email, user.name);
  } catch (error) {
    logError(error, { context: 'Failed to send welcome email' });
  }

  logInfo('Email verified successfully', { userId: user.id, email: user.email });

  // Using your preferred style - no return needed
  sendSuccess(res, null, 'Email verified successfully');
});

/**
 * Resend email verification
 * @route POST /api/auth/resend-verification
 */
const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await userService.findUserByEmail(email);
  if (!user) {
    throw new ValidationError('User not found');
  }

  if (user.isEmailVerified) {
    throw new ValidationError('Email is already verified');
  }

  const newToken = generateUUID();
  await userService.updateEmailVerificationToken(user.id, newToken);

  try {
    await emailService.sendVerificationEmail(user.email, newToken);
  } catch (error) {
    logError(error, { context: 'Failed to send verification email' });
  }

  // Using your preferred style - no return needed
  sendSuccess(res, null, 'Verification email sent successfully');
});

/**
 * Change password (authenticated user)
 * @route POST /api/auth/change-password
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  const user = await userService.findUserById(userId, true);

  // Verify current password
  const isCurrentPasswordValid = await authService.verifyPassword(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    throw new AuthenticationError('Current password is incorrect');
  }

  // Hash new password
  const hashedNewPassword = await authService.hashPassword(newPassword);

  // Update password
  await userService.updatePassword(userId, hashedNewPassword);

  // Revoke all tokens to force re-login
  await authService.revokeAllUserTokens(userId);

  // Send password changed notification
  try {
    await emailService.sendPasswordChangedEmail(user.email, user.name);
  } catch (error) {
    logError(error, { context: 'Failed to send password changed email' });
  }

  logInfo('Password changed successfully', { userId });

  // Using your preferred style - no return needed
  sendSuccess(res, null, 'Password changed successfully. Please login again.');
});

/**
 * Get current user profile
 * @route GET /api/auth/profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await userService.findUserById(req.user.id);

  if (!user) {
    throw new AuthenticationError('User not found');
  }

  // Using your preferred style - no return needed
  sendSuccess(
    res,
    {
      user: userService.sanitizeUser(user),
    },
    'Profile retrieved successfully',
  );
});

/**
 * Update user profile
 * @route PUT /api/auth/profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const updateData = req.body;

  const updatedUser = await userService.updateUserProfile(userId, updateData);

  logInfo('User profile updated successfully', { userId });

  // Using your preferred style - no return needed
  sendSuccess(
    res,
    {
      user: userService.sanitizeUser(updatedUser),
    },
    'Profile updated successfully',
  );
});

/**
 * Update user preferences
 * @route PUT /api/auth/preferences
 */
const updatePreferences = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const preferences = req.body;

  const updatedUser = await userService.updateUserPreferences(userId, preferences);

  logInfo('User preferences updated successfully', { userId });

  // Using your preferred style - no return needed
  sendSuccess(
    res,
    {
      user: userService.sanitizeUser(updatedUser),
    },
    'Preferences updated successfully',
  );
});

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  changePassword,
  getProfile,
  updateProfile,
  updatePreferences,
};
