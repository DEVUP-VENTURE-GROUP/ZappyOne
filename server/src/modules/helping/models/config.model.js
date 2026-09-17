/**
 * Helping Services configuration — one row per service type.
 *
 * §51 is the requirement this file answers: "No business-critical value should
 * require frontend deployment to change." Every fee, slab, limit, included
 * allowance and restricted category lives here, as DATA, and the pricing
 * engine reads it per request. There is no fee constant anywhere in the
 * codebase for this category, and the seed sets starting values an operator
 * is expected to tune.
 *
 * The distance ladder deserves a note. It is stored as an ordered array of
 * slabs rather than four named fields, because "0–2 km, 2–5 km, 5–10 km, 10+"
 * is one city's answer, not a law — another city may want six bands or two,
 * and that must not need a migration.
 */

const mongoose = require('mongoose');

/** The four things a customer can ask a helper to do. */
const SERVICE_TYPES = ['shopping', 'pickup', 'return', 'exchange'];

/**
 * How the item money moves (§8). Which of these are OFFERED is configuration;
 * which one a given task uses is chosen at booking.
 */
const PAYMENT_MODELS = ['customer_preauth', 'worker_advance', 'prepaid_wallet'];

const distanceSlabSchema = new mongoose.Schema(
  {
    /** Inclusive lower bound, exclusive upper. `toKm: null` means "and beyond". */
    fromKm: { type: Number, required: true, min: 0 },
    toKm: { type: Number, default: null },
    feePaise: { type: Number, required: true, min: 0 },
    /**
     * Beyond a point, a flat slab stops being honest — a 40 km errand is a
     * quote, not a price. A slab marked this way refuses to auto-price.
     */
    requiresQuote: { type: Boolean, default: false },
  },
  { _id: false },
);

const helpingConfigSchema = new mongoose.Schema(
  {
    serviceType: {
      type: String, enum: SERVICE_TYPES, required: true, index: true,
    },

    /* ── The ZappyOne service charge (§52). Item cost is never in here. ── */

    baseFeePaise: { type: Number, default: 0, min: 0 },
    distanceSlabs: { type: [distanceSlabSchema], default: [] },

    /** Waiting is free for a while, then metered — §21. */
    freeWaitingMinutes: { type: Number, default: 10, min: 0 },
    waitingPerMinutePaise: { type: Number, default: 0, min: 0 },

    /** The first stop is the task; each extra one is extra work — §15. */
    includedStops: { type: Number, default: 1, min: 1 },
    additionalStopFeePaise: { type: Number, default: 0, min: 0 },
    maxStops: { type: Number, default: 3, min: 1 },

    /** Charged per block once the estimated duration is exceeded. */
    timeExtensionBlockMinutes: { type: Number, default: 30, min: 1 },
    timeExtensionFeePaise: { type: Number, default: 0, min: 0 },

    specialHandlingFeePaise: { type: Number, default: 0, min: 0 },

    /* ── Platform economics. Same shape as the repair engine's config. ── */

    /** Taken from the SERVICE CHARGE only — never from item money (§32). */
    commissionPct: { type: Number, default: 10, min: 0, max: 100 },
    platformFeePaise: { type: Number, default: 0, min: 0 },
    taxPct: { type: Number, default: 0, min: 0, max: 100 },

    /* ── Item money controls (§35). ── */

    allowedPaymentModels: {
      type: [String], enum: PAYMENT_MODELS, default: ['customer_preauth'],
    },
    /**
     * The cap that stops this category quietly turning helpers into lenders.
     * A purchase above it must be funded by the customer up front.
     */
    maxWorkerAdvancePaise: { type: Number, default: 100000, min: 0 },
    /** Ceiling on what a single task may be authorised to spend at all. */
    maxItemBudgetPaise: { type: Number, default: 1000000, min: 0 },

    /**
     * How far over an item's approved price the helper may go without asking.
     * Zero means "always ask", which is the honest default (§61).
     */
    priceTolerancePct: { type: Number, default: 0, min: 0, max: 100 },

    /* ── Task shape ── */

    maxItems: { type: Number, default: 20, min: 1 },
    defaultDurationMinutes: { type: Number, default: 45, min: 1 },

    /**
     * Categories a helper must never buy or carry (§41). Stored as codes so
     * admin edits the list without a deploy; the booking path refuses any task
     * whose declared category is in here.
     */
    restrictedItemCategories: { type: [String], default: [] },

    /** Customer-facing copy that must not be softened into a promise (§60). */
    disclaimer: { type: String, default: '' },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

helpingConfigSchema.index({ serviceType: 1, isActive: 1 }, { unique: true });

/**
 * Resolve the distance fee for a trip.
 *
 * Returns `{ feePaise, requiresQuote }` — the second matters because a trip
 * past the last priced slab must stop the flow and ask an operator, rather
 * than silently charging the last known number for a journey twice as long.
 */
helpingConfigSchema.methods.distanceFeeFor = function distanceFeeFor(km) {
  const distance = Number(km) || 0;
  const slabs = [...(this.distanceSlabs || [])].sort((a, b) => a.fromKm - b.fromKm);
  for (const slab of slabs) {
    const under = slab.toKm == null || distance < slab.toKm;
    if (distance >= slab.fromKm && under) {
      return { feePaise: slab.feePaise, requiresQuote: !!slab.requiresQuote };
    }
  }
  // Past every configured slab: no honest price exists yet.
  return { feePaise: 0, requiresQuote: true };
};

const HelpingConfig = mongoose.model('HelpingConfig', helpingConfigSchema);

module.exports = { HelpingConfig, SERVICE_TYPES, PAYMENT_MODELS };
