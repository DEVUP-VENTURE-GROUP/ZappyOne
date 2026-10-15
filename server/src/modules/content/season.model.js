const mongoose = require('mongoose');

/**
 * A festive season on the customer home (Navratri, Diwali, Sankranti, Eid…):
 * scheduled by admin, shown on the websites and the apps only between its
 * dates. Without one running, home is as it always is.
 *
 *   theme    a designed look (shared/src/customer/season.js THEMES): colours
 *            and the decoration drawn across the top
 *   tiles    up to 6 services to put forward, each with an uploaded photo or
 *            the service's own art; a tile for a service not live is skipped
 *   offer    a promo code that must be live; the strip says only what it gives
 */
const THEMES = ['navratri', 'diwali', 'holi', 'sankranti', 'eid', 'christmas'];

const tileSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 40 },
  serviceCode: { type: String, required: true, trim: true, maxlength: 60 },
  imageUrl: { type: String, default: '', maxlength: 500 },
  badge: { type: String, default: '', trim: true, maxlength: 20 },
}, { _id: false });

const seasonSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  theme: { type: String, enum: THEMES, required: true },
  greeting: { type: String, default: '', trim: true, maxlength: 40 },
  headline: { type: String, required: true, trim: true, maxlength: 60 },
  subline: { type: String, default: '', trim: true, maxlength: 120 },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  tiles: { type: [tileSchema], default: [] },
  promoCode: { type: String, default: '', uppercase: true, trim: true, maxlength: 30 },
  isActive: { type: Boolean, default: true },
  updatedBy: { type: String, default: null },
}, { timestamps: true });

seasonSchema.index({ isActive: 1, startAt: 1, endAt: 1 });

module.exports = mongoose.models.Season || mongoose.model('Season', seasonSchema);
module.exports.THEMES = THEMES;
