const mongoose = require('mongoose');

/**
 * ZappyLens scan — one row per visual service search.
 *
 * Purpose:
 *   - Audit/history of what a user scanned and what the AI diagnosed
 *   - Source of the photo + AI notes attached to an order when the user books
 *   - Demand intelligence (joins the SearchEvent / Unmet-Demand backbone)
 *
 * TTL: scans auto-expire after 90 days (matches DemandEvent). A scan that
 * becomes an order is copied onto the order, so the order keeps the photo
 * independently of this TTL.
 */
const lensMatchSchema = new mongoose.Schema(
  {
    serviceCode:   { type: String, required: true },
    name:          { type: String, default: '' },
    category:      { type: String, default: '' },
    confidence:    { type: Number, default: 0 },          // 0..1
    severity:      { type: String, enum: ['low', 'moderate', 'high', 'unknown'], default: 'unknown' },
    issueSummary:  { type: String, default: '' },
    notesForWorker:{ type: String, default: '' },
    // Real quote from the pricing engine (null if location absent or no coverage).
    quote: {
      // Paise, like every other money field in the system.
      total:      { type: Number, default: null },
      currency:   { type: String, default: 'INR' },
      etaMinutes: { type: Number, default: null },
      surge:      { type: Number, default: null },
    },
    // Catalog price hint (always present) — shown when a live quote isn't available.
    priceHintMin: { type: Number, default: null },        // paise
    priceHintMax: { type: Number, default: null },
  },
  { _id: false }
);

const lensScanSchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    imageKeys:{ type: [String], default: [] },            // S3 keys (private; presigned on read)

    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    district: { type: String, default: null },
    city:     { type: String, default: null },
    state:    { type: String, default: null },

    detectedObject: { type: String, default: '' },
    imageQuality:   { type: String, enum: ['good', 'blurry', 'dark', 'unclear', 'not_relevant'], default: 'good' },
    hint:           { type: String, default: null },     // friendly guidance shown to the user
    isServiceable:  { type: Boolean, default: false },
    matches:        { type: [lensMatchSchema], default: [] },
    topServiceCode: { type: String, default: null, index: true },

    // 'served'     → at least one valid in-catalog match
    // 'no_service' → nothing we offer (feeds Unmet-Demand)
    result:   { type: String, enum: ['served', 'no_service'], default: 'no_service', index: true },

    model:    { type: String, default: '' },              // which model produced the result
    escalated:{ type: Boolean, default: false },          // did we fall back to the smart model
    latencyMs:{ type: Number, default: null },
  },
  { timestamps: true }
);

// TTL — 90 days. Mongo purges expired scans automatically.
lensScanSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
lensScanSchema.index({ topServiceCode: 1, createdAt: -1 });

module.exports = mongoose.model('LensScan', lensScanSchema);
