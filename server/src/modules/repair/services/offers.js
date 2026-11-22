// A partner's own offer on a menu job (% or ₹ off, optional end date): the one rule every price read applies, so quotes, bookings, bills and payouts all see the same offer price.
const mongoose = require('mongoose');
const { httpError } = require('../../../core/errors');
const { ProviderCapability } = require('../models/capability.model');

const MAX_PCT = 50;
const MAX_DAYS = 90;

const isLive = (offer, now = new Date()) => !!offer && ['pct', 'flat'].includes(offer.kind) && offer.value > 0 && (!offer.endsAt || new Date(offer.endsAt) > now);
const labelOf = (offer) => (offer.kind === 'pct' ? `${offer.value}% off` : `₹${Math.round(offer.value / 100)} off`);

// Paise taken off one price, in whole rupees and never more than half of it.
function offPaise(totalPaise, offer, now = new Date()) {
  if (!isLive(offer, now) || !(totalPaise > 0)) return 0;
  const raw = offer.kind === 'pct' ? (totalPaise * Math.min(offer.value, MAX_PCT)) / 100 : offer.value;
  return Math.min(Math.round(raw / 100) * 100, Math.floor(totalPaise / 200) * 100);
}

// A price row with the offer applied: the lower total, and what it was, for the strike-through and the bill.
function withOffer(row, offer, now = new Date()) {
  const off = offPaise(row?.totalPaise, offer, now);
  return off ? { ...row, totalPaise: row.totalPaise - off, offerWasPaise: row.totalPaise, offerLabel: labelOf(offer) } : row;
}

const keyOf = (ownerId, repairCode) => `${ownerId}|${repairCode}`;

// Live offers for many partners and jobs in one query: "ownerId|repairCode" -> offer.
async function offerMap({ shopIds = [], workerIds = [], repairCodes }) {
  const or = [];
  if (shopIds.length) or.push({ shopId: { $in: shopIds } });
  if (workerIds.length) or.push({ workerId: { $in: workerIds } });
  if (!or.length || !repairCodes?.length) return new Map();
  const caps = await ProviderCapability.find({ $or: or, repairCode: { $in: repairCodes }, isActive: true, 'offer.kind': { $in: ['pct', 'flat'] } })
    .select('shopId workerId repairCode offer').lean();
  return new Map(caps.filter((c) => isLive(c.offer)).map((c) => [keyOf(c.shopId || c.workerId, c.repairCode), c.offer]));
}

async function offerFor({ shopId = null, workerId = null }, repairCode) {
  if (!repairCode || (!shopId && !workerId)) return null;
  const cap = await ProviderCapability.findOne({ ...(shopId ? { shopId } : { workerId }), repairCode, isActive: true }).select('offer').lean();
  return isLive(cap?.offer) ? cap.offer : null;
}

// What a partner may set: up to half off, a whole-rupee amount, ending within 90 days if dated; null clears it.
function cleanOffer(input, now = new Date()) {
  if (input == null) return null;
  const kind = input.kind;
  const value = Number(input.value);
  if (kind === 'pct' && !(Number.isInteger(value) && value >= 5 && value <= MAX_PCT)) throw httpError(`An offer is 5% to ${MAX_PCT}% off.`, 400, 'BAD_OFFER');
  if (kind === 'flat' && !(Number.isInteger(value) && value >= 1000 && value % 100 === 0 && value <= 10000000)) throw httpError('Take off at least ₹10, in whole rupees.', 400, 'BAD_OFFER');
  if (!['pct', 'flat'].includes(kind)) throw httpError('Choose % off or ₹ off.', 400, 'BAD_OFFER');
  let endsAt = null;
  if (input.endsAt) {
    endsAt = new Date(input.endsAt);
    if (Number.isNaN(endsAt.getTime()) || endsAt <= now) throw httpError('The offer must end in the future.', 400, 'BAD_OFFER');
    if (endsAt - now > MAX_DAYS * 86400000) throw httpError(`An offer can run for up to ${MAX_DAYS} days.`, 400, 'BAD_OFFER');
  }
  return { kind, value, endsAt };
}

async function setOffer(owner, repairCode, input) {
  const offer = cleanOffer(input);
  const filter = { ...(owner.shopId ? { shopId: new mongoose.Types.ObjectId(String(owner.shopId)) } : { workerId: new mongoose.Types.ObjectId(String(owner.workerId)) }), repairCode };
  const cap = await ProviderCapability.findOne(filter).select('_id isActive').lean();
  if (!cap) throw httpError('Add this job to your menu first.', 404, 'NOT_ON_MENU');
  await ProviderCapability.updateOne({ _id: cap._id }, { $set: { offer } });
  return offer;
}

module.exports = { isLive, labelOf, offPaise, withOffer, offerMap, offerFor, cleanOffer, setOffer, keyOf, MAX_PCT, MAX_DAYS };
