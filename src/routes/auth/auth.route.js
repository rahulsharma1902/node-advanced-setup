const express = require('express');
const authRouter = express.Router();
const authController = require('../../controllers/auth/auth.controller');
const authSchema = require('../../request-schemas/auth.schema');
const { authenticate, authorize } = require('../../middleware/auth');
const { rateLimiter } = require('../../middleware/rateLimiter');

// API endpoints
const API = {
  REGISTER: '/register',
  LOGIN: '/login',
  REFRESH_TOKEN: '/refresh',
  LOGOUT: '/logout',
  LOGOUT_ALL: '/logout-all',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  VERIFY_EMAIL: '/verify-email/:token',
  RESEND_VERIFICATION: '/resend-verification',
  CHANGE_PASSWORD: '/change-password',
  PROFILE: '/profile',
  PREFERENCES: '/preferences',
};

// Public routes (no authentication required)

// Register new user
authRouter.post(
  API.REGISTER,
  rateLimiter.register,
  authSchema.registerSchema,
  authController.register,
);

// Login user
authRouter.post(API.LOGIN, rateLimiter.login, authSchema.loginSchema, authController.login);

// Refresh access token
authRouter.post(
  API.REFRESH_TOKEN,
  rateLimiter.refreshToken,
  authSchema.refreshTokenSchema,
  authController.refreshToken,
);

// Forgot password
authRouter.post(
  API.FORGOT_PASSWORD,
  rateLimiter.forgotPassword,
  authSchema.forgotPasswordSchema,
  authController.forgotPassword,
);

// Reset password
authRouter.post(
  API.RESET_PASSWORD,
  rateLimiter.resetPassword,
  authSchema.resetPasswordSchema,
  authController.resetPassword,
);

// Verify email
authRouter.get(API.VERIFY_EMAIL, authSchema.verifyEmailSchema, authController.verifyEmail);

// Resend email verification
authRouter.post(
  API.RESEND_VERIFICATION,
  rateLimiter.resendVerification,
  authSchema.resendVerificationSchema,
  authController.resendVerification,
);

// Protected routes (authentication required)

// Logout user
authRouter.post(API.LOGOUT, authenticate, authSchema.logoutSchema, authController.logout);

// Logout from all devices
authRouter.post(API.LOGOUT_ALL, authenticate, authController.logoutAll);

// Change password
authRouter.post(
  API.CHANGE_PASSWORD,
  authenticate,
  rateLimiter.changePassword,
  authSchema.changePasswordSchema,
  authController.changePassword,
);

// Get current user profile
authRouter.get(API.PROFILE, authenticate, authController.getProfile);

// Update user profile
authRouter.put(
  API.PROFILE,
  authenticate,
  authSchema.updateProfileSchema,
  authController.updateProfile,
);

// Update user preferences
authRouter.put(
  API.PREFERENCES,
  authenticate,
  authSchema.updatePreferencesSchema,
  authController.updateProfile,
);

module.exports = authRouter;
