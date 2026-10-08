/**
 * Price requests: the customer asks the shops around them for a price when none
 * of them has priced this exact repair yet.
 *
 *   customer asks   every shop approved for the service whose area covers the
 *                   address is told (push + live). Nothing is booked yet.
 *   shop answers    with its price (and part grade, warranty). The answer is
 *                   saved as the shop's own price for that device, so it also
 *                   shows to the next customer without asking. A shop may
 *                   change its answer until the customer books.
 *   customer books  one of the answers through the normal booking (same
 *                   totals, fees and rules as any shop booking). The other
 *                   shops are told it went elsewhere.
 *
 * Open for OPEN_MINUTES; after that it closes and the customer is offered an
 * inspection. A customer has at most MAX_OPEN open at once, and asking twice
 * for the same device and repair returns the first request.
 */
const mongoose = require('mongoose');
const crypto = require('crypto');
const { RepairPriceRequest } = require('../models/price-request.model');
const { Repair } = require('../models/repair.model');
const { ProviderCapability } = require('../models/capability.model');
const { httpError } = require('../../../core/errors');
const logger = require('../../../core/logger');

const OPEN_MINUTES = 180;
const MAX_OPEN = 3;
const PART_GRADES = ['oem', 'premium', 'standard'];
const isPartBased = (repair) => !!repair.componentCode || (repair.partRequirements || []).length > 0;

const reference = () => `PR${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const isLive = (r) => r.status === 'open' && new Date(r.expiresAt) > new Date();

async function names(r) {
  const [brand, model, repair] = await Promise.all([
    require('../../service/brand.model').findOne({ code: r.brandCode }).select('name').lean(),
    require('../../service/device-model.model').findOne({ code: r.modelCode }).select('name').lean(),
    Repair.findOne({ code: r.repairCode, vertical: r.vertical }).select('name').lean(),
  ]).catch(() => [null, null, null]);
  return {
    device: [brand?.name || r.brandCode, model?.name || r.modelCode].filter(Boolean).join(' '),
    repair: repair?.name || r.repairCode,
  };
}

/** Shops approved for the line whose service area covers this address. */
async function shopsAround({ lineCode, lat, lng, serviceMode }) {
  const matching = require('./matching.service');
  const [areas, approved] = await Promise.all([
    matching.findServiceableProviders({ lat, lng, serviceMode }),
    require('../../onboarding/eligibility').approvedProviders(lineCode),
  ]);
  const ok = new Set(approved.filter((p) => p.kind === 'shop').map((p) => p.id));
  const Shop = require('../../shop/shop.model');
  const shopIds = areas.filter((a) => a.shopId && ok.has(String(a.shopId))).map((a) => a.shopId);
  const live = await Shop.find({ _id: { $in: shopIds }, isActive: { $ne: false }, isBlocked: { $ne: true } }).select('_id').lean();
  const liveIds = new Set(live.map((s) => String(s._id)));
  return areas.filter((a) => a.shopId && liveIds.has(String(a.shopId)));
}

async function create({ userId, body }) {
  const { vertical, brandCode, modelCode, repairCode, serviceMode = 'doorstep', location } = body;
  const repair = await Repair.findOne({ code: repairCode, vertical, isActive: true }).lean();
  if (!repair) throw httpError('We could not find that repair.', 404, 'UNKNOWN_REPAIR');
  if (repair.pricingMode === 'diagnosis_required') {
    throw httpError('This one needs an inspection before anyone can price it.', 409, 'NEEDS_INSPECTION');
  }
  const line = await require('../../jobs/kinds').KINDS.repair.line({ vertical });
  if (!line) throw httpError('This service is not available yet.', 409, 'NO_LINE');

  const uid = new mongoose.Types.ObjectId(userId);
  const open = await RepairPriceRequest.find({ userId: uid, status: 'open', expiresAt: { $gt: new Date() } }).lean();
  const same = open.find((r) => r.vertical === vertical && r.modelCode === modelCode && r.repairCode === repairCode);
  if (same) return { request: same, reused: true };
  if (open.length >= MAX_OPEN) {
    throw httpError(`You already have ${MAX_OPEN} price requests open. Book or cancel one first.`, 429, 'TOO_MANY_OPEN');
  }

  const [lng, lat] = location.coordinates;
  const shops = await shopsAround({ lineCode: line, lat, lng, serviceMode });
  if (!shops.length) {
    throw httpError('No repair shop near you does this yet. We will let you know when one does.', 409, 'NO_SHOPS_NEARBY');
  }

  const request = await RepairPriceRequest.create({
    reference: reference(), userId: uid, vertical, lineCode: line, brandCode, modelCode,
    configurationCode: body.configurationCode || null, problemCodes: body.problemCodes || [],
    repairCode, serviceMode, location: { type: 'Point', coordinates: [lng, lat], address: location.address || '' },
    expiresAt: new Date(Date.now() + OPEN_MINUTES * 60000),
    notifiedShopIds: shops.map((s) => s.shopId),
  });

  // Every shop around is told at once: live on an open screen, and by push.
  const n = await names(request);
  const { toProvider } = require('../../jobs/job-events');
  const send = require('../../messaging/send').send;
  for (const s of shops) {
    toProvider('shop', s.shopId, 'price_request.new', { id: String(request._id), reference: request.reference });
    send('provider.price_request', {
      to: { kind: 'shop', id: s.shopId }, refId: `pricereq:${request._id}:${s.shopId}`,
      ctx: { device: n.device, repair: n.repair, km: s.distanceKm },
    }).catch(() => {});
  }
  return { request: request.toObject(), reused: false, shopsAsked: shops.length };
}

/** A shop answers with its price. Saved as the shop's own price for this device too. */
async function offer({ shopId, id, totalPaise, qualityCode = null, warrantyDays = 0, note = '', requestedById }) {
  const request = await RepairPriceRequest.findById(id);
  if (!request) throw httpError('That request is no longer here.', 404, 'NOT_FOUND');
  if (!request.notifiedShopIds.some((s) => String(s) === String(shopId))) throw httpError('This request was not sent to your shop.', 403, 'NOT_YOURS');
  if (!isLive(request)) throw httpError('The customer has already decided, or the request has closed.', 409, 'CLOSED');

  const repair = await Repair.findOne({ code: request.repairCode, vertical: request.vertical, isActive: true }).lean();
  if (!repair) throw httpError('That repair is no longer offered.', 409, 'UNKNOWN_REPAIR');
  if (isPartBased(repair) && !PART_GRADES.includes(qualityCode)) {
    throw httpError('Choose the part grade you would fit: original, premium or standard.', 400, 'GRADE_REQUIRED');
  }
  if (!(totalPaise >= 5000 && totalPaise <= 20000000)) throw httpError('Enter a price between ₹50 and ₹2,00,000.', 400, 'BAD_PRICE');

  const shopOid = new mongoose.Types.ObjectId(shopId);
  // Their answer is their price for this device from now on (same rules as the price sheet).
  const { applyPriceSubmission } = require('../controllers/provider/pricing.controller');
  const saved = await applyPriceSubmission({
    owner: { shopId: shopOid, workerId: null }, vertical: request.vertical, requestedByRole: 'shop', requestedById,
    row: {
      repairCode: request.repairCode, brandCode: request.brandCode, modelCode: request.modelCode,
      qualityCode: isPartBased(repair) ? qualityCode : null, totalPaise, warrantyDays,
    },
  });
  if (saved.error) throw httpError(saved.error.body.error, saved.error.status || 400, saved.error.body.code);

  // And they do this repair, the way the customer asked for it.
  await ProviderCapability.findOneAndUpdate(
    { shopId: shopOid, vertical: request.vertical, repairCode: request.repairCode },
    {
      $set: { isActive: true, verificationStatus: 'approved' },
      $addToSet: { serviceModes: request.serviceMode },
      $setOnInsert: { providerKind: 'shop', brandCodes: [], skillLevel: Math.max(repair.minSkillLevel || 1, 1) },
    },
    { upsert: true },
  );

  const at = request.offers.findIndex((o) => String(o.shopId) === String(shopId));
  const row = { shopId: shopOid, totalPaise, qualityCode: isPartBased(repair) ? qualityCode : null, warrantyDays, note: String(note || '').slice(0, 300), at: new Date() };
  if (at >= 0) request.offers[at] = row; else request.offers.push(row);
  await request.save();

  // The customer hears it live and by push.
  const Shop = require('../../shop/shop.model');
  const shop = await Shop.findById(shopOid).select('businessName').lean();
  const n = await names(request);
  require('../../jobs/job-events').toProvider('user', request.userId, 'price_request.offer', { id: String(request._id) });
  require('../../messaging/send').send('customer.price_offer', {
    to: { kind: 'user', id: request.userId }, refId: `pricereq:${request._id}:offer:${shopId}:${totalPaise}`,
    ctx: { shop: shop?.businessName || 'A shop', price: `₹${Math.round(totalPaise / 100).toLocaleString('en-IN')}`, repair: n.repair, id: String(request._id) },
  }).catch(() => {});
  return request.toObject();
}

/** What the customer sees: the request, and each answering shop as a bookable card. */
async function viewForCustomer({ id, userId }) {
  const request = await RepairPriceRequest.findOne({ _id: id, userId });
  if (!request) throw httpError('We could not find that request.', 404, 'NOT_FOUND');
  if (request.status === 'open' && !isLive(request)) {
    request.status = 'expired'; request.closedAt = new Date(); await request.save();
  }
  const n = await names(request);
  let providers = [];
  if (request.offers.length) {
    // The same cards, totals and ranking as any shop list, limited to the shops that answered.
    const [lng, lat] = request.location.coordinates;
    const found = await require('./matching.service').findProviders({
      vertical: request.vertical, repairCode: request.repairCode, brandCode: request.brandCode,
      modelCode: request.modelCode, serviceMode: request.serviceMode, lat, lng,
    }).catch((e) => { logger.warn({ err: e.message }, '[price-request] providers'); return { providers: [] }; });
    const answered = new Set(request.offers.map((o) => String(o.shopId)));
    providers = (found.providers || []).filter((p) => p.shopId && answered.has(String(p.shopId)));
  }
  return {
    request: { ...request.toObject(), deviceName: n.device, repairName: n.repair, shopsAsked: request.notifiedShopIds.length },
    providers,
  };
}

/** Open requests sent to this shop, with its own answer (never the other shops' prices). */
async function listForShop({ shopId }) {
  const sid = new mongoose.Types.ObjectId(shopId);
  const rows = await RepairPriceRequest.find({ notifiedShopIds: sid, status: 'open', expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 }).limit(50).lean();
  const Shop = require('../../shop/shop.model');
  const shop = await Shop.findById(sid).select('address.location').lean();
  const here = shop?.address?.location?.coordinates;
  const km = (c) => {
    if (!here || !c) return null;
    const R = 6371; const toR = (d) => (d * Math.PI) / 180;
    const dLat = toR(c[1] - here[1]); const dLng = toR(c[0] - here[0]);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(here[1])) * Math.cos(toR(c[1])) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
  };
  const out = [];
  for (const r of rows) {
    const n = await names(r);
    const repair = await Repair.findOne({ code: r.repairCode, vertical: r.vertical }).select('componentCode partRequirements').lean();
    const mine = r.offers.find((o) => String(o.shopId) === String(sid)) || null;
    out.push({
      _id: r._id, reference: r.reference, vertical: r.vertical, deviceName: n.device, repairName: n.repair,
      serviceMode: r.serviceMode, area: (r.location.address || '').split(',').slice(-3, -1).join(',').trim(),
      distanceKm: km(r.location.coordinates), expiresAt: r.expiresAt, createdAt: r.createdAt,
      needsGrade: repair ? isPartBased(repair) : false, myOffer: mine, answers: r.offers.length,
    });
  }
  return out;
}

async function cancel({ id, userId }) {
  const request = await RepairPriceRequest.findOneAndUpdate(
    { _id: id, userId, status: 'open' }, { $set: { status: 'cancelled', closedAt: new Date() } }, { new: true },
  );
  if (!request) throw httpError('This request is already closed.', 409, 'CLOSED');
  return request.toObject();
}

/** A booking made from a request closes it and tells the shops who were not chosen. */
async function markBooked({ priceRequestId, userId, bookingId, shopId }) {
  if (!priceRequestId) return;
  const request = await RepairPriceRequest.findOneAndUpdate(
    { _id: priceRequestId, userId, status: 'open' },
    { $set: { status: 'booked', bookingId, bookedShopId: shopId || null, closedAt: new Date() } },
    { new: true },
  ).lean();
  if (!request) return;
  const n = await names(request);
  for (const o of request.offers) {
    if (String(o.shopId) === String(shopId)) continue;
    require('../../messaging/send').send('provider.price_request_closed', {
      to: { kind: 'shop', id: o.shopId }, refId: `pricereq:${request._id}:closed:${o.shopId}`, ctx: { device: n.device, repair: n.repair },
    }).catch(() => {});
  }
}

module.exports = { create, offer, viewForCustomer, listForShop, cancel, markBooked, OPEN_MINUTES, MAX_OPEN };
