const { generateUUID } = require('../../utils/helpers');
const { ValidationError, NotFoundError } = require('../../middleware/errorHandler');
const { logInfo, logError } = require('../../utils/logger');

// In-memory user storage (in production, use database)
const users = new Map();
const usersByEmail = new Map();

/**
 * Create a new user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} - Created user
 */
const createUser = async userData => {
  const user = {
    ...userData,
    id: userData.id || generateUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    lastLoginIp: null,
    lastLoginUserAgent: null,
    failedLoginAttempts: 0,
    isLocked: false,
    lockedUntil: null,
    isActive: true,
    isEmailVerified: userData.isEmailVerified || false,
    emailVerificationToken: userData.emailVerificationToken || null,
    profile: {
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      avatar: userData.avatar || null,
      bio: userData.bio || '',
      dateOfBirth: userData.dateOfBirth || null,
      gender: userData.gender || null,
      phone: userData.phone || null,
      address: userData.address || null,
      timezone: userData.timezone || 'UTC',
      language: userData.language || 'en',
    },
    preferences: {
      emailNotifications: true,
      pushNotifications: true,
      smsNotifications: false,
      marketingEmails: false,
      theme: 'light',
      currency: 'USD',
    },
    metadata: {
      source: userData.source || 'web',
      referrer: userData.referrer || null,
      utmSource: userData.utmSource || null,
      utmMedium: userData.utmMedium || null,
      utmCampaign: userData.utmCampaign || null,
    },
  };

  users.set(user.id, user);
  usersByEmail.set(user.email.toLowerCase(), user);

  logInfo('User created successfully', { userId: user.id, email: user.email });

  return user;
};

/**
 * Find user by ID
 * @param {string} userId - User ID
 * @param {boolean} includePassword - Include password in result
 * @returns {Promise<Object|null>} - User object or null
 */
const findUserById = async (userId, includePassword = false) => {
  const user = users.get(userId);
  if (!user) {
    return null;
  }

  if (!includePassword) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  return user;
};

/**
 * Find user by email
 * @param {string} email - User email
 * @param {boolean} includePassword - Include password in result
 * @returns {Promise<Object|null>} - User object or null
 */
const findUserByEmail = async (email, includePassword = false) => {
  const user = usersByEmail.get(email.toLowerCase());
  if (!user) {
    return null;
  }

  if (!includePassword) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  return user;
};

/**
 * Find user by email verification token
 * @param {string} token - Email verification token
 * @returns {Promise<Object|null>} - User object or null
 */
const findUserByEmailVerificationToken = async token => {
  for (const user of users.values()) {
    if (user.emailVerificationToken === token) {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    }
  }
  return null;
};

/**
 * Update user
 * @param {string} userId - User ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} - Updated user
 */
const updateUser = async (userId, updateData) => {
  const user = users.get(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const updatedUser = {
    ...user,
    ...updateData,
    updatedAt: new Date(),
  };

  users.set(userId, updatedUser);

  // Update email index if email changed
  if (updateData.email && updateData.email !== user.email) {
    usersByEmail.delete(user.email.toLowerCase());
    usersByEmail.set(updateData.email.toLowerCase(), updatedUser);
  }

  logInfo('User updated successfully', { userId, updatedFields: Object.keys(updateData) });

  const { password, ...userWithoutPassword } = updatedUser;
  return userWithoutPassword;
};

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {Object} profileData - Profile data to update
 * @returns {Promise<Object>} - Updated user
 */
const updateUserProfile = async (userId, profileData) => {
  const user = users.get(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const updatedUser = {
    ...user,
    profile: {
      ...user.profile,
      ...profileData,
    },
    updatedAt: new Date(),
  };

  users.set(userId, updatedUser);

  logInfo('User profile updated successfully', { userId });

  const { password, ...userWithoutPassword } = updatedUser;
  return userWithoutPassword;
};

/**
 * Update user preferences
 * @param {string} userId - User ID
 * @param {Object} preferences - Preferences to update
 * @returns {Promise<Object>} - Updated user
 */
const updateUserPreferences = async (userId, preferences) => {
  const user = users.get(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const updatedUser = {
    ...user,
    preferences: {
      ...user.preferences,
      ...preferences,
    },
    updatedAt: new Date(),
  };

  users.set(userId, updatedUser);

  logInfo('User preferences updated successfully', { userId });

  const { password, ...userWithoutPassword } = updatedUser;
  return userWithoutPassword;
};

/**
 * Update user password
 * @param {string} userId - User ID
 * @param {string} hashedPassword - New hashed password
 * @returns {Promise<void>}
 */
const updatePassword = async (userId, hashedPassword) => {
  const user = users.get(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const updatedUser = {
    ...user,
    password: hashedPassword,
    updatedAt: new Date(),
  };

  users.set(userId, updatedUser);
  usersByEmail.set(user.email.toLowerCase(), updatedUser);

  logInfo('User password updated successfully', { userId });
};

/**
 * Verify user email
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
const verifyUserEmail = async userId => {
  const user = users.get(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const updatedUser = {
    ...user,
    isEmailVerified: true,
    emailVerificationToken: null,
    updatedAt: new Date(),
  };

  users.set(userId, updatedUser);
  usersByEmail.set(user.email.toLowerCase(), updatedUser);

  logInfo('User email verified successfully', { userId });
};

/**
 * Update email verification token
 * @param {string} userId - User ID
 * @param {string} token - New verification token
 * @returns {Promise<void>}
 */
const updateEmailVerificationToken = async (userId, token) => {
  const user = users.get(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const updatedUser = {
    ...user,
    emailVerificationToken: token,
    updatedAt: new Date(),
  };

  users.set(userId, updatedUser);
  usersByEmail.set(user.email.toLowerCase(), updatedUser);
};

/**
 * Update last login information
 * @param {string} userId - User ID
 * @param {string} ip - IP address
 * @param {string} userAgent - User agent
 * @returns {Promise<void>}
 */
const updateLastLogin = async (userId, ip, userAgent) => {
  const user = users.get(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const updatedUser = {
    ...user,
    lastLoginAt: new Date(),
    lastLoginIp: ip,
    lastLoginUserAgent: userAgent,
    updatedAt: new Date(),
  };

  users.set(userId, updatedUser);
  usersByEmail.set(user.email.toLowerCase(), updatedUser);
};

/**
 * Increment failed login attempts
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
const incrementFailedLoginAttempts = async userId => {
  const user = users.get(userId);
  if (!user) {
    return;
  }

  const failedAttempts = user.failedLoginAttempts + 1;
  const maxAttempts = 5;
  const lockDuration = 30 * 60 * 1000; // 30 minutes

  const updatedUser = {
    ...user,
    failedLoginAttempts: failedAttempts,
    isLocked: failedAttempts >= maxAttempts,
    lockedUntil: failedAttempts >= maxAttempts ? new Date(Date.now() + lockDuration) : null,
    updatedAt: new Date(),
  };

  users.set(userId, updatedUser);
  usersByEmail.set(user.email.toLowerCase(), updatedUser);

  if (updatedUser.isLocked) {
    logInfo('User account locked due to failed login attempts', {
      userId,
      attempts: failedAttempts,
    });
  }
};

/**
 * Reset failed login attempts
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
const resetFailedLoginAttempts = async userId => {
  const user = users.get(userId);
  if (!user) {
    return;
  }

  const updatedUser = {
    ...user,
    failedLoginAttempts: 0,
    isLocked: false,
    lockedUntil: null,
    updatedAt: new Date(),
  };

  users.set(userId, updatedUser);
  usersByEmail.set(user.email.toLowerCase(), updatedUser);
};

/**
 * Delete user
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
const deleteUser = async userId => {
  const user = users.get(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  users.delete(userId);
  usersByEmail.delete(user.email.toLowerCase());

  logInfo('User deleted successfully', { userId });
};

/**
 * Get all users with pagination
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - Users with pagination info
 */
const getUsers = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    search = '',
    role = null,
    isActive = null,
    isEmailVerified = null,
  } = options;

  let userList = Array.from(users.values());

  // Apply filters
  if (search) {
    const searchLower = search.toLowerCase();
    userList = userList.filter(
      user =>
        user.name.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower),
    );
  }

  if (role) {
    userList = userList.filter(user => user.role === role);
  }

  if (isActive !== null) {
    userList = userList.filter(user => user.isActive === isActive);
  }

  if (isEmailVerified !== null) {
    userList = userList.filter(user => user.isEmailVerified === isEmailVerified);
  }

  // Apply sorting
  userList.sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];

    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  // Apply pagination
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedUsers = userList.slice(startIndex, endIndex);

  // Remove passwords from results
  const sanitizedUsers = paginatedUsers.map(user => sanitizeUser(user));

  return {
    users: sanitizedUsers,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(userList.length / limit),
      totalUsers: userList.length,
      hasNextPage: endIndex < userList.length,
      hasPrevPage: page > 1,
    },
  };
};

/**
 * Sanitize user object (remove sensitive data)
 * @param {Object} user - User object
 * @returns {Object} - Sanitized user object
 */
const sanitizeUser = user => {
  const { password, emailVerificationToken, ...sanitizedUser } = user;
  return sanitizedUser;
};

/**
 * Get user statistics
 * @returns {Promise<Object>} - User statistics
 */
const getUserStats = async () => {
  const userList = Array.from(users.values());

  return {
    totalUsers: userList.length,
    activeUsers: userList.filter(user => user.isActive).length,
    verifiedUsers: userList.filter(user => user.isEmailVerified).length,
    lockedUsers: userList.filter(user => user.isLocked).length,
    usersByRole: userList.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {}),
  };
};

module.exports = {
  createUser,
  findUserById,
  findUserByEmail,
  findUserByEmailVerificationToken,
  updateUser,
  updateUserProfile,
  updateUserPreferences,
  updatePassword,
  verifyUserEmail,
  updateEmailVerificationToken,
  updateLastLogin,
  incrementFailedLoginAttempts,
  resetFailedLoginAttempts,
  deleteUser,
  getUsers,
  sanitizeUser,
  getUserStats,
};
