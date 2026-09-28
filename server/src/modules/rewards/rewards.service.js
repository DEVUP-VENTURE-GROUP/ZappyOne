const crypto = require('crypto');
const logger = require('../../core/logger');
const walletService = require('../wallet/wallet.service');
const { RewardsConfig, RewardAccount, PointsLedger, ScratchCard } = require('./rewards.models');

const DEFAULT_TIERS = [
  { label: '20 points',    type: 'points',   value: 20,   weight: 38 },
  { label: '₹10 cashback', type: 'cashback', value: 1000, weight: 24 },
  { label: '50 points',    type: 'points',   value: 50,   weight: 18 },
  { label: '₹25 cashback', type: 'cashback', value: 2500, weight: 10 },
  { label: '100 points',   type: 'points',   value: 100,  weight: 5 },
  { label: 'Better luck next time', type: 'none', value: 0, weight: 5 },
];

let _cfgCache = { at: 0, data: null };

/** Admin config with defaults, cached 30s. */
async function getConfig() {
  if (_cfgCache.data && Date.now() - _cfgCache.at < 30_000) return _cfgCache.data;
  let cfg = await RewardsConfig.findOne({ key: 'active' }).lean();
  if (!cfg) cfg = await RewardsConfig.create({ key: 'active', scratchTiers: DEFAULT_TIERS }).then((d) => d.toObject());
  if (!cfg.scratchTiers || !cfg.scratchTiers.length) cfg.scratchTiers = DEFAULT_TIERS;
  _cfgCache = { at: Date.now(), data: cfg };
  return cfg;
}

async function updateConfig(patch, adminId) {
  const cfg = await RewardsConfig.findOneAndUpdate(
    { key: 'active' },
    { $set: { ...patch, updatedBy: adminId } },
    { new: true, upsert: true, runValidators: true }
  );
  _cfgCache = { at: 0, data: null };
  return cfg;
}

/** Core primitive: change a user's points balance + write a ledger row (idempotent). */
async function awardPoints({ userId, points, reason, ref = null, idempotencyKey }) {
  if (!points) return null;
  idempotencyKey = idempotencyKey || `${reason}:${ref || crypto.randomBytes(6).toString('hex')}:${userId}`;

  // Idempotency — skip if this exact award/redeem was already recorded.
  const existing = await PointsLedger.findOne({ idempotencyKey }).lean();
  if (existing) return existing;

  const acct = await RewardAccount.findOneAndUpdate(
    { userId },
    {
      $inc: {
        points: points,
        ...(points > 0 ? { lifetimeEarned: points } : { lifetimeRedeemed: -points }),
      },
    },
    { new: true, upsert: true }
  );
  // Guard: never let balance go negative from a race.
  if (acct.points < 0) {
    await RewardAccount.updateOne({ userId }, { $set: { points: 0 } });
    acct.points = 0;
  }

  try {
    await PointsLedger.create({ userId, delta: points, balanceAfter: acct.points, reason, ref, idempotencyKey });
  } catch (err) {
    if (err.code !== 11000) throw err; // concurrent duplicate — safe
  }
  return acct;
}

async function getBalance(userId) {
  const acct = await RewardAccount.findOne({ userId }).lean();
  return acct?.points || 0;
}

/** Full rewards summary for the user's Rewards screen. */
async function getSummary(userId) {
  const cfg = await getConfig();
  const [acct, cards, ledger] = await Promise.all([
    RewardAccount.findOne({ userId }).lean(),
    ScratchCard.find({ userId, status: { $in: ['active', 'scratched'] } }).sort({ createdAt: -1 }).limit(20).lean(),
    PointsLedger.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  const points = acct?.points || 0;
  // Expire stale active cards lazily.
  const now = new Date();
  const activeCards = cards.filter((c) => !(c.status === 'active' && c.expiresAt && c.expiresAt < now));
  return {
    enabled: cfg.enabled,
    points,
    redeemableRupees: Math.floor((points * cfg.redeemPaisePerPoint) / 100),
    minRedeemPoints: cfg.minRedeemPoints,
    redeemPaisePerPoint: cfg.redeemPaisePerPoint,
    lifetimeEarned: acct?.lifetimeEarned || 0,
    lifetimeRedeemed: acct?.lifetimeRedeemed || 0,
    scratchCards: activeCards.map(publicCard),
    history: ledger.map((l) => ({ delta: l.delta, reason: l.reason, at: l.createdAt })),
  };
}

function publicCard(c) {
  return {
    id: String(c._id),
    status: c.status,
    source: c.source,
    // Reward is hidden until scratched.
    reward: c.status === 'scratched' ? c.reward : null,
    issuedAt: c.issuedAt,
    expiresAt: c.expiresAt,
  };
}

/** Redeem points → wallet cash. */
async function redeemPoints({ userId, points }) {
  const cfg = await getConfig();
  if (!cfg.enabled) throw Object.assign(new Error('Rewards are currently disabled.'), { status: 403 });
  points = Math.floor(Number(points));
  if (!Number.isInteger(points) || points <= 0) throw Object.assign(new Error('Invalid points amount.'), { status: 400 });
  if (points < cfg.minRedeemPoints) throw Object.assign(new Error(`Redeem at least ${cfg.minRedeemPoints} points.`), { status: 400 });

  const acct = await RewardAccount.findOne({ userId }).lean();
  if (!acct || acct.points < points) throw Object.assign(new Error('Not enough points.'), { status: 400 });

  const amountPaise = points * cfg.redeemPaisePerPoint;
  const idem = `reward_redeem:${userId}:${Date.now()}`;

  // Deduct points first (idempotent), then credit wallet.
  await awardPoints({ userId, points: -points, reason: 'redeem', ref: idem, idempotencyKey: idem });
  try {
    await walletService.apply({
      kind: 'user', id: userId, type: 'credit', amountPaise,
      reason: 'reward_redeem', idempotencyKey: idem,
      description: `Redeemed ${points} reward points`,
    });
  } catch (err) {
    // Roll back the points if the wallet credit failed.
    await awardPoints({ userId, points, reason: 'redeem_rollback', ref: idem, idempotencyKey: `${idem}:rb` });
    throw err;
  }
  return { redeemedPoints: points, creditedRupees: Math.round(amountPaise / 100), balance: await getBalance(userId) };
}

function pickTier(tiers) {
  const total = tiers.reduce((s, t) => s + (t.weight > 0 ? t.weight : 0), 0);
  if (total <= 0) return tiers[0];
  let r = Math.random() * total;
  for (const t of tiers) { r -= (t.weight > 0 ? t.weight : 0); if (r <= 0) return t; }
  return tiers[tiers.length - 1];
}

/** Issue an unscratched card (reward revealed only when the user scratches). */
async function issueScratchCard({ userId, source = 'order', orderId = null }) {
  const cfg = await getConfig();
  if (!cfg.enabled) return null;
  const expiresAt = new Date(Date.now() + (cfg.scratchExpiryDays || 14) * 86400000);
  const card = await ScratchCard.create({ userId, source, orderId, status: 'active', expiresAt });
  return card;
}

/** Reveal a card: pick a weighted reward, credit it, mark scratched. */
async function scratchCard({ userId, cardId }) {
  const cfg = await getConfig();
  const card = await ScratchCard.findOne({ _id: cardId, userId });
  if (!card) throw Object.assign(new Error('Scratch card not found.'), { status: 404 });
  if (card.status === 'scratched') return { alreadyScratched: true, reward: card.reward };
  if (card.status === 'expired' || (card.expiresAt && card.expiresAt < new Date())) {
    card.status = 'expired'; await card.save();
    throw Object.assign(new Error('This scratch card has expired.'), { status: 410 });
  }

  const tier = pickTier(cfg.scratchTiers && cfg.scratchTiers.length ? cfg.scratchTiers : DEFAULT_TIERS);
  const reward = { type: tier.type, value: tier.value, label: tier.label };

  // Atomically claim the card so a double-tap can't double-credit.
  const claimed = await ScratchCard.findOneAndUpdate(
    { _id: cardId, userId, status: 'active' },
    { $set: { status: 'scratched', scratchedAt: new Date(), reward } },
    { new: true }
  );
  if (!claimed) {
    const fresh = await ScratchCard.findById(cardId).lean();
    return { alreadyScratched: true, reward: fresh?.reward };
  }

  // Credit the reward.
  try {
    if (reward.type === 'points' && reward.value > 0) {
      await awardPoints({ userId, points: reward.value, reason: 'scratch', ref: String(cardId), idempotencyKey: `scratch:${cardId}` });
    } else if (reward.type === 'cashback' && reward.value > 0) {
      await walletService.apply({
        kind: 'user', id: userId, type: 'credit', amountPaise: reward.value,
        reason: 'reward_scratch', idempotencyKey: `scratch:${cardId}`,
        description: `Scratch card reward: ${reward.label}`,
      });
    }
  } catch (err) {
    logger.error({ err: err.message, cardId }, '[REWARDS] Scratch reward credit failed');
  }

  return { reward, balance: await getBalance(userId) };
}

/** Hook: called when an order is completed. Awards points + a scratch card. */
async function onOrderCompleted({ userId, orderTotalPaise = 0, orderId = null }) {
  try {
    const cfg = await getConfig();
    if (!cfg.enabled) return;
    const spendPoints = Math.floor(((orderTotalPaise / 100) / 100) * (cfg.pointsPer100Rupees || 0));
    const total = (cfg.pointsPerOrder || 0) + spendPoints;
    if (total > 0) await awardPoints({ userId, points: total, reason: 'order', ref: String(orderId), idempotencyKey: `order:${orderId}` });
    if (cfg.scratchOnOrder) await issueScratchCard({ userId, source: 'order', orderId });
  } catch (err) {
    logger.warn({ err: err.message, userId }, '[REWARDS] onOrderCompleted failed (non-fatal)');
  }
}

/** Hook: referral rewards in points (in addition to existing cash bonuses). */
async function onReferralCompleted({ referrerId, refereeId, orderId = null }) {
  try {
    const cfg = await getConfig();
    if (!cfg.enabled) return;
    if (referrerId && cfg.pointsPerReferral > 0) {
      await awardPoints({ userId: referrerId, points: cfg.pointsPerReferral, reason: 'referral', ref: String(orderId || refereeId), idempotencyKey: `referral:${referrerId}:${refereeId}` });
    }
  } catch (err) {
    logger.warn({ err: err.message }, '[REWARDS] onReferralCompleted failed (non-fatal)');
  }
}

/** Hook: referee gets a small points welcome on signup. */
async function onRefereeJoined({ refereeId }) {
  try {
    const cfg = await getConfig();
    if (!cfg.enabled || !(cfg.pointsPerRefereeJoin > 0)) return;
    await awardPoints({ userId: refereeId, points: cfg.pointsPerRefereeJoin, reason: 'referee_join', ref: String(refereeId), idempotencyKey: `referee_join:${refereeId}` });
  } catch (err) {
    logger.warn({ err: err.message }, '[REWARDS] onRefereeJoined failed (non-fatal)');
  }
}

module.exports = {
  getConfig, updateConfig,
  awardPoints, getBalance, getSummary, redeemPoints,
  issueScratchCard, scratchCard,
  onOrderCompleted, onReferralCompleted, onRefereeJoined,
};
