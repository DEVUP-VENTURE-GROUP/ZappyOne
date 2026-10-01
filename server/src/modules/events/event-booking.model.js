const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema({
  status: String,
  at:     { type: Date, default: Date.now },
  meta:   mongoose.Schema.Types.Mixed,
}, { _id: false });

const eventBookingSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',         required: true },
  themeId:   { type: mongoose.Schema.Types.ObjectId, ref: 'EventTheme',   required: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventPartner', required: true },

  // Event details
  eventDate:     { type: Date,   required: true },
  eventTimeSlot: { type: String, required: true }, // '10:00 AM'
  address: {
    line1:   { type: String, required: true },
    city:    String,
    pincode: String,
    lat:     Number,
    lng:     Number,
  },
  guestCount:  { type: Number, default: 1 },
  notes:       String,
  roomPhotos:  { type: [String], default: [] }, // S3 URLs

  // Pricing snapshot locked at booking time
  pricing: {
    totalPaise:            { type: Number, required: true },
    advancePaise:          { type: Number, required: true },
    remainingPaise:        { type: Number, required: true },
    platformCommissionPct: Number,
    travelFeePaise:        { type: Number, default: 0 },
    advancePaymentPct:     Number,
  },

  // Advance payment
  advancePayment: {
    status:      { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
    cfOrderId:   String,
    cfPaymentId: String,
    paidAt:      Date,
  },

  // Remaining balance (collected on day of event or after)
  remainingPayment: {
    status:      { type: String, enum: ['pending', 'paid'], default: 'pending' },
    cfOrderId:   String,
    cfPaymentId: String,
    paidAt:      Date,
  },

  // Booking lifecycle
  status: {
    type: String,
    enum: ['pending_payment', 'confirmed', 'partner_assigned', 'in_progress', 'completed', 'cancelled', 'disputed'],
    default: 'pending_payment',
  },
  statusHistory: { type: [statusHistorySchema], default: [] },
  /** The host reads this out before the team starts at the venue (jobs/start-code). */
  startCode:     { type: String, default: () => String(require('crypto').randomInt(1000, 10000)) },

  // Cancellation
  cancellationReason: String,
  cancelledBy:        { type: String, enum: ['user', 'partner', 'admin'] },
  refundPaise:        { type: Number, default: 0 },
  refundStatus:       { type: String, enum: ['none', 'pending', 'processed'], default: 'none' },

  // Review
  userRating:  { type: Number, min: 1, max: 5 },
  userReview:  String,
  reviewedAt:  Date,

  // Dispute link
  disputeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispute' },
}, { timestamps: true });

eventBookingSchema.index({ userId: 1, status: 1 });
eventBookingSchema.index({ partnerId: 1, eventDate: 1 });
eventBookingSchema.index({ themeId: 1 });
eventBookingSchema.index({ status: 1, eventDate: 1 });

module.exports = mongoose.model('EventBooking', eventBookingSchema);
