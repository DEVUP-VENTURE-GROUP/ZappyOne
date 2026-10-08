const mongoose = require('mongoose');

/**
 * A customer asking nearby shops for their price.
 *
 * When no shop near the customer has priced the exact repair for their device,
 * a dead end becomes a request: every approved shop for that service around
 * them is told, each can answer with its price, and the customer books the one
 * they like. A shop's answer is saved as its own price for that device, so the
 * next customer is shown it straight away.
 */
const offerSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    totalPaise: { type: Number, required: true, min: 0 },
    qualityCode: { type: String, default: null },
    warrantyDays: { type: Number, default: 0, min: 0 },
    note: { type: String, default: '', maxlength: 300 },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const PRICE_REQUEST_STATUSES = ['open', 'booked', 'expired', 'cancelled'];

const priceRequestSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    vertical: { type: String, required: true, lowercase: true },
    lineCode: { type: String, required: true },
    brandCode: { type: String, required: true },
    modelCode: { type: String, required: true },
    configurationCode: { type: String, default: null },
    problemCodes: { type: [String], default: [] },
    repairCode: { type: String, required: true },
    serviceMode: { type: String, default: 'doorstep' },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
      address: { type: String, default: '' },
    },
    status: { type: String, enum: PRICE_REQUEST_STATUSES, default: 'open', index: true },
    expiresAt: { type: Date, required: true, index: true },
    /** The shops told about it (approved for the service and covering the address). */
    notifiedShopIds: { type: [mongoose.Schema.Types.ObjectId], default: [], index: true },
    offers: { type: [offerSchema], default: [] },
    bookingId: { type: mongoose.Schema.Types.ObjectId, default: null },
    bookedShopId: { type: mongoose.Schema.Types.ObjectId, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

priceRequestSchema.index({ userId: 1, status: 1, createdAt: -1 });

module.exports = {
  RepairPriceRequest: mongoose.models.RepairPriceRequest || mongoose.model('RepairPriceRequest', priceRequestSchema),
  PRICE_REQUEST_STATUSES,
};
