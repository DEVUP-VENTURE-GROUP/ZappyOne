const mongoose = require('mongoose');

/** A staff member's leave request for one day; approved leave is paid (workforce/payroll). */
const leaveSchema = new mongoose.Schema({
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true, index: true },
  day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  reason: { type: String, default: '', trim: true, maxlength: 200 },
  status: { type: String, enum: ['requested', 'approved', 'rejected'], default: 'requested', index: true },
  decidedBy: { type: String, default: null },
  decidedAt: { type: Date, default: null },
}, { timestamps: true });

leaveSchema.index({ workerId: 1, day: 1 }, { unique: true });

module.exports = mongoose.models.StaffLeave || mongoose.model('StaffLeave', leaveSchema);
