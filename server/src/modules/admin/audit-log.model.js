const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      kind: {
        type: String,
        enum: ["admin", "system", "user", "worker"],
        required: true,
      },
      id: { type: mongoose.Schema.Types.ObjectId },
      email: String,
    },
    action: { type: String, required: true, index: true }, // e.g. 'worker.approve_kyc'
    target: {
      kind: String,
      id: mongoose.Schema.Types.ObjectId,
    },
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    ip: String,
    userAgent: String,
    // Which web portal the request came from (admin, fleet…), from x-client-type.
    portal: { type: String, default: null },
  },
  { timestamps: { createdAt: "at", updatedAt: false } },
);

auditLogSchema.index({ "actor.id": 1, at: -1 });
auditLogSchema.index({ action: 1, at: -1 });
auditLogSchema.index({ portal: 1, at: -1 });
// TTL: retain audit logs for 2 years
auditLogSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 730 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
