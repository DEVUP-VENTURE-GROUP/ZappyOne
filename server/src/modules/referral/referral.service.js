/**
 * Referral Service
 * ----------------------------------------------------------------------------
 * Two-sided rewards:
 *   - Referee: small bonus credited to wallet on signup (e.g. ₹50)
 *   - Referrer: larger bonus credited when referee completes their first order
 *               (e.g. ₹100) — this prevents farming via fake signups
 *
 * Code generation: 6-char alphanumeric, retried on collision (extremely rare).
 * Idempotency: ReferralUse uniqueness on referee_id ensures one referee can't
 * have multiple referrers; wallet credits use deterministic idempotency keys.
 */

const crypto = require('crypto');
const { ReferralCode, ReferralUse } = require('./referral.model');
const walletService = require('../wallet/wallet.service');
const Transaction = require('../payment/transaction.model');
const notificationService = require('../notification/notification.service');
const logger = require('../../core/logger');

const REFEREE_BONUS_PAISE = 5000;    // ₹50 — instant on signup
const REFERRER_REWARD_PAISE = 10000; // ₹100 — on referee's first completed order

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 (look-alikes)

function generateCode(prefix = 'QFX', length = 6) {
  const chars = Array.from({ length }, () =>
    ALPHABET[crypto.randomInt(0, ALPHABET.length)]
  ).join('');
  return `${prefix}${chars}`;
}

/**
 * Get or create a referral code for an owner. Idempotent.
 */
async function getOrCreateCode({ kind, id }) {
  let existing = await ReferralCode.findOne({ 'owner.kind': kind, 'owner.id': id });
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      return await ReferralCode.create({ code, owner: { kind, id } });
    } catch (err) {
      if (err.code === 11000) continue; // collision, retry
      throw err;
    }
  }
  throw new Error('Could not generate unique referral code after 5 attempts');
}

/**
 * Apply a referral code at signup. Credits the referee instantly.
 *
 * @param {object} p
 * @param {string} p.code            The code the referee entered
 * @param {object} p.referee         { kind, id }
 * @param {string} [p.refereeIp]     For anti-abuse
 * @param {string} [p.refereeDeviceId]
 */
async function applyAtSignup({ code, referee, refereeIp, refereeDeviceId }) {
  await require('../feature-flags/feature-flag.service').assertEnabled('referrals');
  const codeDoc = await ReferralCode.findOne({ code: code.toUpperCase(), isActive: true });
  if (!codeDoc) {
    throw Object.assign(new Error('Invalid referral code'), { status: 400, code: 'REFERRAL_INVALID' });
  }
  // No self-referrals
  if (
    String(codeDoc.owner.id) === String(referee.id) &&
    codeDoc.owner.kind === referee.kind
  ) {
    throw Object.assign(new Error('Cannot refer yourself'), { status: 400, code: 'REFERRAL_SELF' });
  }

  const REFERRAL_WINDOW_MS = 30 * 86400 * 1000; // 30 days
  const MAX_REFERRALS_PER_REFERRER = 20;         // hard cap per referrer per month

  // 1. Same IP or device already claimed a referral bonus recently — block farming
  if (refereeIp || refereeDeviceId) {
    const recentByDevice = await ReferralUse.findOne({
      $or: [
        ...(refereeIp ? [{ refereeIp }] : []),
        ...(refereeDeviceId ? [{ refereeDeviceId }] : []),
      ],
      createdAt: { $gte: new Date(Date.now() - REFERRAL_WINDOW_MS) },
    });
    if (recentByDevice) {
      logger.warn({ refereeIp, refereeDeviceId }, 'Referral abuse suspected — same IP/device');
      throw Object.assign(new Error('Referral cannot be applied'), { status: 400, code: 'REFERRAL_DUPLICATE' });
    }
  }

  // 2. Referrer monthly cap — prevents one user farming 100s of accounts
  const referrerMonthlyCount = await ReferralUse.countDocuments({
    'referrer.id': codeDoc.owner.id,
    createdAt: { $gte: new Date(Date.now() - REFERRAL_WINDOW_MS) },
  });
  if (referrerMonthlyCount >= MAX_REFERRALS_PER_REFERRER) {
    logger.warn({ referrerId: codeDoc.owner.id, count: referrerMonthlyCount }, '[REFERRAL] Monthly cap hit — possible farming');
    throw Object.assign(new Error('Referral limit reached'), { status: 429, code: 'REFERRAL_CAP' });
  }

  let use;
  try {
    use = await ReferralUse.create({
      code: codeDoc.code,
      referrer: codeDoc.owner,
      referee,
      status: 'signup',
      refereeSignupBonusPaise: REFEREE_BONUS_PAISE,
      refereeIp,
      refereeDeviceId,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw Object.assign(new Error('Referral already applied to this account'), {
        status: 409, code: 'REFERRAL_ALREADY_USED',
      });
    }
    throw err;
  }

  // DO NOT credit the referee bonus immediately on signup.
  // Instant ₹50 on signup with no order required was the primary farming vector:
  // 20 SIM cards × ₹50 = ₹1000 free cash with zero intent to use the platform.
  //
  // Instead: mark the use record as 'signup' (pending). The bonus is credited
  // in onRefereeFirstOrder() when the referee completes their FIRST order.
  // This aligns incentives: referee bonus = reward for genuine first use, same
  // as the referrer reward.
  await use.save();

  await ReferralCode.updateOne({ _id: codeDoc._id }, { $inc: { totalUses: 1 } });

  // Notify referee of the PENDING bonus — tells them what they'll earn on first order
  await notificationService.notify({
    recipient: referee,
    type: 'referral_reward',
    title: '🎁 Referral bonus waiting!',
    body: `Complete your first order to claim ₹${REFEREE_BONUS_PAISE / 100} in your wallet`,
    deepLink: '/',
  });

  return use;
}

/**
 * Called after a referee's FIRST completed order.
 * Credits BOTH:
 *   1. The referee's signup bonus (deferred from applyAtSignup — see comment there)
 *   2. The referrer's reward
 * Idempotent — if already rewarded, returns silently.
 */
async function onRefereeFirstOrder({ refereeKind, refereeId, orderId }) {
  // Switched off: rewards wait (the use stays at 'signup') and are granted on a later order once back on.
  if (!(await require('../feature-flags/feature-flag.service').isEnabled('referrals'))) return null;
  const use = await ReferralUse.findOne({
    'referee.kind': refereeKind,
    'referee.id': refereeId,
    status: 'signup',
  });
  if (!use) return null; // Not referred, or already rewarded

  use.status = 'rewarded';
  use.referrerRewardPaise = REFERRER_REWARD_PAISE;
  use.referrerRewardGivenAt = new Date();
  use.refereeBonusGivenAt = new Date();
  use.qualifyingOrderId = orderId;
  await use.save();

  // Credit referee their deferred signup bonus (now that they've proved intent)
  await walletService.apply({
    kind: use.referee.kind,
    id: use.referee.id,
    type: 'credit',
    amountPaise: REFEREE_BONUS_PAISE,
    reason: Transaction.REASONS.REFERRAL_REWARD,
    idempotencyKey: `referral:referee:${use._id}`,
    description: `Welcome bonus — you completed your first order via referral ${use.code}`,
    refs: { orderId },
  });

  await notificationService.notify({
    recipient: { kind: use.referee.kind, id: use.referee.id },
    type: 'referral_reward',
    title: '🎁 Referral bonus credited!',
    body: `₹${REFEREE_BONUS_PAISE / 100} added to your wallet for completing your first order`,
    deepLink: '/wallet',
  });

  // Credit referrer
  await walletService.apply({
    kind: use.referrer.kind,
    id: use.referrer.id,
    type: 'credit',
    amountPaise: REFERRER_REWARD_PAISE,
    reason: Transaction.REASONS.REFERRAL_REWARD,
    idempotencyKey: `referral:referrer:${use._id}`,
    description: 'Referral reward — your friend just completed their first order!',
    refs: { orderId },
  });

  await ReferralCode.updateOne(
    { code: use.code },
    { $inc: { totalRewardsPaise: REFERRER_REWARD_PAISE } }
  );

  await notificationService.notify({
    recipient: use.referrer,
    type: 'referral_reward',
    title: `🎉 You earned ₹${REFERRER_REWARD_PAISE / 100}!`,
    body: 'A friend you invited just completed their first order',
    deepLink: '/wallet',
  });

  // Refer & Earn points — award the referrer redeemable reward points too (only
  // for user referrers; workers don't have a rewards wallet). Non-blocking.
  if (use.referrer.kind === 'user') {
    require('../rewards/rewards.service')
      .onReferralCompleted({ referrerId: use.referrer.id, refereeId: use.referee.id, orderId })
      .catch(() => {});
  }

  return use;
}

module.exports = {
  getOrCreateCode,
  applyAtSignup,
  onRefereeFirstOrder,
  REFEREE_BONUS_PAISE,
  REFERRER_REWARD_PAISE,
};
