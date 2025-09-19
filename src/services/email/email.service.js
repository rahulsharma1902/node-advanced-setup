const nodemailer = require('nodemailer');
const { config } = require('../../config');
const { logInfo, logError } = require('../../utils/logger');
const { generateUUID } = require('../../utils/helpers');

// Email templates
const emailTemplates = {
  verification: {
    subject: 'Verify Your Email Address',
    html: (token, appName) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to ${appName}!</h2>
        <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${config.app.url}/api/auth/verify-email/${token}" 
             style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
        <p><a href="${config.app.url}/api/auth/verify-email/${token}">${config.app.url}/api/auth/verify-email/${token}</a></p>
        <p>This link will expire in 24 hours.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
          If you didn't create an account with ${appName}, please ignore this email.
        </p>
      </div>
    `,
    text: (token, appName) => `
      Welcome to ${appName}!
      
      Thank you for registering. Please verify your email address by visiting this link:
      ${config.app.url}/api/auth/verify-email/${token}
      
      This link will expire in 24 hours.
      
      If you didn't create an account with ${appName}, please ignore this email.
    `,
  },
  passwordReset: {
    subject: 'Reset Your Password',
    html: (token, appName) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password for your ${appName} account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${config.app.url}/reset-password?token=${token}" 
             style="background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
        <p><a href="${config.app.url}/reset-password?token=${token}">${config.app.url}/reset-password?token=${token}</a></p>
        <p>This link will expire in 1 hour.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
          If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
        </p>
      </div>
    `,
    text: (token, appName) => `
      Password Reset Request
      
      You requested to reset your password for your ${appName} account.
      
      Please visit this link to reset your password:
      ${config.app.url}/reset-password?token=${token}
      
      This link will expire in 1 hour.
      
      If you didn't request a password reset, please ignore this email.
    `,
  },
  welcome: {
    subject: 'Welcome to {appName}!',
    html: (userName, appName) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to ${appName}, ${userName}!</h2>
        <p>Your email has been verified successfully. You can now enjoy all the features of ${appName}.</p>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3>Getting Started:</h3>
          <ul>
            <li>Complete your profile</li>
            <li>Explore our features</li>
            <li>Connect with other users</li>
          </ul>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${config.app.url}/dashboard" 
             style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Go to Dashboard
          </a>
        </div>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
          Need help? Contact us at support@${appName.toLowerCase()}.com
        </p>
      </div>
    `,
    text: (userName, appName) => `
      Welcome to ${appName}, ${userName}!
      
      Your email has been verified successfully. You can now enjoy all the features of ${appName}.
      
      Getting Started:
      - Complete your profile
      - Explore our features
      - Connect with other users
      
      Visit your dashboard: ${config.app.url}/dashboard
      
      Need help? Contact us at support@${appName.toLowerCase()}.com
    `,
  },
  passwordChanged: {
    subject: 'Password Changed Successfully',
    html: (userName, appName) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Changed</h2>
        <p>Hi ${userName},</p>
        <p>Your password for ${appName} has been changed successfully.</p>
        <div style="background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>Security Notice:</strong> If you didn't make this change, please contact our support team immediately.
        </div>
        <p>For your security, you've been logged out of all devices. Please log in again with your new password.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
          This is an automated security notification from ${appName}.
        </p>
      </div>
    `,
    text: (userName, appName) => `
      Password Changed
      
      Hi ${userName},
      
      Your password for ${appName} has been changed successfully.
      
      Security Notice: If you didn't make this change, please contact our support team immediately.
      
      For your security, you've been logged out of all devices. Please log in again with your new password.
      
      This is an automated security notification from ${appName}.
    `,
  },
};

// Create transporter
let transporter = null;

/**
 * Initialize email transporter
 */
const initializeTransporter = () => {
  if (!config.email.smtp.host) {
    logInfo('SMTP configuration not found, email service will be disabled');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: config.email.smtp.host,
    port: config.email.smtp.port,
    secure: config.email.smtp.secure,
    auth: {
      user: config.email.smtp.auth.user,
      pass: config.email.smtp.auth.pass,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  // Verify connection
  transporter.verify((error, success) => {
    if (error) {
      logError(error, { context: 'Email transporter verification failed' });
    } else {
      logInfo('Email transporter initialized successfully');
    }
  });

  return transporter;
};

/**
 * Send email
 * @param {Object} options - Email options
 * @returns {Promise<Object>} - Email result
 */
const sendEmail = async options => {
  if (!transporter) {
    transporter = initializeTransporter();
  }

  if (!transporter) {
    logInfo('Email service not configured, skipping email send');
    return {
      success: false,
      message: 'Email service not configured',
    };
  }

  const {
    to,
    subject,
    html,
    text,
    from = `${config.email.from.name} <${config.email.from.email}>`,
    attachments = [],
    priority = 'normal',
  } = options;

  const mailOptions = {
    from,
    to,
    subject,
    html,
    text,
    attachments,
    priority,
    messageId: generateUUID(),
  };

  try {
    const result = await transporter.sendMail(mailOptions);

    logInfo('Email sent successfully', {
      to,
      subject,
      messageId: result.messageId,
    });

    return {
      success: true,
      messageId: result.messageId,
      response: result.response,
    };
  } catch (error) {
    logError(error, {
      context: 'Email sending failed',
      to,
      subject,
    });

    throw error;
  }
};

/**
 * Send verification email
 * @param {string} email - Recipient email
 * @param {string} token - Verification token
 * @returns {Promise<Object>} - Email result
 */
const sendVerificationEmail = async (email, token) => {
  const template = emailTemplates.verification;

  return await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html(token, config.app.name),
    text: template.text(token, config.app.name),
    priority: 'high',
  });
};

/**
 * Send password reset email
 * @param {string} email - Recipient email
 * @param {string} token - Reset token
 * @returns {Promise<Object>} - Email result
 */
const sendPasswordResetEmail = async (email, token) => {
  const template = emailTemplates.passwordReset;

  return await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html(token, config.app.name),
    text: template.text(token, config.app.name),
    priority: 'high',
  });
};

/**
 * Send welcome email
 * @param {string} email - Recipient email
 * @param {string} userName - User name
 * @returns {Promise<Object>} - Email result
 */
const sendWelcomeEmail = async (email, userName) => {
  const template = emailTemplates.welcome;

  return await sendEmail({
    to: email,
    subject: template.subject.replace('{appName}', config.app.name),
    html: template.html(userName, config.app.name),
    text: template.text(userName, config.app.name),
  });
};

/**
 * Send password changed notification
 * @param {string} email - Recipient email
 * @param {string} userName - User name
 * @returns {Promise<Object>} - Email result
 */
const sendPasswordChangedEmail = async (email, userName) => {
  const template = emailTemplates.passwordChanged;

  return await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html(userName, config.app.name),
    text: template.text(userName, config.app.name),
    priority: 'high',
  });
};

/**
 * Send custom email
 * @param {Object} options - Email options
 * @returns {Promise<Object>} - Email result
 */
const sendCustomEmail = async options => {
  return await sendEmail(options);
};

/**
 * Send bulk emails
 * @param {Array} emails - Array of email options
 * @returns {Promise<Array>} - Array of email results
 */
const sendBulkEmails = async emails => {
  const results = [];

  for (const emailOptions of emails) {
    try {
      const result = await sendEmail(emailOptions);
      results.push({ success: true, ...result });
    } catch (error) {
      results.push({
        success: false,
        error: error.message,
        to: emailOptions.to,
      });
    }
  }

  return results;
};

/**
 * Validate email address
 * @param {string} email - Email address
 * @returns {boolean} - True if valid
 */
const validateEmail = email => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Get email template
 * @param {string} templateName - Template name
 * @returns {Object} - Email template
 */
const getEmailTemplate = templateName => {
  return emailTemplates[templateName] || null;
};

/**
 * Add custom email template
 * @param {string} name - Template name
 * @param {Object} template - Template object
 */
const addEmailTemplate = (name, template) => {
  emailTemplates[name] = template;
  logInfo('Email template added', { templateName: name });
};

/**
 * Test email configuration
 * @returns {Promise<boolean>} - True if configuration is valid
 */
const testEmailConfiguration = async () => {
  try {
    if (!transporter) {
      transporter = initializeTransporter();
    }

    if (!transporter) {
      return false;
    }

    await transporter.verify();
    return true;
  } catch (error) {
    logError(error, { context: 'Email configuration test failed' });
    return false;
  }
};

/**
 * Get email service statistics
 * @returns {Object} - Email service statistics
 */
const getEmailStats = () => {
  return {
    isConfigured: !!transporter,
    transporterReady: transporter?.isIdle() || false,
    availableTemplates: Object.keys(emailTemplates),
  };
};

// Initialize transporter on module load if SMTP is configured
if (config.email.smtp.host) {
  initializeTransporter();
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
  sendCustomEmail,
  sendBulkEmails,
  validateEmail,
  getEmailTemplate,
  addEmailTemplate,
  testEmailConfiguration,
  getEmailStats,
};
