// A partner brings a partner: once the new one finishes the jobs set in Economics, both get the reward set there; a reward of 0 means it is switched off.
const mongoose = require('mongoose');
const { ReferralCode, ReferralUse } = require('./referral.model');
const logger = require('../../core/logger');

const PARTNER_KINDS = ['worker', 'shop'];
const MODELS = { worker: () => require('../worker/worker.model'), shop: () => require('../shop/shop.model') };
const rupees = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

async function settings() {
  const cfg = await require('../pricing/services/config.service').getActiveConfig();
  return { rewardPaise: cfg.partnerReferralRewardPaise ?? 0, jobs: cfg.partnerReferralJobs ?? 5 };
}

// Shops have no wallet: their reward is a credit on the books their payouts are worked out from (shop/shop-payout).
async function credit(owner, amountPaise, idempotencyKey, description) {
  const Transaction = require('../payment/transaction.model');
  if (owner.kind === 'shop') {
    await Transaction.create({
      type: 'credit', owner: { kind: 'platform', id: null }, amountPaise, reason: Transaction.REASONS.REFERRAL_REWARD,
      idempotencyKey, description, metadata: { shopId: String(owner.id) }, status: 'succeeded',
    }).catch((e) => { if (e.code !== 11000) throw e; });
    return;
  }
  await require('../wallet/wallet.service').apply({
    kind: owner.kind, id: owner.id, type: 'credit', amountPaise, reason: Transaction.REASONS.REFERRAL_REWARD, idempotencyKey, description,
  });
}

// A shop's technicians and our own staff are not partners in their own right.
async function isPartner(kind, id) {
  if (kind === 'shop') return true;
  if (kind !== 'worker') return false;
  return !(await MODELS.worker().exists({ _id: id, shopId: { $ne: null } })) && !(await require('../workforce/staff').isStaff(id));
}

// What the partner's invite card shows; nothing when switched off, so the card hides.
async function card({ kind, id }) {
  if (!PARTNER_KINDS.includes(kind)) return null;
  const s = await settings();
  if (!(await isPartner(kind, id))) return { on: false };
  if (!s.rewardPaise || !(await require('../feature-flags/feature-flag.service').isEnabled('referrals'))) return { on: false };
  const code = await require('./referral.service').getOrCreateCode({ kind, id });
  const [uses, joined, account] = await Promise.all([
    ReferralUse.find({ code: code.code }).select('status').lean(),
    ReferralUse.findOne({ 'referee.kind': kind, 'referee.id': id }).select('status').lean(),
    MODELS[kind]().findById(id).select('createdAt').lean(),
  ]);
  const { NEW_ACCOUNT_DAYS } = require('./referral.service');
  return {
    on: true, code: code.code, rewardPaise: s.rewardPaise, jobs: s.jobs,
    shareText: `Join ZappyOne as a partner and get jobs near you. Use my code ${code.code} in the app: when you finish ${s.jobs} jobs, we both get ${rupees(s.rewardPaise)}. ${(process.env.SERVICEPRO_URL || 'https://servicepro.zappyone.com').replace(/\/$/, '')}`,
    invited: uses.length, rewarded: uses.filter((u) => u.status === 'rewarded').length, earnedPaise: code.totalRewardsPaise || 0,
    canEnterCode: !joined && !!account && Date.now() - new Date(account.createdAt).getTime() <= NEW_ACCOUNT_DAYS * 86400000,
    joinedWithCode: joined ? joined.status : null,
  };
}

// Called each time a partner's done-jobs count goes up (jobs/job-count); pays both sides once, at the count set in Economics.
async function onJobDone(kind, id) {
  if (!PARTNER_KINDS.includes(kind)) return null;
  const use = await ReferralUse.findOne({ 'referee.kind': kind, 'referee.id': new mongoose.Types.ObjectId(String(id)), status: 'signup' }).lean();
  if (!use) return null;
  const s = await settings();
  if (!s.rewardPaise || !(await require('../feature-flags/feature-flag.service').isEnabled('referrals'))) return null;
  const done = (await MODELS[kind]().findById(id).select('completedJobs').lean())?.completedJobs || 0;
  if (done < s.jobs) return null;
  const now = new Date();
  const claimed = await ReferralUse.findOneAndUpdate(
    { _id: use._id, status: 'signup' },
    { $set: { status: 'rewarded', referrerRewardPaise: s.rewardPaise, refereeSignupBonusPaise: s.rewardPaise, referrerRewardGivenAt: now, refereeBonusGivenAt: now } },
    { new: true },
  ).lean();
  if (!claimed) return null;
  await credit(use.referee, s.rewardPaise, `referral:referee:${use._id}`, `Partner referral bonus: you finished ${s.jobs} jobs`);
  await credit(use.referrer, s.rewardPaise, `referral:referrer:${use._id}`, `Partner referral bonus: a partner you invited finished ${s.jobs} jobs`);
  await ReferralCode.updateOne({ code: use.code }, { $inc: { totalRewardsPaise: s.rewardPaise } });
  const notify = require('../notification/notification.service').notify;
  const tell = (recipient, body) => notify({ recipient, type: 'referral_reward', title: `${rupees(s.rewardPaise)} referral bonus added`, body, deepLink: recipient.kind === 'shop' ? '/shop/earnings' : '/worker/earnings' })
    .catch((e) => logger.warn({ err: e.message }, '[partner-referral] notify failed'));
  await Promise.all([
    tell(use.referee, `You finished ${s.jobs} jobs. The bonus is in your earnings.`),
    tell(use.referrer, `A partner you invited finished ${s.jobs} jobs. The bonus is in your earnings.`),
  ]);
  return claimed;
}

module.exports = { PARTNER_KINDS, settings, isPartner, card, onJobDone };
