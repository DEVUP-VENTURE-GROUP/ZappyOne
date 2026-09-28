/**
 * A thing the customer owns and gets serviced repeatedly.
 *
 * WHY THIS IS NOT WATER-SPECIFIC. The brief asked for a "WaterAsset" — a tank
 * a customer can revisit across bookings. But a phone, a car and a tank are
 * the same shape to this system: a vertical, a brand tier, a model tier, a
 * place it lives, and a service history. Building `WaterAsset` would mean
 * building `VehicleAsset` and `DeviceAsset` next, three tables holding the
 * same five columns. One model serves all five verticals — "my 1,000 L
 * overhead tank at the Kondapur flat", "my Galaxy S23", "my Nexon" — and the
 * vertical decides only how it is WORDED on screen.
 *
 * WHAT IT IS NOT. Not a second source of truth for pricing or catalog: it
 * stores CODES that point at the live catalog, so a tank type renamed in admin
 * renames everywhere, and an asset can never drift into describing a model
 * that no longer exists.
 *
 * Service history is deliberately NOT duplicated here. Bookings already record
 * what happened; an asset's history is a query over them, not a copy that can
 * disagree with them.
 */

const mongoose = require('mongoose');
const { pointField, stripEmptyPoints } = require('../../../core/geo/point');

const customerAssetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /** Which catalog this asset belongs to — mobile, four_wheeler, water_tank_care… */
    vertical: { type: String, required: true, lowercase: true, index: true },

    /** Catalog pointers, never denormalised copies of the names. */
    brandCode: { type: String, required: true, lowercase: true },
    modelCode: { type: String, default: null, lowercase: true },

    /**
     * What the customer calls it. The whole point of saving an asset is that
     * "Terrace tank" is how they think, not "overhead / 1,000–2,000 L".
     */
    label: { type: String, default: '', maxlength: 80 },

    /** Where it physically is — a tank does not move, and the next visit goes here. */
    location: pointField({ address: String }),

    notes: { type: String, default: '', maxlength: 1000 },

    /** S3 keys. Signed on read like every other media field. */
    photos: { type: [String], default: [] },

    /**
     * Optional service-planning facts the customer can state and no booking
     * can infer — when it was last serviced by someone else, before Zappy.
     */
    lastServicedAt: { type: Date, default: null },
    installedAt: { type: Date, default: null },

    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

stripEmptyPoints(customerAssetSchema, ['location']);

customerAssetSchema.index({ userId: 1, vertical: 1, isArchived: 1 });
customerAssetSchema.index({ location: '2dsphere' });

const CustomerAsset = mongoose.model('CustomerAsset', customerAssetSchema);

module.exports = { CustomerAsset };
