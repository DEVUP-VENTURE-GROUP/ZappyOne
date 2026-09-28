const mongoose = require('mongoose');
const { pointField } = require('../../core/geo/point');

/**
 * A customer asked to be told when ZappyOne reaches their location.
 * One row per customer per ~1 km cell, so repeat taps don't inflate demand.
 */
const launchInterestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    location: pointField(),
    /** lat/lng rounded to 2 decimals (~1.1 km): the dedupe and aggregation key. */
    cell: { type: String, required: true },
    address: { type: String, default: '', maxlength: 300 },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

launchInterestSchema.index({ userId: 1, cell: 1 }, { unique: true });
launchInterestSchema.index({ location: '2dsphere' });
launchInterestSchema.index({ cell: 1, createdAt: -1 });

module.exports = mongoose.model('LaunchInterest', launchInterestSchema);
