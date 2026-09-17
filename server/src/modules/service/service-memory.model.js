/**
 * Service Memory — Appliance Passport / Home History
 * Every service creates a permanent record for that appliance/location.
 * Customer sees full history; next worker sees context; warranty tracked.
 * No competitor in India has this.
 */
const mongoose = require('mongoose');
const { pointField, stripEmptyPoints } = require('../../utils/geo-point');

const serviceEntrySchema = new mongoose.Schema({
  orderId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  workerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Worker' },
  workerName:  String,
  date:        { type: Date, default: Date.now },
  notes:       { type: String, maxlength: 1000 },
  photos:      [String],
  partsMentioned: [String],   // spare parts used/replaced
  warrantyDays:   Number,     // warranty on this service (0 if none)
  warrantyExpiresAt: Date,
  rating:      Number,
}, { _id: true });

const serviceMemorySchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  service:   { type: String, required: true },  // e.g. 'ac_repair'
  label:     { type: String, maxlength: 100 },  // e.g. "Living Room AC", "Kitchen Sink"
  address:   { type: String, maxlength: 300 },
  location: pointField(),
  entries:   [serviceEntrySchema],
  lastServiceAt: Date,
  nextReminderAt: Date,  // computed: suggest next service date
  preferredWorkerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
}, { timestamps: true });

serviceMemorySchema.index({ userId: 1, service: 1 });
stripEmptyPoints(serviceMemorySchema, ['location']);

serviceMemorySchema.index({ location: '2dsphere' });

module.exports = mongoose.model('ServiceMemory', serviceMemorySchema);
