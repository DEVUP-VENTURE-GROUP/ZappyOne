'use strict';

const mongoose = require('mongoose');

const ziAuditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ZIUser',
      required: true,
      index: true,
    },
    role: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    resource: {
      type: String,
      default: null,
    },
    resourceId: {
      type: String,
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    sessionId: {
      type: String,
      default: null,
    },
    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
      default: 'GET',
    },
    path: {
      type: String,
      default: null,
    },
    statusCode: {
      type: Number,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
    },
    result: {
      type: String,
      enum: ['success', 'denied', 'error'],
      default: 'success',
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // TTL index — documents auto-expire after 365 days (31536000 seconds)
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
      expires: 31536000,
    },
  },
  {
    // No timestamps — we control timestamp manually for immutability clarity
    collection: 'zi_audit_logs',
  }
);

// Compound indexes for common query patterns
ziAuditLogSchema.index({ userId: 1, timestamp: -1 });
ziAuditLogSchema.index({ action: 1, timestamp: -1 });
ziAuditLogSchema.index({ result: 1, timestamp: -1 });
ziAuditLogSchema.index({ resource: 1, resourceId: 1, timestamp: -1 });

// Make the collection effectively immutable — block updates
ziAuditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('ZIAuditLog is immutable — updates are not allowed.');
});
ziAuditLogSchema.pre('updateOne', function () {
  throw new Error('ZIAuditLog is immutable — updates are not allowed.');
});
ziAuditLogSchema.pre('updateMany', function () {
  throw new Error('ZIAuditLog is immutable — updates are not allowed.');
});

const ZIAuditLog = mongoose.model('ZIAuditLog', ziAuditLogSchema);

module.exports = ZIAuditLog;
