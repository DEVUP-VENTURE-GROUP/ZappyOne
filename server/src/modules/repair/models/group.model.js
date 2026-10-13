const mongoose = require('mongoose');

/**
 * Several vehicles or devices booked together: one address, one time, one
 * checkout (repair/services/group). Each item is an ordinary RepairBooking
 * (its own price, warranty, photos and report) carrying this group's id; the
 * group only holds what they share and the totals the customer was shown.
 */
const groupSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true, uppercase: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  bookingIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  /** 'single': one provider does everything; 'split': each item went to who can do it. */
  plan: { type: String, enum: ['single', 'split'], required: true },
  serviceMode: { type: String, required: true },
  scheduledAt: { type: Date, default: null },
  location: {
    address: String,
    coordinates: { type: [Number], default: undefined },
  },
  totals: {
    itemsPaise: { type: Number, default: 0 },
    discountPaise: { type: Number, default: 0 },
    journeyPaise: { type: Number, default: 0 },
    platformFeePaise: { type: Number, default: 0 },
    taxPaise: { type: Number, default: 0 },
    totalPaise: { type: Number, default: 0 },
  },
  idempotencyKey: { type: String, default: null },
}, { timestamps: true });

groupSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

const RepairBookingGroup = mongoose.models.RepairBookingGroup || mongoose.model('RepairBookingGroup', groupSchema);

module.exports = { RepairBookingGroup };
