const mongoose = require('mongoose');

/**
 * Telemetry models — the durable backbone for the Intelligence & Expansion dashboard.
 *
 *   VisitorSession — one row per browser session (live traffic, device/geo/referrer).
 *   SearchEvent    — one row per service search (demand intelligence + unmet demand).
 *
 * "No service available" is NOT a separate collection — it is a SearchEvent with
 * result='no_service'. One write path, indexed for fast unmet-demand queries.
 *
 * Redis holds the hot "active right now" set (viz:online ZSET); Mongo holds durable
 * history. Both auto-expire after 90 days to stay bounded (TTL indexes below).
 */

const NINETY_DAYS = 90 * 24 * 3600;

/* VisitorSession */
const visitorSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, default: null },
    userType:  { type: String, enum: ['guest', 'user', 'worker', 'admin'], default: 'guest', index: true },

    device:  { type: String, enum: ['mobile', 'tablet', 'desktop', 'bot', 'unknown'], default: 'unknown', index: true },
    browser: { type: String, default: 'unknown' },
    os:      { type: String, default: 'unknown' },
    referrer:{ type: String, default: 'direct' },   // normalised host or 'direct'
    ip:      { type: String, default: null },

    // Geo (resolved from the most recent coordinate we saw for this session)
    lat:      { type: Number, default: null },
    lng:      { type: Number, default: null },
    district: { type: String, default: null, index: true },
    city:     { type: String, default: null, index: true },
    state:    { type: String, default: null, index: true },
    country:  { type: String, default: 'India' },

    // Live page state
    currentPath:   { type: String, default: '/' },
    pageEnteredAt: { type: Date, default: Date.now }, // for "time on current page"
    pageCount:     { type: Number, default: 1 },

    firstSeen: { type: Date, default: Date.now, index: true },
    // No field-level index here — the TTL index below (lastSeen + expireAfterSeconds)
    // already covers it; declaring both triggers a duplicate-index warning.
    lastSeen:  { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Fast "visitors today/week/month" and geo rollups
visitorSessionSchema.index({ firstSeen: -1, userType: 1 });
visitorSessionSchema.index({ city: 1, firstSeen: -1 });
// Auto-expire 90 days after last activity
visitorSessionSchema.index({ lastSeen: 1 }, { expireAfterSeconds: NINETY_DAYS });

/* SearchEvent (demand intelligence + unmet demand) */
const searchEventSchema = new mongoose.Schema(
  {
    sessionId: { type: String, default: null, index: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, default: null },
    userType:  { type: String, enum: ['guest', 'user', 'worker', 'admin'], default: 'guest' },
    device:    { type: String, default: 'unknown' },

    category: { type: String, required: true, index: true }, // service code / name searched
    query:    { type: String, default: null },               // raw text, optional

    lat:      { type: Number, default: null },
    lng:      { type: Number, default: null },
    bucket:   { type: String, default: null, index: true },  // "lat:lng" 2-dp, matches demand buckets
    district: { type: String, default: null, index: true },
    city:     { type: String, default: null, index: true },
    state:    { type: String, default: null, index: true },

    // 'served'      → at least one serviceable worker/coverage found
    // 'no_service'  → user saw "No Service Available" (the unmet-demand signal)
    result: { type: String, enum: ['served', 'no_service'], default: 'served', index: true },
  },
  { timestamps: true }
);

// Trending / most-searched / growth queries
searchEventSchema.index({ category: 1, createdAt: -1 });
searchEventSchema.index({ result: 1, createdAt: -1 });
searchEventSchema.index({ result: 1, city: 1, category: 1 });   // unmet demand by area+category
searchEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: NINETY_DAYS });

const VisitorSession = mongoose.model('VisitorSession', visitorSessionSchema);
const SearchEvent    = mongoose.model('SearchEvent', searchEventSchema);

module.exports = { VisitorSession, SearchEvent };
