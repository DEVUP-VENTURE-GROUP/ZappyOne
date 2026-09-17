const mongoose = require('mongoose');

/**
 * Repair catalog — what actually gets DONE to the device.
 *
 * Deliberately separate from Problem (the symptom). One symptom can resolve to
 * several repairs, and one repair can resolve several symptoms — a many-to-many
 * that the old single `service` code could not express.
 *
 * Pricing mode is declared per repair rather than globally, because the three
 * cases are genuinely different commercial promises:
 *   fixed     — we know the price before we see the device
 *   range     — price depends on part quality/provider, shown as a band
 *   diagnosis — no honest price exists until someone opens the device
 */

const PRICING_MODES = ['fixed', 'range', 'diagnosis_required'];
const { SERVICE_MODES } = require('../service-modes');

/**
 * Parts a repair may consume. `required` distinguishes the part that defines
 * the repair (a screen for a screen replacement) from optional consumables
 * (adhesive, thermal paste) that not every job needs.
 */
const partRequirementSchema = new mongoose.Schema(
  {
    componentCode: { type: String, required: true, lowercase: true, trim: true },
    required: { type: Boolean, default: true },
    quantity: { type: Number, default: 1, min: 1 },
    notes: { type: String, default: '' },
  },
  { _id: false },
);

const repairSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    vertical: { type: String, required: true, lowercase: true, index: true },

    /** Symptoms this repair can resolve. Drives problem → repair recommendation. */
    problemCodes: { type: [String], default: [], index: true },

    /**
     * Where this repair is offered. Empty = everywhere.
     *
     * Populated when a repair enters the catalog from one provider in one
     * city: their local trade is real, but it is not yet evidence that the
     * job exists nationally, and offering it to a customer nobody can serve
     * is worse than not listing it.
     */
    cityCodes: { type: [String], default: [], index: true },

    /**
     * Model applicability. Empty = every model of the vertical. Populated =
     * restricted (e.g. back-glass laser separation only on glass-backed models).
     */
    appliesToBrandCodes: { type: [String], default: [] },
    appliesToModelCodes: { type: [String], default: [] },

    partRequirements: { type: [partRequirementSchema], default: [] },

    /** Minimum skill level a provider must hold to be offered this repair. */
    minSkillLevel: { type: Number, default: 1, min: 1 },

    /** Which fulfilment modes are permitted. Admin-controlled per spec §21. */
    allowedServiceModes: {
      type: [String],
      enum: SERVICE_MODES,
      default: ['doorstep', 'workshop'],
    },

    estimatedDurationMin: { type: Number, default: 60, min: 1 },

    /**
     * When true the customer never sees a firm price up-front — the booking is
     * created in the diagnosis-first flow and a Quote must be approved before
     * any work starts. Also forced on when the Problem requires diagnosis.
     */
    requiresDiagnosis: { type: Boolean, default: false },

    /**
     * `range` is retained ONLY so repairs created before this rule still load.
     * Nothing produces it any more and nothing should be created with it: a
     * customer is never shown "₹1,400–₹1,800". Either a provider has named a
     * price for the exact job and quality, or the job needs inspecting first
     * and is quoted honestly afterwards. A range is neither, and it reads as a
     * guess at the moment the customer is deciding whether to trust us.
     */
    pricingMode: { type: String, enum: PRICING_MODES, default: 'fixed', index: true },

    /** Default warranty applied to completed jobs; overridable per part/provider. */
    warrantyDays: { type: Number, default: 0, min: 0 },
    warrantyTerms: { type: String, default: '' },

    /** QA checklist codes that must pass before completion (spec §27). */
    qaChecklistCodes: { type: [String], default: [] },

    /**
     * An add-on is bought ALONGSIDE a primary repair, never instead of one.
     *
     * "Deep disinfection" is a real, separately-priced piece of work, but
     * nobody books a technician to disinfect a tank they are not also having
     * cleaned. Marking it here keeps it out of the main problem->repair
     * results while still letting a provider price it and a customer add it.
     */
    isAddOn: { type: Boolean, default: false, index: true },

    /**
     * Which primary repairs this add-on may attach to. Empty means "any
     * repair in this vertical" — the common case; a restriction is the
     * exception (sludge extraction belongs to a cleaning job, not a lid
     * replacement).
     */
    eligibleForRepairCodes: { type: [String], default: [] },

    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

repairSchema.index({ vertical: 1, isActive: 1, displayOrder: 1 });
repairSchema.index({ problemCodes: 1, isActive: 1 });
repairSchema.index({ name: 'text', description: 'text' });

/** True when this repair cannot be honestly priced before inspection. */
repairSchema.methods.needsDiagnosis = function needsDiagnosis() {
  return this.requiresDiagnosis || this.pricingMode === 'diagnosis_required';
};

// Unique per vertical — see problem.model.js for the reasoning.
repairSchema.index({ vertical: 1, code: 1 }, { unique: true });

const Repair = mongoose.model('Repair', repairSchema);

module.exports = { Repair, PRICING_MODES, SERVICE_MODES };
