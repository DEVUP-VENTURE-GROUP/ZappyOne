/**
 * Worker Emergency Mutual Aid Fund
 * ---------------------------------------------------------------------------
 * Platform contributes 0.5% of each order's platform commission to a
 * shared emergency pool. Workers in crisis can apply for up to ₹5000.
 *
 * Fund balance is stored in a special Redis key + tracked in a platform
 * wallet entry. Claims are admin-approved within 24h.
 *
 * This is profound for retention: "Zappy has my back."
 * No Indian gig platform does this.
 * ---------------------------------------------------------------------------
 */

const EmergencyFundClaim = require('./emergency-fund.model');
const Worker = require('./worker.model');
const { redis } = require('../../config/redis');
const logger  = require('../../core/logger');

const FUND_KEY        = 'emergency_fund:balance_paise';
const MAX_CLAIM_PAISE = 500000;   // ₹5000
const COOLDOWN_DAYS   = 180;      // once per 6 months per worker
const CONTRIBUTION_PCT = 0.005;   // 0.5% of platform fee

/* Called from order completion — contributes to the fund */
async function contributeFromOrder(platformCommissionPaise) {
  const contribution = Math.floor(platformCommissionPaise * CONTRIBUTION_PCT);
  if (contribution > 0) {
    await redis.incrby(FUND_KEY, contribution);
    await redis.persist(FUND_KEY);  // never expire
  }
  return contribution;
}

async function getFundBalance() {
  const raw = await redis.get(FUND_KEY);
  const paise = Number(raw) || 0;
  return { balancePaise: paise, balanceRupees: Math.round(paise / 100) };
}

async function submitClaim({ workerId, reason, category, requestedPaise }) {
  if (requestedPaise > MAX_CLAIM_PAISE) {
    throw Object.assign(new Error(`Maximum claim is ₹${MAX_CLAIM_PAISE / 100}`), { status: 400 });
  }
  if (requestedPaise < 10000) {
    throw Object.assign(new Error('Minimum claim is ₹100'), { status: 400 });
  }

  /* Cooldown check */
  const since = new Date(Date.now() - COOLDOWN_DAYS * 86400000);
  const recent = await EmergencyFundClaim.findOne({
    workerId,
    status: { $in: ['approved', 'paid'] },
    createdAt: { $gte: since },
  }).lean();

  if (recent) {
    const nextEligible = new Date(recent.createdAt.getTime() + COOLDOWN_DAYS * 86400000);
    throw Object.assign(new Error(`You can apply again after ${nextEligible.toLocaleDateString('en-IN')}`), { status: 409 });
  }

  /* Pending claim check */
  const pending = await EmergencyFundClaim.findOne({ workerId, status: 'pending' }).lean();
  if (pending) throw Object.assign(new Error('You have a pending claim. Wait for it to be reviewed.'), { status: 409 });

  const worker = await Worker.findById(workerId).select('name phone').lean();
  const claim  = await EmergencyFundClaim.create({
    workerId,
    workerName:  worker?.name,
    workerPhone: worker?.phone,
    reason,
    category,
    requestedPaise: Math.min(requestedPaise, MAX_CLAIM_PAISE),
  });

  /* Alert admin */
  await redis.publish('notification:admin:ops', JSON.stringify({
    type:  'emergency_fund_claim',
    title: `🆘 Emergency Fund Claim: ${worker?.name}`,
    body:  `${category} — ₹${Math.round(requestedPaise / 100)}: ${reason.slice(0, 80)}`,
    data:  { claimId: String(claim._id), workerId: String(workerId) },
  }));

  logger.info({ workerId, category, requestedPaise }, '[EmergencyFund] Claim submitted');
  return claim;
}

async function approveClaim({ claimId, adminId, adminNote }) {
  const claim = await EmergencyFundClaim.findById(claimId);
  if (!claim) throw Object.assign(new Error('Claim not found'), { status: 404 });
  if (claim.status !== 'pending') throw Object.assign(new Error('Claim already resolved'), { status: 409 });

  const balance = await getFundBalance();
  if (balance.balancePaise < claim.requestedPaise) {
    throw Object.assign(new Error('Insufficient fund balance'), { status: 400 });
  }

  const walletService = require('../wallet/wallet.service');
  const Transaction   = require('../payment/transaction.model');

  await walletService.apply({
    kind:   'worker', id: claim.workerId,
    type:   'credit',
    amountPaise: claim.requestedPaise,
    reason: Transaction.REASONS.ADMIN_ADJUSTMENT_CREDIT,
    idempotencyKey: `emerg:${claimId}`,
    description: `Emergency mutual aid fund — ${claim.category}`,
  });

  /* Deduct from fund */
  await redis.decrby(FUND_KEY, claim.requestedPaise);

  claim.status     = 'paid';
  claim.adminNote  = adminNote;
  claim.reviewedBy = adminId;
  claim.reviewedAt = new Date();
  claim.paidAt     = new Date();
  await claim.save();

  const notifService = require('../notification/notification.service');
  notifService.notify({
    recipient: { kind: 'worker', id: claim.workerId },
    type:  'wallet_credited',
    title: `✅ Emergency fund claim approved!`,
    body:  `₹${Math.round(claim.requestedPaise / 100)} credited. We hope this helps.`,
    deepLink: '/wallet',
  }).catch(() => {});

  logger.info({ claimId, workerId: claim.workerId, paise: claim.requestedPaise }, '[EmergencyFund] Claim approved + paid');
  return claim;
}

async function rejectClaim({ claimId, adminId, adminNote }) {
  const claim = await EmergencyFundClaim.findByIdAndUpdate(
    claimId,
    { $set: { status: 'rejected', adminNote, reviewedBy: adminId, reviewedAt: new Date() } },
    { new: true }
  );
  const notifService = require('../notification/notification.service');
  notifService.notify({
    recipient: { kind: 'worker', id: claim.workerId },
    type: 'worker_wellness',
    title: 'Emergency fund update',
    body: `Your claim was not approved this time. ${adminNote || 'Contact support for more details.'}`,
    deepLink: '/worker',
  }).catch(() => {});
  return claim;
}

async function getMyClaims(workerId) {
  return EmergencyFundClaim.find({ workerId }).sort({ createdAt: -1 }).lean();
}

module.exports = { contributeFromOrder, getFundBalance, submitClaim, approveClaim, rejectClaim, getMyClaims };
