const mongoose = require('mongoose');

const areaSchema = new mongoose.Schema(
  { slug: { type: String, required: true }, name: { type: String, required: true } },
  { _id: false }
);

const citySchema = new mongoose.Schema({
  slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  name:        { type: String, required: true, trim: true },
  state:       { type: String, required: true, trim: true },
  lat:         { type: Number, required: true },
  lng:         { type: Number, required: true },
  population:  { type: String, default: '' },
  description: { type: String, default: '' },
  pinCodes:    { type: [String], default: [] },
  isActive:    { type: Boolean, default: true },
  // Taking bookings here: the city page says Book now instead of Coming soon (seo/template).
  live:        { type: Boolean, default: false },
  areas:       { type: [areaSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('City', citySchema);
