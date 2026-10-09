const mongoose = require('mongoose');

/**
 * ShieldConfig — persists the fee schedule, harm scores, and fund split.
 * Only one document is ever active (isActive: true).
 * History is kept (isActive: false) for audit.
 */
const shieldConfigSchema = new mongoose.Schema(
  {
    // Fee in paise: feeSchedule[stage][0|1|2] = paise
    // Index 0 = 1st cancel in 30 days, 1 = 2nd, 2 = 3rd+
    feeSchedule: {
      created:    { type: [Number], default: [0,    0,    0   ] },
      // Free while nobody has accepted — fees start once someone accepts.
      searching:  { type: [Number], default: [0,    0,    0   ] },
      assigned:   { type: [Number], default: [2000, 3000, 4000] },
      on_the_way: { type: [Number], default: [3000, 4000, 5000] },
      arrived:    { type: [Number], default: [5000, 6000, 7500] },
    },

    harmScores: {
      created:    { type: Number, default: 0 },
      searching:  { type: Number, default: 1 },
      assigned:   { type: Number, default: 2 },
      on_the_way: { type: Number, default: 3 },
      arrived:    { type: Number, default: 5 },
    },

    splitWorkerPct:   { type: Number, default: 85 },
    splitPlatformPct: { type: Number, default: 15 },

    isActive:  { type: Boolean, default: true, index: true },
    version:   { type: Number, default: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ShieldConfig', shieldConfigSchema);
