const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true },
    name: { type: String, trim: true },
    email: { type: String, lowercase: true, sparse: true },
    passwordHash: { type: String, select: false },
    savedAddresses: [
      {
        label: String,
        address: String,
        location: {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: { type: [Number], required: true }, // [lng, lat]
        },
        landmark: String,
        flatNumber: String,
        notes: String,
        tag: { type: String, enum: ['home', 'work', 'other'], default: 'other' },
        isDefault: { type: Boolean, default: false },
      },
    ],
    recentLocations: [
      {
        address: { type: String },
        lat: { type: Number },
        lng: { type: Number },
        usedAt: { type: Date, default: Date.now },
      },
    ],
    deviceTokens: [{ type: String }], // FCM / Web Push tokens for push notifications
    defaultPayment: { type: String, enum: ['cash', 'upi', 'card'], default: 'upi' },
    rating: { type: Number, default: 5, min: 0, max: 5 },
    isBlocked: { type: Boolean, default: false },

    // Lifetime abuse counters — persisted in Mongo so Redis TTL expiry
    // doesn't reset the history. Used for escalating penalties.
    abuse: {
      totalCancels:           { type: Number, default: 0 }, // all cancels ever
      cancelAfterAssignment:  { type: Number, default: 0 }, // subset: after worker assigned
      totalDisputes:          { type: Number, default: 0 },
      freezeCount:            { type: Number, default: 0 }, // how many times frozen
      lastFreezeAt:           { type: Date },
    },

    // Per-channel notification opt-in flags
    notificationPrefs: {
      orderUpdates:  { type: Boolean, default: true },
      workerArrival: { type: Boolean, default: true },
      payments:      { type: Boolean, default: true },
      disputes:      { type: Boolean, default: true },
      promotions:    { type: Boolean, default: true },
      marketing:     { type: Boolean, default: false },
    },

    // Rolling last-10 login records for the account-security screen
    loginHistory: [{
      at:        { type: Date, default: Date.now },
      ip:        String,
      device:    String, // parsed UA: "Chrome on Windows"
      userAgent: { type: String, select: false },
    }],

    // Soft delete — retained 30 days then hard-purged by a scheduled job
    isDeleted:  { type: Boolean, default: false, index: true },
    deletedAt:  Date,

    // Gamification — XP, levels, streaks, badges (mirrors worker incentive system)
    gamification: {
      xp:            { type: Number, default: 0 },
      level:         { type: Number, default: 1 },
      streak:        { type: Number, default: 0 },
      lastOrderDate: { type: Date },
      totalOrders:   { type: Number, default: 0 },
      badges:        [{ id: String, label: String, earnedAt: Date }],
    },
  },
  { timestamps: true }
);

userSchema.index({ 'savedAddresses.location': '2dsphere' });

/**
 * Record a location the user was just at — dedupe by address, most-recent
 * first, capped at 10. Single source of truth for `recentLocations` writes:
 * called both from the explicit `POST /users/recent-location` endpoint AND
 * automatically on every order creation (order.service.js), so this is
 * guaranteed to fill in for every user regardless of which client placed
 * the order — it never depended on a screen remembering to call it.
 */
userSchema.statics.recordRecentLocation = async function recordRecentLocation(userId, { address, lat, lng }) {
  if (!address) return;
  await this.updateOne({ _id: userId }, { $pull: { recentLocations: { address } } });
  await this.updateOne({ _id: userId }, {
    $push: {
      recentLocations: {
        $each: [{ address, lat, lng, usedAt: new Date() }],
        $position: 0,
        $slice: 10,
      },
    },
  });
};

module.exports = mongoose.model('User', userSchema);
