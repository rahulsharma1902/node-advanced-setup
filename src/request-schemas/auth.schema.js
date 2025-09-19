const { celebrate, Joi, Segments } = require('celebrate');

// Common validation patterns
const patterns = {
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'Password is required',
    }),
  name: Joi.string().min(2).max(50).trim().required().messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name must not exceed 50 characters',
    'any.required': 'Name is required',
  }),
  token: Joi.string().required().messages({
    'any.required': 'Token is required',
  }),
  uuid: Joi.string().uuid().required().messages({
    'string.uuid': 'Invalid UUID format',
    'any.required': 'ID is required',
  }),
};

// Register user schema
const registerSchema = celebrate({
  [Segments.BODY]: Joi.object({
    email: patterns.email,
    password: patterns.password,
    name: patterns.name,
    role: Joi.string().valid('user', 'admin', 'moderator').default('user').messages({
      'any.only': 'Role must be one of: user, admin, moderator',
    }),
    firstName: Joi.string().min(2).max(30).trim().optional().messages({
      'string.min': 'First name must be at least 2 characters long',
      'string.max': 'First name must not exceed 30 characters',
    }),
    lastName: Joi.string().min(2).max(30).trim().optional().messages({
      'string.min': 'Last name must be at least 2 characters long',
      'string.max': 'Last name must not exceed 30 characters',
    }),
    phone: Joi.string()
      .pattern(/^\+?[1-9]\d{1,14}$/)
      .optional()
      .messages({
        'string.pattern.base': 'Please provide a valid phone number',
      }),
    dateOfBirth: Joi.date().max('now').optional().messages({
      'date.max': 'Date of birth cannot be in the future',
    }),
    gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').optional().messages({
      'any.only': 'Gender must be one of: male, female, other, prefer_not_to_say',
    }),
    timezone: Joi.string().optional().default('UTC'),
    language: Joi.string().length(2).optional().default('en').messages({
      'string.length': 'Language code must be 2 characters long',
    }),
    source: Joi.string().valid('web', 'mobile', 'api').optional().default('web'),
    referrer: Joi.string().uri().optional().allow(null),
    utmSource: Joi.string().optional().allow(null),
    utmMedium: Joi.string().optional().allow(null),
    utmCampaign: Joi.string().optional().allow(null),
  }).options({ stripUnknown: true }),
});

// Login user schema
const loginSchema = celebrate({
  [Segments.BODY]: Joi.object({
    email: patterns.email,
    password: Joi.string().required().messages({
      'any.required': 'Password is required',
    }),
    rememberMe: Joi.boolean().optional().default(false),
  }).options({ stripUnknown: true }),
});

// Refresh token schema
const refreshTokenSchema = celebrate({
  [Segments.BODY]: Joi.object({
    refreshToken: patterns.token,
  }).options({ stripUnknown: true }),
});

// Forgot password schema
const forgotPasswordSchema = celebrate({
  [Segments.BODY]: Joi.object({
    email: patterns.email,
  }).options({ stripUnknown: true }),
});

// Reset password schema
const resetPasswordSchema = celebrate({
  [Segments.BODY]: Joi.object({
    token: patterns.token,
    newPassword: patterns.password,
    confirmPassword: Joi.string().required().valid(Joi.ref('newPassword')).messages({
      'any.only': 'Passwords do not match',
      'any.required': 'Password confirmation is required',
    }),
  }).options({ stripUnknown: true }),
});

// Change password schema
const changePasswordSchema = celebrate({
  [Segments.BODY]: Joi.object({
    currentPassword: Joi.string().required().messages({
      'any.required': 'Current password is required',
    }),
    newPassword: patterns.password,
    confirmPassword: Joi.string().required().valid(Joi.ref('newPassword')).messages({
      'any.only': 'Passwords do not match',
      'any.required': 'Password confirmation is required',
    }),
  }).options({ stripUnknown: true }),
});

// Verify email schema
const verifyEmailSchema = celebrate({
  [Segments.PARAMS]: Joi.object({
    token: patterns.token,
  }),
});

// Resend verification schema
const resendVerificationSchema = celebrate({
  [Segments.BODY]: Joi.object({
    email: patterns.email,
  }).options({ stripUnknown: true }),
});

// Logout schema
const logoutSchema = celebrate({
  [Segments.BODY]: Joi.object({
    refreshToken: Joi.string().optional(),
  }).options({ stripUnknown: true }),
});

// Update profile schema
const updateProfileSchema = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().min(2).max(50).trim().optional(),
    firstName: Joi.string().min(2).max(30).trim().optional(),
    lastName: Joi.string().min(2).max(30).trim().optional(),
    bio: Joi.string().max(500).optional().allow(''),
    phone: Joi.string()
      .pattern(/^\+?[1-9]\d{1,14}$/)
      .optional()
      .allow(null),
    dateOfBirth: Joi.date().max('now').optional().allow(null),
    gender: Joi.string()
      .valid('male', 'female', 'other', 'prefer_not_to_say')
      .optional()
      .allow(null),
    timezone: Joi.string().optional(),
    language: Joi.string().length(2).optional(),
    address: Joi.object({
      street: Joi.string().max(100).optional().allow(''),
      city: Joi.string().max(50).optional().allow(''),
      state: Joi.string().max(50).optional().allow(''),
      country: Joi.string().length(2).optional().allow(''),
      zipCode: Joi.string().max(20).optional().allow(''),
    }).optional(),
  }).options({ stripUnknown: true }),
});

// Update preferences schema
const updatePreferencesSchema = celebrate({
  [Segments.BODY]: Joi.object({
    emailNotifications: Joi.boolean().optional(),
    pushNotifications: Joi.boolean().optional(),
    smsNotifications: Joi.boolean().optional(),
    marketingEmails: Joi.boolean().optional(),
    theme: Joi.string().valid('light', 'dark', 'auto').optional(),
    currency: Joi.string().length(3).uppercase().optional(),
  }).options({ stripUnknown: true }),
});

// Common query parameters for pagination and filtering
const paginationSchema = {
  page: Joi.number().integer().min(1).default(1).messages({
    'number.min': 'Page must be at least 1',
    'number.integer': 'Page must be an integer',
  }),
  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit must not exceed 100',
    'number.integer': 'Limit must be an integer',
  }),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'name', 'email').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  search: Joi.string().max(100).optional().allow(''),
};

// Get users schema (admin only)
const getUsersSchema = celebrate({
  [Segments.QUERY]: Joi.object({
    ...paginationSchema,
    role: Joi.string().valid('user', 'admin', 'moderator').optional(),
    isActive: Joi.boolean().optional(),
    isEmailVerified: Joi.boolean().optional(),
  }).options({ stripUnknown: true }),
});

// Get user by ID schema
const getUserByIdSchema = celebrate({
  [Segments.PARAMS]: Joi.object({
    userId: patterns.uuid,
  }),
});

// Update user schema (admin only)
const updateUserSchema = celebrate({
  [Segments.PARAMS]: Joi.object({
    userId: patterns.uuid,
  }),
  [Segments.BODY]: Joi.object({
    name: Joi.string().min(2).max(50).trim().optional(),
    email: Joi.string().email().optional(),
    role: Joi.string().valid('user', 'admin', 'moderator').optional(),
    isActive: Joi.boolean().optional(),
    isEmailVerified: Joi.boolean().optional(),
  }).options({ stripUnknown: true }),
});

// Delete user schema (admin only)
const deleteUserSchema = celebrate({
  [Segments.PARAMS]: Joi.object({
    userId: patterns.uuid,
  }),
});

// Custom validation middleware for file uploads
const validateFileUpload = (options = {}) => {
  const {
    maxSize = 5 * 1024 * 1024, // 5MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif'],
    required = false,
  } = options;

  return (req, res, next) => {
    if (!req.file && required) {
      return res.status(400).json({
        status: 'error',
        message: 'File is required',
      });
    }

    if (req.file) {
      // Check file size
      if (req.file.size > maxSize) {
        return res.status(400).json({
          status: 'error',
          message: `File size must not exceed ${Math.round(maxSize / (1024 * 1024))}MB`,
        });
      }

      // Check file type
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          status: 'error',
          message: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
        });
      }
    }

    next();
  };
};

module.exports = {
  // Auth schemas
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  logoutSchema,

  // Profile schemas
  updateProfileSchema,
  updatePreferencesSchema,

  // Admin schemas
  getUsersSchema,
  getUserByIdSchema,
  updateUserSchema,
  deleteUserSchema,

  // Utility
  validateFileUpload,
  patterns,
  paginationSchema,
};
