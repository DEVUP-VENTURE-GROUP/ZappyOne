const mongoose = require('mongoose');

/**
 * Problem taxonomy — what the CUSTOMER reports (a symptom), never what gets done.
 *
 * This is the entity the codebase was missing entirely. Previously a customer
 * picked `screen_replacement` (a REPAIR) directly, which hard-codes the
 * assumption "cracked screen = new display". That assumption is wrong often
 * enough to be a real commercial problem: a cracked outer glass with a working
 * panel is a glass-only job at a fraction of the price.
 *
 * So: Problem is a symptom. It maps to a DiagnosticFlow. The flow's answers
 * resolve to one or more candidate Repairs. Nothing here decides the repair.
 *
 * Categories and problems are SEED DATA, not application constants — admin can
 * add, rename, reorder, retire and re-map them without a deployment.
 */

const problemCategorySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    // Customer-facing grouping label, e.g. "Display", "Battery & Power".
    description: { type: String, default: '' },
    icon: { type: String, default: '' },

    // Which vertical this belongs to ('mobile', 'laptop', …). Kept as a code so
    // the same taxonomy engine serves every future category without a new model.
    vertical: { type: String, required: true, lowercase: true, index: true },
    /**
     * Thumbnail for the customer catalog. Optional — a category with no picture
     * renders as a tinted icon tile rather than a broken image.
     */
    imageUrl: { type: String, default: '' },

    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

problemCategorySchema.index({ vertical: 1, isActive: 1, displayOrder: 1 });

const problemSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    /**
     * A picture of the symptom, or a short clip of it happening.
     *
     * "Screen flickering" and "lines on the display" are the same few words to
     * a customer until they see one. A still covers most symptoms; some — a
     * flicker, a rattle, a boot loop — only read as video. Both are allowed and
     * whichever is set gets shown, because forcing a flicker into a photograph
     * helps nobody choose correctly.
     */
    imageUrl: { type: String, default: '' },
    videoUrl: { type: String, default: '' },

    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProblemCategory', required: true, index: true },
    categoryCode: { type: String, required: true, lowercase: true, index: true },
    vertical: { type: String, required: true, lowercase: true, index: true },

    /**
     * The diagnostic flow that turns this symptom into a repair recommendation.
     * Null means "no triage configured yet" — the booking is then forced down
     * the diagnosis-required path rather than guessing a repair.
     */
    diagnosticFlowCode: { type: String, default: null, index: true },

    /**
     * Repairs this symptom can plausibly resolve to. Advisory only — used to
     * pre-warm provider matching and to show the customer a price band before
     * diagnosis. The diagnostic flow, not this list, picks the actual repair.
     */
    candidateRepairCodes: { type: [String], default: [] },

    /**
     * Some symptoms can never be honestly priced up-front (water damage,
     * motherboard failure, data recovery). Setting this forces the
     * diagnosis-required pricing mode regardless of what a repair says.
     */
    requiresDiagnosis: { type: Boolean, default: false },

    severity: { type: String, enum: ['low', 'normal', 'high', 'critical'], default: 'normal' },

    // Restrict to particular models when a symptom is model-specific
    // (e.g. "green line" is an OLED-era issue). Empty = applies to all.
    appliesToModelCodes: { type: [String], default: [] },

    /**
     * Restrict to particular PRODUCT TYPES within the vertical. Empty = all.
     *
     * A coarser scope than appliesToModelCodes and a necessary one: in
     * two-wheelers a scooter has a CVT and no chain, a motorcycle has a chain
     * and no CVT, and an electric has neither an engine nor a gearbox. Listing
     * the type is how a scooter rider is never asked about chain slack, without
     * naming every model ever made — or branching on the type in code (§91).
     */
    appliesToProductTypeCodes: { type: [String], default: [], index: true },

    /**
     * Restrict to particular fuels or powertrains. Empty = all.
     *
     * A THIRD, independent scope — and it has to be independent, because for a
     * car the body and the powertrain vary separately: a Swift is sold as
     * petrol AND as CNG, a Nexon as petrol, diesel AND electric. "CNG not
     * switching" is a real fault on one of those and meaningless on the others,
     * while "boot lock stuck" applies to all of them.
     *
     * Folding fuel into the product type the way two-wheelers do (where
     * `electric_scooter` is its own type) would multiply the body types by the
     * fuels and produce a dozen near-duplicate categories.
     */
    appliesToFuelTypes: { type: [String], default: [], index: true },

    displayOrder: { type: Number, default: 0 },
    isPopular: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

problemSchema.index({ vertical: 1, categoryCode: 1, isActive: 1, displayOrder: 1 });
problemSchema.index({ vertical: 1, isPopular: 1, isActive: 1 });
problemSchema.index({ name: 'text', description: 'text' });

/**
 * Codes are unique per VERTICAL, not globally: "display" is a legitimate
 * category for both phones and laptops, and a platform-wide constraint would
 * mean the second vertical to be seeded silently fails.
 */
problemCategorySchema.index({ vertical: 1, code: 1 }, { unique: true });
problemSchema.index({ vertical: 1, code: 1 }, { unique: true });

const ProblemCategory = mongoose.model('ProblemCategory', problemCategorySchema);
const Problem = mongoose.model('Problem', problemSchema);

module.exports = { ProblemCategory, Problem };