const mongoose = require('mongoose');

/**
 * Service categories — the top-level buckets the catalog groups services into
 * (Phone Repair, Car Services, Cleaning, … and any new vertical an admin adds).
 *
 * This is the DB source of truth for "which categories exist" and their
 * presentation (label, theme, icon, brand list). The frontend builds its
 * grouping (serviceCatalogGroups) and per-category theming from these records,
 * so an admin can spin up a brand-new category — its own tab, colours and brand
 * picker — with no code change. A service joins a category by setting its
 * `category` field to this `key` (see ServiceCatalog.category + the admin
 * service editor). `codePrefixes` keeps legacy code-prefix matches working
 * (e.g. laptop_/car_) until every service carries the right `category`.
 */
const categorySchema = new mongoose.Schema(
  {
    // Stable key — equals the value stored on ServiceCatalog.category. Lowercase,
    // no spaces, so it is safe in URLs and as a matcher key.
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: /^[a-z0-9_]+$/,
    },
    // Customer-facing pill/tab label; worker portal label defaults to it.
    customerLabel: { type: String, required: true, trim: true },
    workerLabel:   { type: String, default: '', trim: true },

    // Lucide icon name the frontend maps to a component (falls back to a default).
    icon: { type: String, default: '' },

    // Colour theme — drives the catalog surface via CSS custom properties.
    theme: {
      accent: { type: String, default: '#2563EB' },
      deep:   { type: String, default: '#1E3A8A' },
      tint:   { type: String, default: '#EFF6FF' },
      soft:   { type: String, default: '#DBEAFE' },
      glow:   { type: String, default: 'rgba(37,99,235,0.20)' },
    },

    // Device categories (phone/laptop/…) show a brand picker at booking. `brands`
    // are the chips; `brandCategory` maps to the Brand collection for model lookup.
    brands:        { type: [String], default: [] },
    brandCategory: { type: String, default: '', trim: true },

    // The ServiceCatalog.category values that belong to this group. Usually just
    // [key], but some legacy groups map a different stored value (e.g. group
    // 'family' owns category 'helper', 'smart' owns 'other', 'commercial' owns
    // 'vehicle'). Empty → falls back to [key]. A new admin category needs nothing
    // here: setting a service's category to the group key is enough.
    matchCategories: { type: [String], default: [] },

    // Legacy code-prefix fallbacks so services whose code starts with these still
    // land here even if their `category` field hasn't been backfilled yet.
    codePrefixes: { type: [String], default: [] },

    // Whether it appears as a top-level customer catalog pill (some verticals are
    // grouped under a broader tab but still exist as their own worker skill group).
    showInCustomer: { type: Boolean, default: true },

    sortOrder: { type: Number, default: 0 },
    isActive:  { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Display order: by sortOrder then label.
categorySchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('Category', categorySchema);
