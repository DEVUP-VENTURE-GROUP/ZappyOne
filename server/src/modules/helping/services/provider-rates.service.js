// A helper's own rates for each errand they are verified for (helping/models/provider-rate); ZappyOne sets no helping price.
const { httpError } = require('../../../core/errors');
const Rate = require('../models/provider-rate.model');
const { HELPING_LINE } = require('../../onboarding/eligibility');

const FIELDS = ['baseFeePaise', 'perKmPaise', 'includedKm', 'waitingPerMinutePaise', 'extraStopPaise', 'specialHandlingPaise'];
const who = (owner) => (owner.shopId ? { shopId: owner.shopId } : { workerId: owner.workerId });

// The errands of one service (a line can cover several, like shopping and pickup), with their rates.
async function card(owner, lineCode) {
  const types = Object.entries(HELPING_LINE).filter(([, line]) => line === lineCode).map(([t]) => t);
  if (!types.length) return { types: [] };
  const rates = await Rate.find({ ...who(owner), serviceType: { $in: types } }).lean();
  const byType = new Map(rates.map((r) => [r.serviceType, r]));
  const label = (t) => t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ');
  return {
    types: types.map((t) => ({ serviceType: t, name: label(t), rate: byType.has(t) ? Object.fromEntries(FIELDS.map((f) => [f, byType.get(t)[f] ?? 0])) : null })),
  };
}

// Save one errand's rates; a base fee is needed to offer it, and no base fee takes it off.
async function saveRate(owner, lineCode, serviceType, body) {
  if (HELPING_LINE[serviceType] !== lineCode) throw httpError('That errand is not part of this service.', 400, 'UNKNOWN_ERRAND');
  if (!body.baseFeePaise) {
    await Rate.deleteOne({ ...who(owner), serviceType });
    return card(owner, lineCode);
  }
  if (!(body.baseFeePaise >= 100)) throw httpError('Set a base fee of at least ₹1.', 400, 'BAD_PRICE');
  await Rate.updateOne({ ...who(owner), serviceType }, { $set: Object.fromEntries(FIELDS.map((f) => [f, Math.max(0, Number(body[f]) || 0)])), $setOnInsert: { ...who(owner), serviceType } }, { upsert: true });
  return card(owner, lineCode);
}

module.exports = { card, saveRate };
