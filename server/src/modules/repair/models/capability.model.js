const mongoose = require('mongoose');
const { SERVICE_MODES } = require('../service-modes');

/**
 * Skill levels + provider capability matrix.
 *
 * The old model expressed capability as a flat string array on Worker
 * (`skills: ['screen_replacement']`), which cannot answer the question dispatch
 * actually needs to ask: "can THIS provider do THIS repair on THIS model, with
 * a part of THIS quality, in THIS service mode, in THIS area?"
 *
 * Capability is therefore a row per (provider, repair) with the brand/model
 * scope attached, rather than a boolean per category. An empty scope array
 * means "all" — so a generalist stays one row, while a specialist who only
 * does Apple displays is expressed exactly.
 *
 * Skill levels are seed data, not constants: admin defines the ladder and which
 * rung each repair requires, and can demand verification before a provider is
 * allowed to claim the higher rungs.
 */

const skillLevelSchema = new mongoose.Schema(
  {
    level: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    vertical: { type: String, required: true, lowercase: true, index: true },

    /**
     * When true a provider cannot self-assign this level — admin must approve,
     * optionally against uploaded evidence (spec §16).
     */
    requiresVerification: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

const capabilitySchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },

    vertical: { type: String, required: true, lowercase: true, index: true },
    repairCode: { type: String, required: true, lowercase: true, index: true },

    /** Scope. Empty array = no restriction (handles every brand / model). */
    brandCodes: { type: [String], default: [] },
    modelCodes: { type: [String], default: [] },

    /** Part grades this provider is willing and equipped to fit. Empty = any. */
    qualityCodes: { type: [String], default: [] },

    serviceModes: {
      type: [String],
      enum: SERVICE_MODES,
      default: ['doorstep'],
    },

    skillLevel: { type: Number, default: 1, min: 1 },

    /**
     * Set by admin when the claimed skill level needed verification. Dispatch
     * refuses capabilities that are pending on a verification-gated level.
     */
    verificationStatus: {
      type: String,
      enum: ['not_required', 'pending', 'approved', 'rejected'],
      default: 'not_required',
      index: true,
    },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    verifiedAt: { type: Date, default: null },
    evidenceUrls: { type: [String], default: [] },

    /** Provider's own turnaround claim, used for ETA ranking. */
    estimatedDurationMin: { type: Number, default: null },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// A level number is scoped to its vertical — laptop L2 and mobile L2 are
// different skill sets and must be able to coexist.
skillLevelSchema.index({ vertical: 1, level: 1 }, { unique: true });

capabilitySchema.index({ shopId: 1, repairCode: 1 }, { unique: true, partialFilterExpression: { shopId: { $type: 'objectId' } } });
capabilitySchema.index({ workerId: 1, repairCode: 1 }, { unique: true, partialFilterExpression: { workerId: { $type: 'objectId' } } });
capabilitySchema.index({ repairCode: 1, isActive: 1, verificationStatus: 1 });

/**
 * Does this capability cover a concrete job? Empty scope arrays mean "all",
 * which is why each check short-circuits on length rather than on inclusion.
 */
capabilitySchema.methods.covers = function covers({ brandCode, modelCode, qualityCode, serviceMode }) {
  if (!this.isActive) return false;
  if (this.verificationStatus === 'pending' || this.verificationStatus === 'rejected') return false;
  if (brandCode && this.brandCodes.length && !this.brandCodes.includes(brandCode)) return false;
  if (modelCode && this.modelCodes.length && !this.modelCodes.includes(modelCode)) return false;
  if (qualityCode && this.qualityCodes.length && !this.qualityCodes.includes(qualityCode)) return false;
  if (serviceMode && !this.serviceModes.includes(serviceMode)) return false;
  return true;
};

const SkillLevel = mongoose.model('SkillLevel', skillLevelSchema);
const ProviderCapability = mongoose.model('ProviderCapability', capabilitySchema);

module.exports = { SkillLevel, ProviderCapability };
