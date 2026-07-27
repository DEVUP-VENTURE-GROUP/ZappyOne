const mongoose = require('mongoose');

/**
 * DemandEvent Schema — Captures unserved or abandoned demand for analytics & market expansion intelligence.
 * e.g. "User in Warangal searched for Pixel 8 screen replacement but no worker/part was available".
 */
const demandEventSchema = new mongoose.Schema(
  {
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    cityCode:         { type: String, default: 'general', index: true },
    pincode:          { type: String, default: '', index: true },
    category:         { type: String, default: 'mobile', index: true },
    brandName:        { type: String, default: '' },
    modelName:        { type: String, default: '' },
    requestedService: { type: String, default: '', index: true },
    reason:           { type: String, enum: ['no_worker', 'no_part', 'price_rejection', 'location_unserviceable', 'quote_abandoned'], required: true },
    customerNote:     { type: String, default: '' },
  },
  { timestamps: true }
);

demandEventSchema.index({ cityCode: 1, category: 1, brandName: 1, createdAt: -1 });

module.exports = mongoose.model('DemandEvent', demandEventSchema);
