/**
 * Subscription Maintenance Plans
 * Customer subscribes to recurring service (monthly cleaning, quarterly AC, etc.)
 * Platform auto-schedules + notifies. Worker gets guaranteed income.
 * No competitor has smart auto-recurring home service plans in India.
 */
const mongoose = require('mongoose');
const { pointField, stripEmptyPoints } = require('../../utils/geo-point');

const maintenancePlanSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  service:       { type: String, required: true },
  label:         { type: String, maxlength: 100 }, // e.g. "Monthly Cleaning", "Quarterly AC Service"

  /*
   * Repair-engine plans (§29 AMC).
   *
   * This model was built for the legacy Order world, where `service` is a
   * string and a due plan spawns an Order. The repair engine books a
   * RepairBooking instead, against a catalogued repair on a specific device —
   * for Water & Tank Care, a named tank type and capacity.
   *
   * `vertical` is the switch: set, this plan books through the repair engine;
   * absent, it behaves exactly as before. Existing plans have no vertical, so
   * nothing about them changes.
   */
  vertical:      { type: String, default: null, lowercase: true, index: true },
  repairCode:    { type: String, default: null, lowercase: true },
  brandCode:     { type: String, default: null, lowercase: true },
  modelCode:     { type: String, default: null, lowercase: true },
  /** Book the same provider each visit where one was chosen. */
  shopId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },

  /** Visits included per year, for a fixed-term plan (Basic 2 / Standard 3 / Premium 4). */
  visitsPerYear: { type: Number, default: null, min: 1, max: 12 },
  /** Repair bookings this plan has produced — the repair-engine twin of orderHistory. */
  bookingHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RepairBooking' }],

  /* Recurrence */
  frequencyDays: { type: Number, required: true, min: 1, max: 365 }, // 30 = monthly

  /* Preferred worker */
  preferredWorkerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },

  /* Location */
  // `coordinates: [Number]` used to default to an empty array which, paired
  // with a defaulting `type`, wrote `{ type: 'Point', coordinates: [] }` — a
  // fragment the 2dsphere index below refuses.
  pickupLocation: pointField({ address: String }),

  /* Pricing snapshot (discounted) */
  basePriceRupees:    Number,
  discountPct:        { type: Number, default: 10 }, // 10% loyalty discount
  effectivePriceRupees: Number,

  /* Execution tracking */
  status:          { type: String, enum: ['active', 'paused', 'cancelled'], default: 'active', index: true },
  nextScheduledAt: { type: Date, required: true, index: true },
  lastCompletedAt: Date,
  totalCompleted:  { type: Number, default: 0 },
  orderHistory:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],

  /* Payment */
  paymentMethod:   { type: String, enum: ['cash', 'upi', 'card'], default: 'upi' },
}, { timestamps: true });

stripEmptyPoints(maintenancePlanSchema, ['pickupLocation']);

maintenancePlanSchema.index({ pickupLocation: '2dsphere' });
maintenancePlanSchema.index({ status: 1, nextScheduledAt: 1 });

module.exports = mongoose.model('MaintenancePlan', maintenancePlanSchema);
