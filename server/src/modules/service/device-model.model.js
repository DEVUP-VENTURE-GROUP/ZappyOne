const mongoose = require('mongoose');

/**
 * DeviceModel Schema — e.g. iPhone 15 Pro Max, Galaxy S24 Ultra, OnePlus 12
 * Belongs to a Brand & Series.
 */
const deviceModelSchema = new mongoose.Schema(
  {
    brandId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    brandCode:       { type: String, required: true, index: true }, // e.g. 'apple'
    seriesName:      { type: String, default: '', index: true },    // e.g. 'iPhone 15 Series'
    name:            { type: String, required: true, trim: true, index: true }, // e.g. 'iPhone 15 Pro Max'
    code:            { type: String, required: true, unique: true, lowercase: true, trim: true }, // e.g. 'apple-iphone-15-pro-max'
    modelNumbers:    [String], // e.g. ['A3106', 'A2849']
    storageVariants: [String], // e.g. ['128GB', '256GB', '512GB', '1TB']
    ramVariants:     [String], // e.g. ['8GB', '12GB']
    launchYear:      { type: Number, default: new Date().getFullYear() },
    imageUrl:        { type: String, default: '' },
    sortOrder:       { type: Number, default: 0 },
    isActive:        { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

deviceModelSchema.index({ brandCode: 1, seriesName: 1, isActive: 1 });

module.exports = mongoose.model('DeviceModel', deviceModelSchema);
