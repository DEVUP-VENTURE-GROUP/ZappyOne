const mongoose = require('mongoose');

/**
 * Service catalog entries — Universal schema for all service offerings
 * (mobile, laptop, vehicle, ac_repair, plumbing, etc.).
 * Fully DB-backed and admin-controlled.
 */

const serviceCatalogSchema = new mongoose.Schema(
  {
    code:         { type: String, required: true, unique: true, lowercase: true, index: true },
    name:         { type: String, required: true },
    icon:         { type: String, default: '' },
    category:     { type: String, required: true, index: true }, // 'vehicle' | 'home' | 'helper' | 'mobile' | 'laptop' | 'ac' | 'beauty' | 'other'
    subcategory:  { type: String, default: '' },

    shortDescription: { type: String, default: '' },
    description:      { type: String, default: '' },

    // Dynamic Media Management
    imageUrl:      { type: String, default: '' }, // primary thumbnail
    coverImage:    { type: String, default: '' }, // hero banner image
    galleryImages: [String],                      // detail gallery

    estimatedDurationMinutes: { type: Number, required: true, default: 30 },

    // Price hints & floor ranges
    priceRangeMinPaise: { type: Number, required: true },
    priceRangeMaxPaise: { type: Number, required: true },
    inspectionFeePaise: { type: Number, default: 15000 }, // default ₹150 inspection fee if required

    // Checklist & guidelines
    checklist: [
      {
        item:     { type: String, required: true },
        required: { type: Boolean, default: true },
      },
    ],
    guidelines:    [String],
    requiredTools: [String],
    requiredSkills: { type: [String], required: true },

    isFeatured: { type: Boolean, default: false },
    isActive:   { type: Boolean, default: true, index: true },
    sortOrder:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ServiceCatalog', serviceCatalogSchema);
