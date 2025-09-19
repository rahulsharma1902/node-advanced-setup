const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { logInfo, logError, logWarning } = require('./logger');
const { cache } = require('./cache');
const { config } = require('../config');
const { addEmailJob, addNotificationJob } = require('./queue');
const { i18nManager } = require('./i18n');

/**
 * Two-Factor Authentication Manager
 * Handles TOTP, SMS, and Email-based 2FA
 */
class TwoFactorManager {
  constructor() {
    this.issuer = config.app?.name || 'Reusable Node App';
    this.window = 2; // Allow 2 time steps before/after current time
    this.step = 30; // 30 seconds per time step
    this.digits = 6; // 6-digit codes
    this.algorithm = 'sha1';
  }

  /**
   * Generate TOTP secret for user
   */
  generateTOTPSecret(userEmail, userId) {
    try {
      const secret = speakeasy.generateSecret({
        name: userEmail,
        issuer: this.issuer,
        length: 32,
      });

      logInfo('TOTP secret generated', { userId, email: userEmail });

      return {
        secret: secret.base32,
        otpauthUrl: secret.otpauth_url,
        qrCodeUrl: null, // Will be generated separately
      };
    } catch (error) {
      logError(error, { context: 'Failed to generate TOTP secret', userId });
      throw error;
    }
  }

  /**
   * Generate QR code for TOTP setup
   */
  async generateQRCode(otpauthUrl) {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        width: 256,
      });

      return qrCodeDataUrl;
    } catch (error) {
      logError(error, { context: 'Failed to generate QR code' });
      throw error;
    }
  }

  /**
   * Verify TOTP token
   */
  verifyTOTP(token, secret) {
    try {
      const verified = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token,
        window: this.window,
        step: this.step,
        digits: this.digits,
        algorithm: this.algorithm,
      });

      return verified;
    } catch (error) {
      logError(error, { context: 'Failed to verify TOTP token' });
      return false;
    }
  }

  /**
   * Generate backup codes
   */
  generateBackupCodes(count = 10) {
    try {
      const codes = [];

      for (let i = 0; i < count; i++) {
        // Generate 8-character alphanumeric code
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        codes.push(code);
      }

      logInfo('Backup codes generated', { count });
      return codes;
    } catch (error) {
      logError(error, { context: 'Failed to generate backup codes' });
      throw error;
    }
  }

  /**
   * Hash backup codes for storage
   */
  hashBackupCodes(codes) {
    try {
      return codes.map(code => {
        const hash = crypto.createHash('sha256').update(code).digest('hex');
        return {
          hash,
          used: false,
          createdAt: new Date(),
        };
      });
    } catch (error) {
      logError(error, { context: 'Failed to hash backup codes' });
      throw error;
    }
  }

  /**
   * Verify backup code
   */
  verifyBackupCode(code, hashedCodes) {
    try {
      const codeHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');

      const backupCode = hashedCodes.find(bc => bc.hash === codeHash && !bc.used);

      if (backupCode) {
        backupCode.used = true;
        backupCode.usedAt = new Date();
        return true;
      }

      return false;
    } catch (error) {
      logError(error, { context: 'Failed to verify backup code' });
      return false;
    }
  }

  /**
   * Generate SMS OTP
   */
  async generateSMSOTP(userId, phoneNumber, language = 'en') {
    try {
      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Store OTP in cache with 5-minute expiry
      const cacheKey = `sms_otp:${userId}`;
      await cache.set(
        cacheKey,
        {
          otp,
          phoneNumber,
          attempts: 0,
          createdAt: new Date().toISOString(),
        },
        300,
      ); // 5 minutes

      // Send SMS
      const message = i18nManager.translate('auth.sms_otp_message', { otp }, language);
      await addNotificationJob('sms', {
        to: phoneNumber,
        message: `${message} - ${this.issuer}`,
      });

      logInfo('SMS OTP generated and sent', {
        userId,
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
      });

      return {
        success: true,
        expiresIn: 300,
        message: i18nManager.translate(
          'auth.sms_otp_sent',
          { phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*') },
          language,
        ),
      };
    } catch (error) {
      logError(error, { context: 'Failed to generate SMS OTP', userId });
      throw error;
    }
  }

  /**
   * Verify SMS OTP
   */
  async verifySMSOTP(userId, otp) {
    try {
      const cacheKey = `sms_otp:${userId}`;
      const otpData = await cache.get(cacheKey);

      if (!otpData) {
        return { success: false, error: 'OTP expired or not found' };
      }

      // Check attempts
      if (otpData.attempts >= 3) {
        await cache.del(cacheKey);
        return { success: false, error: 'Too many failed attempts' };
      }

      // Verify OTP
      if (otpData.otp === otp) {
        await cache.del(cacheKey);
        logInfo('SMS OTP verified successfully', { userId });
        return { success: true };
      } else {
        // Increment attempts
        otpData.attempts++;
        await cache.set(cacheKey, otpData, 300);

        logWarning('Invalid SMS OTP attempt', { userId, attempts: otpData.attempts });
        return {
          success: false,
          error: 'Invalid OTP',
          attemptsRemaining: 3 - otpData.attempts,
        };
      }
    } catch (error) {
      logError(error, { context: 'Failed to verify SMS OTP', userId });
      return { success: false, error: 'Verification failed' };
    }
  }

  /**
   * Generate Email OTP
   */
  async generateEmailOTP(userId, email, language = 'en') {
    try {
      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Store OTP in cache with 10-minute expiry
      const cacheKey = `email_otp:${userId}`;
      await cache.set(
        cacheKey,
        {
          otp,
          email,
          attempts: 0,
          createdAt: new Date().toISOString(),
        },
        600,
      ); // 10 minutes

      // Send email
      await addEmailJob({
        to: email,
        template: 'two-factor-otp',
        variables: {
          otp,
          appName: this.issuer,
          expiresIn: '10 minutes',
          language,
        },
      });

      logInfo('Email OTP generated and sent', { userId, email });

      return {
        success: true,
        expiresIn: 600,
        message: i18nManager.translate('auth.email_otp_sent', { email }, language),
      };
    } catch (error) {
      logError(error, { context: 'Failed to generate Email OTP', userId });
      throw error;
    }
  }

  /**
   * Verify Email OTP
   */
  async verifyEmailOTP(userId, otp) {
    try {
      const cacheKey = `email_otp:${userId}`;
      const otpData = await cache.get(cacheKey);

      if (!otpData) {
        return { success: false, error: 'OTP expired or not found' };
      }

      // Check attempts
      if (otpData.attempts >= 5) {
        await cache.del(cacheKey);
        return { success: false, error: 'Too many failed attempts' };
      }

      // Verify OTP
      if (otpData.otp === otp) {
        await cache.del(cacheKey);
        logInfo('Email OTP verified successfully', { userId });
        return { success: true };
      } else {
        // Increment attempts
        otpData.attempts++;
        await cache.set(cacheKey, otpData, 600);

        logWarning('Invalid Email OTP attempt', { userId, attempts: otpData.attempts });
        return {
          success: false,
          error: 'Invalid OTP',
          attemptsRemaining: 5 - otpData.attempts,
        };
      }
    } catch (error) {
      logError(error, { context: 'Failed to verify Email OTP', userId });
      return { success: false, error: 'Verification failed' };
    }
  }

  /**
   * Setup 2FA for user
   */
  async setup2FA(userId, userEmail, method = 'totp') {
    try {
      const setup = {};

      switch (method) {
        case 'totp':
          const totpData = this.generateTOTPSecret(userEmail, userId);
          const qrCode = await this.generateQRCode(totpData.otpauthUrl);

          setup.secret = totpData.secret;
          setup.qrCode = qrCode;
          setup.backupCodes = this.generateBackupCodes();
          setup.method = 'totp';
          break;

        case 'sms':
          setup.method = 'sms';
          setup.message = 'SMS 2FA setup - phone number verification required';
          break;

        case 'email':
          setup.method = 'email';
          setup.message = 'Email 2FA setup - email verification required';
          break;

        default:
          throw new Error('Invalid 2FA method');
      }

      // Store temporary setup data
      const setupKey = `2fa_setup:${userId}`;
      await cache.set(setupKey, setup, 1800); // 30 minutes

      logInfo('2FA setup initiated', { userId, method });
      return setup;
    } catch (error) {
      logError(error, { context: 'Failed to setup 2FA', userId, method });
      throw error;
    }
  }

  /**
   * Complete 2FA setup
   */
  async complete2FASetup(userId, verificationCode, method = 'totp') {
    try {
      const setupKey = `2fa_setup:${userId}`;
      const setupData = await cache.get(setupKey);

      if (!setupData) {
        return { success: false, error: 'Setup session expired' };
      }

      let verified = false;

      switch (method) {
        case 'totp':
          verified = this.verifyTOTP(verificationCode, setupData.secret);
          break;

        case 'sms':
          const smsResult = await this.verifySMSOTP(userId, verificationCode);
          verified = smsResult.success;
          break;

        case 'email':
          const emailResult = await this.verifyEmailOTP(userId, verificationCode);
          verified = emailResult.success;
          break;
      }

      if (verified) {
        // Clear setup cache
        await cache.del(setupKey);

        logInfo('2FA setup completed successfully', { userId, method });
        return {
          success: true,
          method,
          backupCodes: setupData.backupCodes || null,
          message: '2FA enabled successfully',
        };
      } else {
        return { success: false, error: 'Invalid verification code' };
      }
    } catch (error) {
      logError(error, { context: 'Failed to complete 2FA setup', userId });
      return { success: false, error: 'Setup completion failed' };
    }
  }

  /**
   * Verify 2FA during login
   */
  async verify2FA(userId, code, method, secret = null, backupCodes = null) {
    try {
      let verified = false;
      let usedBackupCode = false;

      switch (method) {
        case 'totp':
          if (!secret) {
            return { success: false, error: 'TOTP secret not provided' };
          }

          // Try TOTP first
          verified = this.verifyTOTP(code, secret);

          // If TOTP fails, try backup codes
          if (!verified && backupCodes && backupCodes.length > 0) {
            verified = this.verifyBackupCode(code, backupCodes);
            usedBackupCode = verified;
          }
          break;

        case 'sms':
          const smsResult = await this.verifySMSOTP(userId, code);
          verified = smsResult.success;
          break;

        case 'email':
          const emailResult = await this.verifyEmailOTP(userId, code);
          verified = emailResult.success;
          break;
      }

      if (verified) {
        logInfo('2FA verification successful', { userId, method, usedBackupCode });
        return {
          success: true,
          usedBackupCode,
          message: '2FA verification successful',
        };
      } else {
        logWarning('2FA verification failed', { userId, method });
        return { success: false, error: 'Invalid 2FA code' };
      }
    } catch (error) {
      logError(error, { context: '2FA verification error', userId, method });
      return { success: false, error: 'Verification failed' };
    }
  }

  /**
   * Disable 2FA for user
   */
  async disable2FA(userId, verificationCode, method, secret = null) {
    try {
      // Verify current 2FA before disabling
      const verification = await this.verify2FA(userId, verificationCode, method, secret);

      if (!verification.success) {
        return { success: false, error: 'Invalid verification code' };
      }

      logInfo('2FA disabled', { userId, method });
      return {
        success: true,
        message: '2FA disabled successfully',
      };
    } catch (error) {
      logError(error, { context: 'Failed to disable 2FA', userId });
      return { success: false, error: 'Failed to disable 2FA' };
    }
  }

  /**
   * Generate new backup codes
   */
  async regenerateBackupCodes(userId, verificationCode, method, secret = null) {
    try {
      // Verify current 2FA before regenerating codes
      const verification = await this.verify2FA(userId, verificationCode, method, secret);

      if (!verification.success) {
        return { success: false, error: 'Invalid verification code' };
      }

      const newCodes = this.generateBackupCodes();
      const hashedCodes = this.hashBackupCodes(newCodes);

      logInfo('Backup codes regenerated', { userId });
      return {
        success: true,
        backupCodes: newCodes,
        hashedCodes: hashedCodes,
        message: 'New backup codes generated',
      };
    } catch (error) {
      logError(error, { context: 'Failed to regenerate backup codes', userId });
      return { success: false, error: 'Failed to generate new codes' };
    }
  }

  /**
   * Check if 2FA is required for user
   */
  async is2FARequired(userId, userAgent, ipAddress) {
    try {
      // Check if this is a trusted device
      const deviceKey = `trusted_device:${userId}:${this.hashDevice(userAgent, ipAddress)}`;
      const isTrusted = await cache.get(deviceKey);

      if (isTrusted) {
        logInfo('2FA skipped for trusted device', { userId });
        return false;
      }

      return true;
    } catch (error) {
      logError(error, { context: 'Failed to check 2FA requirement', userId });
      return true; // Default to requiring 2FA on error
    }
  }

  /**
   * Mark device as trusted
   */
  async trustDevice(userId, userAgent, ipAddress, trustDuration = 30 * 24 * 60 * 60) {
    try {
      const deviceKey = `trusted_device:${userId}:${this.hashDevice(userAgent, ipAddress)}`;
      await cache.set(
        deviceKey,
        {
          trustedAt: new Date().toISOString(),
          userAgent,
          ipAddress: this.hashIP(ipAddress),
        },
        trustDuration,
      );

      logInfo('Device marked as trusted', { userId, trustDuration });
      return true;
    } catch (error) {
      logError(error, { context: 'Failed to trust device', userId });
      return false;
    }
  }

  /**
   * Remove trusted device
   */
  async removeTrustedDevice(userId, userAgent, ipAddress) {
    try {
      const deviceKey = `trusted_device:${userId}:${this.hashDevice(userAgent, ipAddress)}`;
      await cache.del(deviceKey);

      logInfo('Trusted device removed', { userId });
      return true;
    } catch (error) {
      logError(error, { context: 'Failed to remove trusted device', userId });
      return false;
    }
  }

  /**
   * Get 2FA statistics
   */
  async get2FAStats() {
    try {
      // This would typically come from database
      // For now, return mock stats
      return {
        totalUsers: 0,
        totpEnabled: 0,
        smsEnabled: 0,
        emailEnabled: 0,
        backupCodesUsed: 0,
        trustedDevices: 0,
      };
    } catch (error) {
      logError(error, { context: 'Failed to get 2FA stats' });
      return null;
    }
  }

  /**
   * Helper methods
   */
  hashDevice(userAgent, ipAddress) {
    return crypto.createHash('sha256').update(`${userAgent}:${ipAddress}`).digest('hex');
  }

  hashIP(ipAddress) {
    return crypto.createHash('sha256').update(ipAddress).digest('hex');
  }

  /**
   * Rate limiting for 2FA attempts
   */
  async checkRateLimit(userId, method) {
    try {
      const rateLimitKey = `2fa_rate_limit:${method}:${userId}`;
      const attempts = (await cache.get(rateLimitKey)) || 0;

      const maxAttempts = method === 'totp' ? 5 : 3;
      const windowTime = 15 * 60; // 15 minutes

      if (attempts >= maxAttempts) {
        return {
          allowed: false,
          resetTime: windowTime,
          attemptsRemaining: 0,
        };
      }

      return {
        allowed: true,
        attemptsRemaining: maxAttempts - attempts,
      };
    } catch (error) {
      logError(error, { context: 'Failed to check 2FA rate limit', userId, method });
      return { allowed: true, attemptsRemaining: 1 };
    }
  }

  /**
   * Record 2FA attempt
   */
  async recordAttempt(userId, method, success) {
    try {
      const rateLimitKey = `2fa_rate_limit:${method}:${userId}`;

      if (success) {
        // Clear rate limit on success
        await cache.del(rateLimitKey);
      } else {
        // Increment failed attempts
        const attempts = (await cache.get(rateLimitKey)) || 0;
        await cache.set(rateLimitKey, attempts + 1, 15 * 60); // 15 minutes
      }
    } catch (error) {
      logError(error, { context: 'Failed to record 2FA attempt', userId, method });
    }
  }
}

// Create 2FA manager instance
const twoFactorManager = new TwoFactorManager();

module.exports = {
  twoFactorManager,
  TwoFactorManager,
};
