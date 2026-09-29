const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },

    role: {
      type: String,
      enum: Object.keys(require('./access/permissions').ROLES),
      default: 'ops',
    },
    // Granted on top of the role, e.g. 'money:read' for one ops person.
    permissions: [String],
    // Where this admin works. Empty = everywhere. A city manager is scoped to theirs.
    scope: {
      markets: { type: [String], default: [] },
      cities: { type: [String], default: [] },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },

    twoFactor: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false },
    },

    lastLoginAt: Date,
    lastLoginIp: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Admin', adminSchema);
