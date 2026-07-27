const mongoose = require('mongoose');

/**
 * ServiceVariant Schema — Model-Specific Part & Quality Pricing Matrix.
 * e.g. iPhone 15 Pro Max + Screen Replacement + OEM Tier -> ₹42,000 / 90 days warranty
 */
const serviceVariantSchema = new mongoose.Schema(
  {
    serviceCode:       { type: String, required: true, lowercase: true, index: true }, // e.g. 'screen_replacement'
    brandCode:         { type: String, required: true, lowercase: true, index: true }, // e.g. 'apple'
    modelId:           { type: mongoose.Schema.Types.ObjectId, ref: 'DeviceModel', required: true, index: true },
    modelCode:         { type: String, required: true, lowercase: true, index: true },
    qualityTier:       { type: String, enum: ['OEM', 'Premium', 'Compatible', 'Budget'], default: 'Compatible', index: true },
    partName:          { type: String, default: '' }, // e.g. 'OLED Screen Assembly'
    partPricePaise:    { type: Number, required: true, min: 0 },
    laborPricePaise:   { type: Number, required: true, min: 0 },
    totalPricePaise:   { type: Number, required: true, min: 0 },
    warrantyDays:      { type: Number, default: 30 },
    estimatedMin:      { type: Number, default: 45 },
    isActive:          { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

serviceVariantSchema.index({ serviceCode: 1, modelCode: 1, qualityTier: 1 }, { unique: true });

module.exports = mongoose.model('ServiceVariant', serviceVariantSchema);
