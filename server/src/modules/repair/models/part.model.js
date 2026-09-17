const mongoose = require('mongoose');

/**
 * Part master + part quality grades.
 *
 * Quality is its own configurable entity rather than an enum because the grade
 * names are a commercial promise, not a code detail — and because mislabelling
 * an aftermarket panel as "Genuine" is the single fastest way to lose trust in
 * this category. `isGenuine` is therefore an explicit, admin-controlled flag
 * that pricing and customer-facing copy read from, not something inferred from
 * a tier name.
 */

const partQualitySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    /**
     * True ONLY for parts genuinely sourced through the OEM channel. Never set
     * this on a compatible part to make it look better — customer-facing labels
     * and warranty defaults key off it.
     */
    isGenuine: { type: Boolean, default: false },

    /** Higher = better grade. Used for sorting and for "recommended" defaults. */
    rank: { type: Number, default: 0, index: true },

    defaultWarrantyDays: { type: Number, default: 0, min: 0 },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

const supplierSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    contactName: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    gstNumber: { type: String, default: '' },
    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

const partSchema = new mongoose.Schema(
  {
    /** Stable internal identifier, unique across the catalog. */
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    /** What kind of component this is — matches Repair.partRequirements.componentCode. */
    componentCode: { type: String, required: true, lowercase: true, index: true },

    /** Vertical this part belongs to — a laptop panel is not a phone panel. */
    vertical: { type: String, default: 'mobile', lowercase: true, index: true },

    brandCode: { type: String, required: true, lowercase: true, index: true },
    /** Models this part physically fits. Empty = fits every model of the brand. */
    compatibleModelCodes: { type: [String], default: [], index: true },
    /**
     * Configurations this part fits, when fitment is narrower than the model.
     * Empty = fits every configuration of the listed models. Laptops populate
     * this because one model ships with panels that are not interchangeable.
     */
    compatibleConfigurationCodes: { type: [String], default: [], index: true },

    /** Manufacturer identity — what a technician actually cross-references. */
    manufacturer: { type: String, default: '' },
    manufacturerPartNumber: { type: String, default: '', index: true },

    qualityCode: { type: String, required: true, lowercase: true, index: true },

    /**
     * Typed specification (§16–§19).
     *
     * Stored as discrete fields rather than a free-form blob so fitment can be
     * QUERIED — "a DDR5 SO-DIMM at 4800MHz" has to be a filter, not a string a
     * human eyeballs. Every field is optional; `specType` says which subset is
     * meaningful, and validation is enforced per type below.
     */
    spec: {
      specType: {
        type: String,
        enum: ['display', 'ram', 'storage', 'battery', 'keyboard', 'adapter', 'generic'],
        default: 'generic',
        index: true,
      },

      // Display (§16) — none of these are interchangeable across a model line.
      sizeInches: { type: Number, default: null },
      resolution: { type: String, default: '' },        // 1920x1080
      panelType: { type: String, default: '' },          // IPS / TN / OLED
      refreshHz: { type: Number, default: null },
      connector: { type: String, default: '' },          // 30-pin eDP / 40-pin
      isTouch: { type: Boolean, default: null },
      brightnessNits: { type: Number, default: null },
      mounting: { type: String, default: '' },           // with-frame / bare panel

      // RAM (§17)
      ddrGeneration: { type: String, default: '' },      // DDR4 / DDR5 / LPDDR5
      capacityGb: { type: Number, default: null },
      speedMhz: { type: Number, default: null },
      formFactor: { type: String, default: '' },         // SO-DIMM / soldered

      // Storage (§18)
      storageInterface: { type: String, default: '' },   // nvme / sata
      m2Size: { type: String, default: '' },             // 2242 / 2260 / 2280
      pcieGen: { type: String, default: '' },            // Gen3 / Gen4

      // Battery (§19)
      voltage: { type: Number, default: null },
      capacityMah: { type: Number, default: null },
      capacityWh: { type: Number, default: null },
      batteryModelNumber: { type: String, default: '' },
    },

    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },
    supplierSku: { type: String, default: '' },

    /**
     * Reference economics in paise. Provider-specific costs live on
     * ProviderInventory — these are the platform's benchmark figures used for
     * deviation checks and for seeding a provider's first price.
     */
    costPaise: { type: Number, default: 0, min: 0 },
    sellingPricePaise: { type: Number, default: 0, min: 0 },

    warrantyDays: { type: Number, default: 0, min: 0 },
    imageUrls: { type: [String], default: [] },

    isActive: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

partSchema.index({ componentCode: 1, brandCode: 1, qualityCode: 1, isActive: 1 });
partSchema.index({ compatibleModelCodes: 1, componentCode: 1, isActive: 1 });
partSchema.index({ vertical: 1, componentCode: 1, isActive: 1 });
partSchema.index({ compatibleConfigurationCodes: 1, isActive: 1 });
// Fitment lookups filter on spec, so the common shapes are indexed.
partSchema.index({ 'spec.specType': 1, 'spec.ddrGeneration': 1, 'spec.formFactor': 1 });
partSchema.index({ 'spec.specType': 1, 'spec.storageInterface': 1, 'spec.m2Size': 1 });
partSchema.index({ name: 'text', sku: 'text', manufacturerPartNumber: 'text' });

/**
 * Fields a spec type cannot be useful without.
 *
 * A "display" with no size or resolution cannot be matched to a machine, and a
 * RAM stick with no generation cannot be matched to a slot — storing them
 * anyway just moves the failure to the technician's hands on the day.
 */
const REQUIRED_SPEC_FIELDS = {
  display: ['sizeInches', 'resolution'],
  ram: ['ddrGeneration', 'capacityGb'],
  storage: ['storageInterface', 'capacityGb'],
  battery: ['capacityWh', 'voltage'],
};

partSchema.pre('validate', function validateSpec(next) {
  const required = REQUIRED_SPEC_FIELDS[this.spec?.specType];
  if (!required) return next();

  const missing = required.filter((f) => this.spec[f] == null || this.spec[f] === '');
  if (missing.length) {
    return next(new Error(
      `A ${this.spec.specType} part needs ${missing.join(' and ')} — without it the part cannot be matched to a device.`,
    ));
  }
  return next();
});

/**
 * Does this part fit the given device?
 *
 * Model and configuration are both checked because laptop fitment is often
 * narrower than the model: an empty compatibility list means "not restricted at
 * this level", NOT "fits anything" — a part restricted by configuration still
 * has to clear that gate.
 */
partSchema.methods.fits = function fits({ modelCode, configurationCode } = {}) {
  const modelOk = this.compatibleModelCodes.length === 0
    || (modelCode && this.compatibleModelCodes.includes(modelCode));
  if (!modelOk) return false;

  const configOk = this.compatibleConfigurationCodes.length === 0
    || (configurationCode && this.compatibleConfigurationCodes.includes(configurationCode));
  return configOk;
};

/** A short human summary — what a technician needs to confirm the right part. */
partSchema.methods.specSummary = function specSummary() {
  const s = this.spec || {};
  switch (s.specType) {
    case 'display':
      return [
        s.sizeInches && `${s.sizeInches}"`,
        s.resolution, s.panelType,
        s.refreshHz && `${s.refreshHz}Hz`,
        s.isTouch ? 'Touch' : null,
        s.connector,
      ].filter(Boolean).join(' · ');
    case 'ram':
      return [s.ddrGeneration, s.capacityGb && `${s.capacityGb}GB`, s.speedMhz && `${s.speedMhz}MHz`, s.formFactor]
        .filter(Boolean).join(' · ');
    case 'storage':
      return [s.storageInterface?.toUpperCase(), s.capacityGb && `${s.capacityGb}GB`, s.m2Size, s.pcieGen]
        .filter(Boolean).join(' · ');
    case 'battery':
      return [s.capacityWh && `${s.capacityWh}Wh`, s.voltage && `${s.voltage}V`, s.batteryModelNumber]
        .filter(Boolean).join(' · ');
    default:
      return this.manufacturerPartNumber || '';
  }
};

const PartQuality = mongoose.model('PartQuality', partQualitySchema);
const Supplier = mongoose.model('Supplier', supplierSchema);
const Part = mongoose.model('Part', partSchema);

module.exports = { PartQuality, Supplier, Part };
