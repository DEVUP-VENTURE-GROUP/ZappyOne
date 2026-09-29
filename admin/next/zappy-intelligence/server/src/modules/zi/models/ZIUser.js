'use strict';

const mongoose = require('mongoose');

const ZI_ROLES = ['super_admin', 'zi_admin', 'analyst', 'city_manager', 'board_member'];

const loginIpSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true },
    ts: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ziUserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ZI_ROLES,
      required: true,
      index: true,
    },
    // Only populated for city_manager role — restricts data access to that city
    cityScope: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
      sparse: true,
    },
    // TOTP secret (base32) stored encrypted; null if MFA not configured
    mfaSecret: {
      type: String,
      select: false,
      default: null,
    },
    mfaEnabled: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    // Rolling last-50 login IP records for security audit
    loginIps: {
      type: [loginIpSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // Fine-grained permission overrides beyond role defaults
    permissions: {
      type: [String],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ZIUser',
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'zi_users',
  }
);

// Compound index for active user lookup
ziUserSchema.index({ email: 1, isActive: 1 });
ziUserSchema.index({ role: 1, isActive: 1 });

// Cap loginIps to 50 entries on save
ziUserSchema.pre('save', function (next) {
  if (this.loginIps && this.loginIps.length > 50) {
    this.loginIps = this.loginIps.slice(-50);
  }
  next();
});

const ZIUser = mongoose.model('ZIUser', ziUserSchema);

module.exports = ZIUser;
module.exports.ZI_ROLES = ZI_ROLES;
