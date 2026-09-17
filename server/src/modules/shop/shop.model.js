const mongoose = require('mongoose');
const { pointField, stripEmptyPoints } = require('../../utils/geo-point');

/**
 * A physical, verified local business (phone repair shop, laptop repair shop,
 * decoration studio, …) that customers can discover and book DIRECTLY, as an
 * alternative to Zappy's own auto-dispatch.
 *
 * Deliberately modelled after `event-partner.model.js` — same actor shape
 * (business owner account, KYC, profile, rating, earnings) — but general
 * purpose rather than events-only, and does not touch that live model.
 *
 * A Shop does not do the work itself — its `Worker` documents do (see
 * `worker.model.js`'s `shopId` field). The shop is the storefront; workers
 * tagged to it are still real, individually-KYC'd Workers, eligible for
 * ordinary Express dispatch exactly like any other worker (dispatch's
 * matching query never looks at `shopId`) AND for direct shop-routed
 * bookings (`Order.preferredShopId`).
 */
const shopSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true, trim: true, maxlength: 120 },
    ownerName:    { type: String, required: true, trim: true, maxlength: 100 },
    phone:        { type: String, required: true, unique: true, index: true },
    email:        { type: String, lowercase: true, sparse: true },

    // What this shop offers — service codes from the SAME catalog customers
    // book from (service-catalog.model.js), so "nearby shops" can be filtered
    // by exactly the service a customer is trying to book. Not required at
    // document-creation time — see the note on `address` below.
    services: { type: [String], default: [] },
    // Broad category for browse/filter UI — mirrors service-catalog's own
    // category taxonomy (mobile, laptop, vehicle, events, …).
    category: { type: String, default: '', index: true },

    // NOT required at the schema level. First-login self-registration (mirrors
    // loginEventPartnerWithOtp) only collects businessName/ownerName/phone — a
    // full geo-address can't come out of a login form. The owner completes
    // services/category/address in a follow-up profile step, and `isActive`
    // (below) is the actual gate: `isDiscoverable()` checks all of this is
    // filled in before a shop can appear in "Nearby Shops" or take bookings.
    address: {
      text: String,
      // [lng, lat]. Absent entirely until a shop actually pins itself — a
      // half-written point is what the 2dsphere index rejects outright, which
      // is what made shop registration fail for anyone who signed up before
      // setting an address.
      location: pointField(),
      landmark: String,
    },

    // KYC — mirrors EventPartner's business-verification shape.
    kyc: {
      status: {
        type: String,
        enum: ['not_submitted', 'pending_review', 'approved', 'rejected', 'suspended'],
        default: 'not_submitted',
        index: true,
      },
      ownerIdUrl:            String, // Aadhaar/PAN of the owner — S3 key
      shopPhotoUrl:          String, // storefront photo — S3 key
      selfieUrl:             String,
      gstCertificateUrl:     String, // optional
      businessRegistrationUrl: String, // optional
      gstNumber:  String,
      panNumber:  String,
      submittedAt: Date,
      reviewedAt:  Date,
      reviewedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      reviewNote:  String,
    },


    /**
     * Opening hours, one row per weekday (0 = Sunday).
     *
     * A storefront customers can find has to say when it is open — a shop that
     * takes a booking for 9pm on a Sunday and is shut has damaged the customer
     * and itself. Missing rows mean "not stated", which is treated as closed
     * rather than as always-open: silence must not create a promise.
     */
    hours: {
      type: [{
        _id: false,
        day: { type: Number, min: 0, max: 6, required: true },
        opensAt: { type: String, default: '' },   // "09:30", 24h local time
        closesAt: { type: String, default: '' },
        isClosed: { type: Boolean, default: false },
      }],
      default: [],
    },

    // Storefront profile — what a customer sees on the shop's page.
    coverImageUrl: String,
    galleryImages: { type: [String], default: [] },
    bio: { type: String, maxlength: 1000 },
    yearsActive: Number,

    rating: { type: Number, default: 5, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },

    isActive:  { type: Boolean, default: true },  // owner-controlled: "open for bookings"
    isBlocked: { type: Boolean, default: false }, // admin-controlled

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);

stripEmptyPoints(shopSchema, ['address.location']);

shopSchema.index({ 'address.location': '2dsphere' });
// Fast "which shops offer X, near me, verified and open" queries.
shopSchema.index({ services: 1, isActive: 1, isBlocked: 1, 'kyc.status': 1 });


/**
 * Is the shop open at a given moment?
 *
 * Returns null when hours have not been set, so callers can say "hours not
 * listed" instead of asserting closed — an unstated schedule is missing
 * information, not a fact about the business.
 */
shopSchema.methods.isOpenAt = function isOpenAt(when = new Date()) {
  if (!this.hours?.length) return null;

  const row = this.hours.find((h) => h.day === when.getDay());
  if (!row || row.isClosed || !row.opensAt || !row.closesAt) return false;

  const minutes = when.getHours() * 60 + when.getMinutes();
  const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const open = toMinutes(row.opensAt);
  const close = toMinutes(row.closesAt);
  if (open == null || close == null) return false;

  // A closing time earlier than the opening time means the shift runs past
  // midnight, which is ordinary for repair shops near markets.
  return close > open ? minutes >= open && minutes < close : minutes >= open || minutes < close;
};

/**
 * True only when this shop can legitimately appear in "Nearby Shops" and take
 * direct bookings: owner marked it open, admin hasn't blocked it, KYC is
 * approved, AND the profile is actually complete (address pinned, at least
 * one service configured). The single gate everything else should call
 * instead of re-deriving these conditions ad hoc.
 */
shopSchema.methods.isDiscoverable = function isDiscoverable() {
  return (
    this.isActive &&
    !this.isBlocked &&
    this.kyc?.status === 'approved' &&
    Array.isArray(this.address?.location?.coordinates) &&
    this.address.location.coordinates.length === 2 &&
    Array.isArray(this.services) &&
    this.services.length > 0
  );
};

module.exports = mongoose.model('Shop', shopSchema);
