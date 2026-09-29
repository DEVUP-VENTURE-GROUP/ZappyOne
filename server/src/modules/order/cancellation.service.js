/**
 * Cancellation Service
 * --------------------------------------------------------------------------
 * Fee/penalty logic based on Uber/Rapido/Zomato model:
 *
 * USER CANCEL:
 *   - Before assignment (searching)  → FREE always
 *   - Within 2 min of assignment     → FREE (grace window)
 *   - After 2 min of assignment      → Flat fee (₹20 default)
 *   - Worker on_the_way              → Higher fee (₹30 default)
 *   - Worker arrived                 → Highest fee (₹50 default) + worker compensation
 *
 * WORKER CANCEL:
 *   - Assigned                       → ₹20 penalty
 *   - on_the_way / arrived           → ₹40 penalty (×2 multiplier)
 *
 * All amounts from CancellationConfig (DB), cached in Redis 60s.
 * --------------------------------------------------------------------------
 */

const CancellationConfig = require('./cancellation-config.model');
const { redis } = require('../../config/redis');

const CACHE_KEY = 'config:cancellation:active';
const CACHE_TTL = 60;

const DEFAULTS = {
  freeCancelWindowSec:       120,   // 2 min grace after worker assigned
  userCancelFeeAssignedPaise: 2000, // ₹20 — assigned but within trip
  userCancelFeeOnWayPaise:    3000, // ₹30 — worker already on the way
  userCancelFeeArrivedPaise:  5000, // ₹50 — worker at your door
  // Legacy field kept for backwards compat:
  userCancelFeePaise:         2000,
  workerCancelPenaltyPaise:   2000,
  workerNoShowPenaltyPaise:   5000,
  lateWorkerCancelMultiplier: 2,
  workerRejectLimit:          5,
  workerCancelLimit:          3,   // penalised cancels in the window before auto-offline
  workerShareOnWayPct:        50,
  workerShareArrivedPct:      70,
  workerCancelWindowSec:      86400, // 24h = "per day"
  rejectRatePenaltyWeight:    3.0,
  cancelRatePenaltyWeight:    5.0,
};

async function getConfig() {
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch { /* fallthrough */ }
  }
  const doc = await CancellationConfig.findOne({ isActive: true }).lean();
  const cfg = doc ? { ...DEFAULTS, ...doc } : DEFAULTS;
  await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(cfg));
  return cfg;
}

async function bustCache() {
  await redis.del(CACHE_KEY);
}

async function updateConfig(patch, adminId) {
  const current = await CancellationConfig.findOne({ isActive: true });
  if (current) {
    current.isActive = false;
    await current.save();
  }
  // A new version row: copy the settings, never the old row's identity.
  const { _id, __v, createdAt, updatedAt, version, isActive, updatedBy, ...settings } = current ? current.toObject() : {};
  const next = await CancellationConfig.create({
    ...DEFAULTS,
    ...settings,
    ...patch,
    version: (current?.version || 0) + 1,
    isActive: true,
    updatedBy: adminId,
  });
  await bustCache();
  return next;
}

// Helpers

/**
 * Find when the order was most recently assigned by reading statusHistory.
 * Returns the Date, or null if never assigned.
 */
function getAssignedAt(order) {
  const entries = order.statusHistory || [];
  // Last 'assigned' entry (re-dispatch can create multiple)
  const entry = [...entries].reverse().find((h) => h.status === 'assigned');
  return entry?.at ? new Date(entry.at) : null;
}

// User cancellation fee

/**
 * Returns { feePaise, reason, secsLeft, workerCompensationPaise }.
 *   secsLeft: seconds remaining in free-cancel window (0 if window expired).
 *   workerCompensationPaise: what % the worker should receive from the fee.
 */
async function calculateUserCancelFee(order) {
  const cfg = await getConfig();

  // Before any worker commits → always free
  if (!['assigned', 'on_the_way', 'arrived'].includes(order.status)) {
    return {
      feePaise: 0,
      reason: 'no_worker_assigned',
      secsLeft: null,
      workerCompensationPaise: 0,
    };
  }

  const assignedAt   = getAssignedAt(order) || new Date(order.createdAt);
  const sinceAssignedSec = (Date.now() - assignedAt.getTime()) / 1000;
  const graceSec     = cfg.freeCancelWindowSec ?? 120;
  const secsLeft     = Math.max(0, Math.ceil(graceSec - sinceAssignedSec));

  // Within free-cancel window
  if (sinceAssignedSec <= graceSec) {
    return { feePaise: 0, reason: 'within_grace_period', secsLeft, workerCompensationPaise: 0 };
  }

  // Past grace — tiered by how far the worker got
  let feePaise;
  let workerCompensationPaise = 0;

  if (order.status === 'arrived') {
    feePaise = cfg.userCancelFeeArrivedPaise ?? 5000;
    workerCompensationPaise = Math.round(feePaise * (cfg.workerShareArrivedPct ?? 70) / 100);
  } else if (order.status === 'on_the_way') {
    feePaise = cfg.userCancelFeeOnWayPaise ?? 3000;
    workerCompensationPaise = Math.round(feePaise * (cfg.workerShareOnWayPct ?? 50) / 100);
  } else {
    feePaise = cfg.userCancelFeeAssignedPaise ?? 2000;
    workerCompensationPaise = 0; // worker hadn't moved yet
  }

  return {
    feePaise,
    reason: `worker_${order.status}`,
    secsLeft: 0,
    workerCompensationPaise,
  };
}

// Preview (no side effects)

/**
 * Same logic as calculateUserCancelFee but also returns human-readable info
 * for the UI to show before the user confirms cancellation.
 */
async function previewCancelFee(order) {
  const result = await calculateUserCancelFee(order);

  const isFree = result.feePaise === 0;

  let message;
  if (!['assigned', 'on_the_way', 'arrived'].includes(order.status)) {
    message = 'No charge — worker not yet assigned';
  } else if (isFree && result.secsLeft > 0) {
    const mins = Math.floor(result.secsLeft / 60);
    const secs = result.secsLeft % 60;
    message = mins > 0
      ? `Free to cancel for ${mins}m ${secs}s more`
      : `Free to cancel for ${secs}s more`;
  } else if (isFree) {
    message = 'Free to cancel';
  } else {
    const rs = Math.round(result.feePaise / 100);
    message = order.status === 'arrived'
      ? `₹${rs} fee — worker is already at your location`
      : order.status === 'on_the_way'
      ? `₹${rs} fee — worker is on the way`
      : `₹${rs} fee — worker was assigned to you`;
  }

  return {
    ...result,
    feeRupees: Math.round(result.feePaise / 100),
    isFree,
    message,
    canCancel: !['arrived', 'in_progress', 'completed', 'cancelled', 'failed'].includes(order.status),
  };
}

// Worker cancellation penalty

// Reasons a worker can cancel with. Genuine reasons are penalty-free AND do NOT
// count toward the escalation threshold; the rest are penalised and counted
// (to catch cherry-picking).
const WORKER_CANCEL_REASONS = [
  { code: 'vehicle_breakdown',   label: 'Vehicle breakdown',         genuine: true  },
  { code: 'personal_emergency',  label: 'Personal emergency',        genuine: true  },
  { code: 'customer_unreachable', label: 'Customer not reachable',   genuine: true  },
  { code: 'wrong_job_details',   label: 'Wrong / unsafe job details', genuine: true  },
  { code: 'too_far',             label: 'Too far to reach',          genuine: false },
  { code: 'changed_mind',        label: 'Can no longer take it',     genuine: false },
  { code: 'other',               label: 'Other reason',              genuine: false },
];
const GENUINE_REASON_CODES = new Set(WORKER_CANCEL_REASONS.filter((r) => r.genuine).map((r) => r.code));

async function calculateWorkerCancelPenalty(order, reasonCode) {
  const cfg = await getConfig();
  const isLate = ['on_the_way', 'arrived'].includes(order.status);
  const isGenuine = GENUINE_REASON_CODES.has(reasonCode);
  const penaltyPaise = isGenuine
    ? 0
    : (isLate
      ? Math.round(cfg.workerCancelPenaltyPaise * cfg.lateWorkerCancelMultiplier)
      : cfg.workerCancelPenaltyPaise);
  return {
    penaltyPaise,
    reason: isGenuine ? 'worker_cancelled_genuine' : (isLate ? 'worker_cancelled_late' : 'worker_cancelled_assigned'),
    isLate,
    isGenuine,
    counts: !isGenuine, // whether this cancel counts toward the escalation limit
  };
}

async function calculateNoShowPenalty() {
  const cfg = await getConfig();
  return cfg.workerNoShowPenaltyPaise;
}

module.exports = {
  getConfig,
  updateConfig,
  bustCache,
  calculateUserCancelFee,
  calculateWorkerCancelPenalty,
  calculateNoShowPenalty,
  previewCancelFee,
  WORKER_CANCEL_REASONS,
  DEFAULTS,
};
