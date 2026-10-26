const mongoose = require('mongoose');

/**
 * A hub: where ZappyOne's own staff are based (workforce/). To start it is an
 * area with a meeting point; staff check in there, inside `radiusM`, to begin
 * a shift. Its shifts say when staff work and how many are needed. Stock and
 * kits come later, when a hub has premises.
 */
const shiftSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, maxlength: 20 },
  label: { type: String, required: true, trim: true, maxlength: 40 },
  start: { type: String, required: true, match: /^\d{2}:\d{2}$/ }, // India time, HH:MM
  end: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  need: { type: Number, default: 1, min: 0, max: 200 }, // staff wanted on it
}, { _id: false });

const hubSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  city: { type: String, required: true, trim: true, maxlength: 40 },
  meetingPoint: {
    address: { type: String, default: '', maxlength: 300 },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
  },
  radiusM: { type: Number, default: 500, min: 50, max: 2000 }, // check-in must be this close (never under 500 m in practice)
  serviceKm: { type: Number, default: 8, min: 1, max: 50 }, // how far its staff are sent, when no area is drawn
  // The area it serves, drawn on the map; when set it decides, not serviceKm (workforce/coverage).
  area: { type: { type: String, enum: ['Polygon'] }, coordinates: { type: [[[Number]]], default: undefined } },
  // Pincodes and localities it also serves, each with its area as the map service bounds it (workforce/coverage).
  places: {
    type: [new mongoose.Schema({
      kind: { type: String, enum: ['pincode', 'locality'], required: true },
      key: { type: String, required: true, maxlength: 80 }, name: { type: String, default: '', maxlength: 80 },
      area: { type: { type: String, enum: ['Polygon'] }, coordinates: { type: [[[Number]]] } },
    }, { _id: false })],
    default: [],
  },
  shifts: { type: [shiftSchema], default: [] },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

hubSchema.index({ 'meetingPoint.location': '2dsphere' });

module.exports = mongoose.models.Hub || mongoose.model('Hub', hubSchema);
