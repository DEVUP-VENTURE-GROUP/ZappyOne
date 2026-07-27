const mongoose = require('mongoose');

/**
 * Brand Schema — e.g. Apple, Samsung, OnePlus, Xiaomi, Hyundai, Voltas
 * Configurable per category.
 */
const brandSchema = new mongoose.Schema(
  {
    code:         { type: String, required: true, unique: true, lowercase: true, trim: true },
    name:         { type: String, required: true, trim: true },
    logoUrl:      { type: String, default: '' },
    category:     { type: String, required: true, index: true }, // 'mobile' | 'laptop' | 'vehicle' | 'ac'
    sortOrder:    { type: Number, default: 0 },
    isActive:     { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Brand', brandSchema);
