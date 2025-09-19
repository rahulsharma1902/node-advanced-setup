const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false, // Don't include password in queries by default
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'moderator'],
      default: 'user',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    lastLoginAt: {
      type: Date,
    },
    lastLoginIp: {
      type: String,
    },
    lastLoginUserAgent: {
      type: String,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    lockedUntil: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    profile: {
      firstName: { type: String, trim: true },
      lastName: { type: String, trim: true },
      avatar: { type: String },
      bio: { type: String, maxlength: 500 },
      dateOfBirth: { type: Date },
      gender: { type: String, enum: ['male', 'female', 'other'] },
      phone: { type: String },
      address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String,
      },
      timezone: { type: String, default: 'UTC' },
      language: { type: String, default: 'en' },
    },
    preferences: {
      emailNotifications: { type: Boolean, default: true },
      pushNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: false },
      marketingEmails: { type: Boolean, default: false },
      theme: { type: String, enum: ['light', 'dark'], default: 'light' },
      currency: { type: String, default: 'USD' },
    },
    metadata: {
      source: { type: String, default: 'web' },
      referrer: String,
      utmSource: String,
      utmMedium: String,
      utmCampaign: String,
    },
    refreshTokens: [
      {
        token: String,
        createdAt: { type: Date, default: Date.now },
        expiresAt: Date,
        isRevoked: { type: Boolean, default: false },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ id: 1 });
userSchema.index({ emailVerificationToken: 1 });
userSchema.index({ passwordResetToken: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastLoginAt: -1 });

// Virtual for full name
userSchema.virtual('fullName').get(function () {
  if (this.profile.firstName && this.profile.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.name;
});

// Virtual for account age
userSchema.virtual('accountAge').get(function () {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    // Hash the password with cost of 12
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to check if account is locked
userSchema.methods.isAccountLocked = function () {
  return !!(this.isLocked && this.lockedUntil && this.lockedUntil > Date.now());
};

// Instance method to increment failed login attempts
userSchema.methods.incrementFailedAttempts = function () {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockedUntil && this.lockedUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockedUntil: 1 },
      $set: { failedLoginAttempts: 1, isLocked: false },
    });
  }

  const updates = { $inc: { failedLoginAttempts: 1 } };

  // Lock account after 5 failed attempts for 2 hours
  if (this.failedLoginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = {
      isLocked: true,
      lockedUntil: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
    };
  }

  return this.updateOne(updates);
};

// Instance method to reset failed login attempts
userSchema.methods.resetFailedAttempts = function () {
  return this.updateOne({
    $unset: { failedLoginAttempts: 1, lockedUntil: 1 },
    $set: { isLocked: false },
  });
};

// Static method to find by email
userSchema.statics.findByEmail = function (email, includePassword = false) {
  const query = this.findOne({ email: email.toLowerCase() });
  if (includePassword) {
    query.select('+password +emailVerificationToken +passwordResetToken');
  }
  return query;
};

// Static method to find by ID
userSchema.statics.findByUserId = function (id, includePassword = false) {
  const query = this.findOne({ id });
  if (includePassword) {
    query.select('+password +emailVerificationToken +passwordResetToken');
  }
  return query;
};

// Static method to find by verification token
userSchema.statics.findByVerificationToken = function (token) {
  return this.findOne({ emailVerificationToken: token });
};

// Static method to find by reset token
userSchema.statics.findByResetToken = function (token) {
  return this.findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: Date.now() },
  });
};

// Static method to get user statistics
userSchema.statics.getStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        verifiedUsers: { $sum: { $cond: ['$isEmailVerified', 1, 0] } },
        activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
        lockedUsers: { $sum: { $cond: ['$isLocked', 1, 0] } },
      },
    },
  ]);

  return (
    stats[0] || {
      totalUsers: 0,
      verifiedUsers: 0,
      activeUsers: 0,
      lockedUsers: 0,
    }
  );
};

// Export the model
module.exports = mongoose.model('User', userSchema);
