const subscriptionService = require('../../subscription/subscription.service');
const { getActiveConfig, PRICING_HARD_LIMITS } = require('./config.service');



// --- Earnings (commission split) ---

/**
 * Calculate the platform/worker earnings split for a completed order.
 * Honors a per-worker commission delta from the WORKER_PRO subscription.
 */
async function calculateEarnings({ totalPaise, workerId, snapshotCommissionRate }) {
  const cfg = await getActiveConfig();
  // Use the rate locked at order creation (snapshotCommissionRate) if present.
  // This ensures admin rate changes never retroactively alter in-flight payouts.
  let commissionRate = snapshotCommissionRate ?? cfg.commissionRate;

  if (workerId) {
    // Pro worker discount still applies on top of snapshot rate.
    const effects = await subscriptionService.getEffects({ kind: 'worker', id: workerId });
    if (typeof effects.commissionDelta === 'number') {
      commissionRate = Math.max(0, commissionRate + effects.commissionDelta);
    }
  }
  // Hard cap always enforced regardless of snapshot.
  commissionRate = Math.min(commissionRate, PRICING_HARD_LIMITS.commissionRate.max);

  const platformPaise = Math.round(totalPaise * commissionRate);
  const workerPaise = totalPaise - platformPaise;
  return {
    totalPaise,
    platformPaise,
    workerPaise,
    commissionRate,
  };
}

// --- Admin: update active config ---

module.exports = {
  calculateEarnings,
};
