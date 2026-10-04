const mongoose = require('mongoose');

const eventThemeSchema = new mongoose.Schema({
  partnerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'EventPartner', required: true },
  categoryId:  { type: mongoose.Schema.Types.ObjectId, ref: 'EventCategory', required: true },

  title:       { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, maxlength: 2000 },
  tags:        { type: [String], default: [] }, // e.g. ['luxury', 'floral', 'budget']

  // Media — all S3 URLs
  coverImage:  { type: String, required: true },
  gallery:     { type: [String], default: [], validate: v => v.length <= 20 },
  videoUrl:    String, // S3 key of an uploaded short video (never a pasted link)

  // Pricing
  startingPricePaise: { type: Number, required: true, min: 0 },

  // What the setup includes / excludes
  includedItems:       { type: [String], default: [] },
  excludedItems:       { type: [String], default: [] }, // e.g. "Cake not included"
  setupDurationMinutes:{ type: Number, default: 120 },
  setupAreaSqft:       Number,
  guestCapacity: {
    min: { type: Number, default: 1   },
    max: { type: Number, default: 500 },
  },

  // Availability
  cities: { type: [String], default: [] }, // lowercase city slugs

  // Social proof
  bookingCount: { type: Number, default: 0 },
  saveCount:    { type: Number, default: 0 },
  rating:       { type: Number, default: 0, min: 0, max: 5 },
  reviewCount:  { type: Number, default: 0 },

  // Admin controls — nothing goes live automatically
  status:     { type: String, enum: ['pending', 'approved', 'featured', 'hidden', 'rejected'], default: 'pending' },
  isTrending: { type: Boolean, default: false },
  adminNote:  String,
}, { timestamps: true });

eventThemeSchema.index({ categoryId: 1, status: 1 });
eventThemeSchema.index({ status: 1, isTrending: -1, bookingCount: -1 });
eventThemeSchema.index({ cities: 1, status: 1 });
eventThemeSchema.index({ startingPricePaise: 1, status: 1 });
// Text search index for keyword search
eventThemeSchema.index({ title: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('EventTheme', eventThemeSchema);
