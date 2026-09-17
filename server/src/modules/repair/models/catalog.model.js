const mongoose = require('mongoose');

/**
 * Deep product catalog — the layers between a brand and an exact repairable unit.
 *
 * Mobile gets away with Brand → Model because an "iPhone 15 Pro" is one thing.
 * Laptops do not: "HP Pavilion" spans hundreds of machines whose panels,
 * batteries and boards are mutually incompatible, so ordering a part against a
 * family name is how you ship the wrong screen. The chain is therefore:
 *
 *   Brand → ProductType → ProductFamily → Series → Model → Configuration
 *
 * Every layer between Brand and Model is OPTIONAL. Mobile continues to use
 * Brand → Model with these left null, so this is additive rather than a
 * migration — §91's requirement not to disturb the working mobile vertical.
 *
 * Configuration is where laptop compatibility actually resolves: two units of
 * the same model with different panels take different parts, and the booking
 * records which one the customer owns.
 */

/* ─── Product type — Laptop, Gaming Laptop, MacBook, Chromebook … ───────── */

const productTypeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    /** Which vertical this belongs to — 'laptop', 'mobile', 'tablet', … */
    vertical: { type: String, required: true, lowercase: true, index: true },
    description: { type: String, default: '' },
    iconUrl: { type: String, default: '' },
    displayOrder: { type: Number, default: 0 },
    isPopular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// A code is unique WITHIN a vertical, not globally — 'standard' can legitimately
// mean different things to laptops and tablets.
productTypeSchema.index({ vertical: 1, code: 1 }, { unique: true });

/* ─── Product family — Pavilion, ThinkPad, ROG, MacBook Air … ───────────── */

const productFamilySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    vertical: { type: String, required: true, lowercase: true, index: true },
    brandCode: { type: String, required: true, lowercase: true, index: true },
    productTypeCode: { type: String, default: null, lowercase: true, index: true },
    description: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    displayOrder: { type: Number, default: 0 },
    isPopular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

productFamilySchema.index({ vertical: 1, brandCode: 1, code: 1 }, { unique: true });

/* ─── Series — Pavilion 15, ThinkPad E Series, ROG Strix … ──────────────── */

const productSeriesSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    vertical: { type: String, required: true, lowercase: true, index: true },
    brandCode: { type: String, required: true, lowercase: true, index: true },
    familyCode: { type: String, default: null, lowercase: true, index: true },
    description: { type: String, default: '' },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

productSeriesSchema.index({ vertical: 1, brandCode: 1, code: 1 }, { unique: true });

/* ─── Configuration — the exact build the customer actually owns ────────── */

/**
 * A configuration pins the variable hardware on one model.
 *
 * This is the level laptop part compatibility genuinely resolves at: the same
 * ThinkPad model ships with FHD and touch panels that are not interchangeable,
 * and the only way to avoid sending a technician with the wrong screen is to
 * record which one the customer has.
 */
const deviceConfigurationSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, lowercase: true, trim: true },
    /** Human label, e.g. "i5-1235U / 16GB / 512GB / FHD Touch". */
    name: { type: String, required: true, trim: true },
    vertical: { type: String, required: true, lowercase: true, index: true },
    modelId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeviceModel', required: true, index: true },
    modelCode: { type: String, required: true, lowercase: true, index: true },

    cpu: { type: String, default: '' },
    gpu: { type: String, default: '' },
    ramGb: { type: Number, default: null },
    ramType: { type: String, default: '' },          // DDR4 / DDR5 / LPDDR5
    storageGb: { type: Number, default: null },
    storageType: { type: String, default: '' },      // NVMe / SATA SSD / HDD
    /** Panel spec, which is what makes screen parts config-specific. */
    displaySize: { type: String, default: '' },
    displayResolution: { type: String, default: '' },
    displayPanel: { type: String, default: '' },      // IPS / TN / OLED
    displayRefreshHz: { type: Number, default: null },
    isTouch: { type: Boolean, default: false },

    partNumber: { type: String, default: '' },
    launchYear: { type: Number, default: null },

    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

deviceConfigurationSchema.index({ modelCode: 1, code: 1 }, { unique: true });

/**
 * The subset of a configuration that decides which parts fit.
 *
 * Used by compatibility checks so a part is matched against the panel/memory
 * actually installed rather than against the model name alone.
 */
deviceConfigurationSchema.methods.fitmentKey = function fitmentKey() {
  return {
    ramType: this.ramType || null,
    storageType: this.storageType || null,
    displaySize: this.displaySize || null,
    displayResolution: this.displayResolution || null,
    displayPanel: this.displayPanel || null,
    displayRefreshHz: this.displayRefreshHz || null,
    isTouch: !!this.isTouch,
  };
};

/* ─── Model identification requests (§7) ───────────────────────────────── */

/**
 * "I don't know my model."
 *
 * Laptop owners routinely cannot identify their machine, and guessing is worse
 * than asking: the wrong model produces the wrong part. This captures whatever
 * the customer CAN provide so a human can identify it, rather than blocking the
 * booking or silently assuming a match.
 */
const modelIdentificationRequestSchema = new mongoose.Schema(
  {
    vertical: { type: String, required: true, lowercase: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    brandCode: { type: String, default: '', lowercase: true },
    brandName: { type: String, default: '' },
    modelText: { type: String, default: '' },
    productNumber: { type: String, default: '' },
    serialNumber: { type: String, default: '' },
    notes: { type: String, default: '', maxlength: 1000 },
    imageUrls: { type: [String], default: [] },

    status: {
      type: String,
      enum: ['pending', 'identified', 'unidentifiable', 'rejected'],
      default: 'pending',
      index: true,
    },
    /** Set once someone works out what the machine actually is. */
    resolvedModelId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeviceModel', default: null },
    resolvedConfigurationId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeviceConfiguration', default: null },
    reviewedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
  },
  { timestamps: true },
);

modelIdentificationRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = {
  ProductType: mongoose.model('ProductType', productTypeSchema),
  ProductFamily: mongoose.model('ProductFamily', productFamilySchema),
  ProductSeries: mongoose.model('ProductSeries', productSeriesSchema),
  DeviceConfiguration: mongoose.model('DeviceConfiguration', deviceConfigurationSchema),
  ModelIdentificationRequest: mongoose.model('ModelIdentificationRequest', modelIdentificationRequestSchema),
};
