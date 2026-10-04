const mongoose = require('mongoose');

const cancelTierSchema = new mongoose.Schema({
  daysBeforeEvent: { type: Number, required: true },
  refundPct:       { type: Number, required: true, min: 0, max: 100 },
}, { _id: false });

const eventConfigSchema = new mongoose.Schema({
  // Payments
  advancePaymentPct:     { type: Number, default: 20,  min: 0, max: 100 },
  // The platform's rule: 10% from the provider (pricing rules). Admin may change it;
  // each booking freezes the rate it was made at.
  platformCommissionPct: { type: Number, default: 10,  min: 0, max: 50 },
  // Added to the customer's bill on every booking, collected with the advance.
  platformFeePaise:      { type: Number, default: 1000, min: 0, max: 100000 },
  travelFeePerKmPaise:   { type: Number, default: 0 },

  // Cancellation policy (admin editable)
  cancellationPolicy: {
    type: [cancelTierSchema],
    default: [
      { daysBeforeEvent: 7, refundPct: 100 },
      { daysBeforeEvent: 3, refundPct: 50  },
      { daysBeforeEvent: 1, refundPct: 25  },
      { daysBeforeEvent: 0, refundPct: 0   },
    ],
  },

  // Booking rules
  minAdvanceBookingHours: { type: Number, default: 24  },
  maxAdvanceBookingDays:  { type: Number, default: 365 },
  sameDayBookingEnabled:  { type: Boolean, default: false },
  videoEnabled:           { type: Boolean, default: true  },
  bookingEnabled:         { type: Boolean, default: true  },

  isActive:  { type: Boolean, default: false },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
}, { timestamps: true });

// Only one active config at a time
eventConfigSchema.index({ isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

module.exports = mongoose.model('EventConfig', eventConfigSchema);
