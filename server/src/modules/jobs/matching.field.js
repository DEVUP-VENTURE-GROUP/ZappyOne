const mongoose = require('mongoose');

/**
 * Finding someone for this job (jobs/waves, jobs/fast-assign): when each step
 * fired, so each fires once, and who the job was put in front of.
 */
module.exports = new mongoose.Schema({
  offlineWaveAt: { type: Date, default: null },
  slowNoticeAt: { type: Date, default: null },
  /** Broadcast (repairs): the pros it was offered to at once; the first to claim it takes it. */
  offeredTo: { type: [String], default: [] },
  broadcastAt: { type: Date, default: null },
  widenedAt: { type: Date, default: null },
  /** Taken by a pro with auto-accept on (their own choice; cancelling it pauses auto-accept). */
  autoAcceptedAt: { type: Date, default: null },
  autoAcceptedBy: { type: String, default: null }, // 'kind:id', so only that pro's auto-accept pauses
  /** Claimed off a broadcast (a shop then has its usual time to give it to a technician). */
  claimedAt: { type: Date, default: null },
  /** Auto-accept was tried: at once (near), and at the deadline (wider). */
  autoTriedAt: { type: Date, default: null },
  autoWideTriedAt: { type: Date, default: null },
  /** The customer picked this provider themselves (they get a longer first look). */
  chosenByCustomer: { type: Boolean, default: false },
}, { _id: false });
