const mongoose = require('mongoose');

/**
 * One staff member on one hub shift on one day (workforce/shifts.service).
 *
 *   booked       they (or admin) put themselves on it
 *   checked_in   selfie at the hub's meeting point; they are on duty
 *   done         checked out, or the shift ended while on duty
 *   missed       booked, never checked in
 *   cancelled    taken off before it started
 */
const STATUSES = ['booked', 'checked_in', 'done', 'missed', 'cancelled'];

const shiftSchema = new mongoose.Schema({
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true, index: true },
  hubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hub', required: true, index: true },
  day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // India date
  code: { type: String, required: true },
  label: { type: String, default: '' },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  status: { type: String, enum: STATUSES, default: 'booked', index: true },
  checkInAt: { type: Date, default: null },
  checkInSelfie: { type: String, default: '' }, // upload key
  checkInDistanceM: { type: Number, default: null },
  lateMin: { type: Number, default: 0 },
  checkOutAt: { type: Date, default: null },
  bookedBy: { type: String, enum: ['worker', 'admin'], default: 'worker' },
}, { timestamps: true });

// One booking per person per shift.
shiftSchema.index({ workerId: 1, day: 1, code: 1 }, { unique: true });
shiftSchema.index({ hubId: 1, day: 1, code: 1, status: 1 });

module.exports = mongoose.models.StaffShift || mongoose.model('StaffShift', shiftSchema);
module.exports.STATUSES = STATUSES;
