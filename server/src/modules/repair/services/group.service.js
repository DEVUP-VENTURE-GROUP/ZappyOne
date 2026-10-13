/**
 * Several vehicles or devices in one booking: two bikes washed, a bike and a
 * car serviced, a phone and a laptop repaired. One address, one time, one
 * checkout.
 *
 *   items     each is an ordinary RepairBooking (own price, warranty, photos,
 *             report) carrying the group's id, so everything downstream that
 *             works per booking keeps working
 *   plan      'single' when one provider can do every item (preferred: one
 *             trip, one offer), else 'split': each item to the best provider
 *             who can do it, and the customer is told before confirming
 *   money     the visit (or pickup and return) once per provider travelling,
 *             the platform fee once per group, and every item after the first
 *             less RepairConfig.groupDiscountPct (0 = off), as its own line
 *   together  a provider accepting, passing or being given one item does the
 *             same for their other items in the group (followSiblings)
 *
 * The server always works the prices out itself; the client only says which
 * option it picked.
 */
const crypto = require('crypto');
const { RepairBookingGroup } = require('../models/group.model');
const { RepairBooking } = require('../models/booking.model');
const matchingService = require('./matching.service');
const pricingService = require('./pricing.service');
const { httpError } = require('../../../core/errors');
const logger = require('../../../core/logger');

const MAX_ITEMS = 6;
const keyOf = (p) => String(p.shopId || p.workerId);

function newGroupReference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return `ZG${out}`;
}

/** Who can do each item here, priced (matching.service), in item order. */
async function candidatesPerItem({ items, location, serviceMode, scheduledAt }) {
  const [lng, lat] = location.coordinates;
  return Promise.all(items.map(async (it) => {
    const { providers } = await matchingService.findProviders({
      vertical: it.vertical || 'mobile', repairCode: it.repairCode, brandCode: it.brandCode, modelCode: it.modelCode,
      qualityCode: it.qualityCode || null, serviceMode, lat, lng, cityCode: location.cityCode || null, scheduledAt,
    });
    return (providers || []).filter((p) => p.totalPaise != null);
  }));
}

/**
 * The bill for one way of doing the group: `assign[i]` is the provider for
 * item i. The first item each provider does carries their journey; the very
 * first item carries the platform fee; later items get the group discount.
 */
async function billFor(items, assign, serviceMode) {
  const seen = new Set();
  const lines = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const p = assign[i];
    const firstForProvider = !seen.has(keyOf(p));
    seen.add(keyOf(p));
    const cfg = await pricingService.getConfig(it.vertical || 'mobile');
    const discountPaise = i > 0 ? Math.round((p.totalPaise * (cfg.groupDiscountPct || 0)) / 100) : 0;
    // The same flags the booking is made with (create), so the bill is the booking's.
    const skipJourney = !firstForProvider;
    const skipPlatformFee = i > 0;
    const snap = await pricingService.buildPriceSnapshot({
      vertical: it.vertical || 'mobile', repairCode: it.repairCode, serviceMode, discountPaise,
      providerPrice: { ...(p.price || {}), totalPaise: p.totalPaise },
      distanceKm: p.journeyKm ?? null, skipJourney, skipPlatformFee,
    });
    lines.push({
      index: i, pricePaise: p.totalPaise, discountPaise,
      journeyPaise: (snap.travelPaise || 0) + (snap.pickupPaise || 0) + (snap.returnPaise || 0),
      platformFeePaise: snap.platformFeePaise || 0, taxPaise: snap.taxPaise || 0, totalPaise: snap.totalPaise,
      skipJourney, skipPlatformFee,
    });
  }
  const sum = (k) => lines.reduce((a, l) => a + (l[k] || 0), 0);
  return {
    lines,
    totals: {
      itemsPaise: sum('pricePaise'), discountPaise: sum('discountPaise'), journeyPaise: sum('journeyPaise'),
      platformFeePaise: sum('platformFeePaise'), taxPaise: sum('taxPaise'), totalPaise: sum('totalPaise'),
    },
  };
}

const publicProvider = (p) => ({
  shopId: p.shopId || null, workerId: p.workerId || null, name: p.name, imageUrl: p.imageUrl || null,
  rating: p.rating ?? null, completedJobs: p.completedJobs ?? null, distanceKm: p.distanceKm ?? null,
});

/**
 * The ways this group can be done: up to three single-provider options,
 * cheapest first, and the split plan when nobody can do everything.
 */
async function quote({ items, location, serviceMode = 'doorstep', scheduledAt = null }) {
  if (!Array.isArray(items) || items.length < 2) throw httpError('Add at least two items to book together', 400, 'GROUP_TOO_SMALL');
  if (items.length > MAX_ITEMS) throw httpError(`Up to ${MAX_ITEMS} items in one booking`, 400, 'GROUP_TOO_LARGE');
  if (items.some((it) => !it.repairCode)) throw httpError('Each item needs its repair or service chosen', 400, 'GROUP_ITEM_UNPRICED');

  const perItem = await candidatesPerItem({ items, location, serviceMode, scheduledAt });
  const missing = perItem.findIndex((list) => !list.length);
  if (missing >= 0) {
    return { options: [], split: null, unavailable: [missing], reason: 'NO_PROVIDER_FOR_ITEM' };
  }

  // Providers who can do every item, with each item's own row for that provider.
  const byKey = perItem.map((list) => new Map(list.map((p) => [keyOf(p), p])));
  const common = [...byKey[0].keys()].filter((key) => byKey.every((m) => m.has(key)));
  const options = [];
  for (const key of common) {
    const assign = byKey.map((m) => m.get(key));
    const bill = await billFor(items, assign, serviceMode);
    options.push({ plan: 'single', provider: publicProvider(assign[0]), ...bill });
  }
  options.sort((a, b) => a.totals.totalPaise - b.totals.totalPaise || (b.provider.rating || 0) - (a.provider.rating || 0));

  // Nobody does it all: each item to its top-ranked provider.
  let split = null;
  if (!options.length) {
    const assign = perItem.map((list) => list[0]);
    const bill = await billFor(items, assign, serviceMode);
    split = { plan: 'split', providers: assign.map(publicProvider), ...bill };
  }
  return { options: options.slice(0, 3), split, unavailable: [] };
}

/** Cancel items already made when the group could not be completed. Never throws. */
async function undo(bookingIds) {
  for (const id of bookingIds) {
    try {
      const b = await RepairBooking.findById(id);
      if (!b || ['CANCELLED', 'COMPLETED'].includes(b.status)) continue;
      b.applyTransition('CANCELLED', { actorRole: 'system', reason: 'group booking could not be completed' });
      await b.save();
      require('./events.service').announceOfferClosed(b, 'cancelled');
    } catch (e) {
      logger.warn({ err: e.message, bookingId: String(id) }, '[group] could not undo an item');
    }
  }
}

/**
 * Book the group. `choice` is the provider key of a single-provider option
 * ('shop:<id>' / 'worker:<id>'), or 'split'; omitted, the best option is used.
 * Prices are worked out again here, never taken from the client.
 */
async function create({ userId, items, location, serviceMode = 'doorstep', scheduledAt = null, slotLabel = '', paymentMethod = 'cash', choice = null, idempotencyKey = null }) {
  if (idempotencyKey) {
    const existing = await RepairBookingGroup.findOne({ idempotencyKey }).lean();
    if (existing) return { group: existing, bookings: await RepairBooking.find({ _id: { $in: existing.bookingIds } }).lean(), replayed: true };
  }
  const q = await quote({ items, location, serviceMode, scheduledAt });
  const chosen = choice && choice !== 'split'
    ? q.options.find((o) => `${o.provider.shopId ? 'shop' : 'worker'}:${o.provider.shopId || o.provider.workerId}` === choice)
    : (choice === 'split' ? q.split : null) || q.options[0] || q.split;
  if (!chosen) throw httpError('Nobody nearby can do these right now', 409, 'NO_PROVIDER_FOR_GROUP');

  const group = await RepairBookingGroup.create({
    reference: newGroupReference(), userId, plan: chosen.plan, serviceMode, scheduledAt,
    location: { address: location.address, coordinates: location.coordinates }, totals: chosen.totals, idempotencyKey,
  });
  // Items per provider, so each offer can say "2 items at this visit".
  const providerOf = (i) => (chosen.plan === 'single' ? chosen.provider : chosen.providers[i]);
  const perProvider = new Map();
  items.forEach((_, i) => { const k = keyOf(providerOf(i)); perProvider.set(k, (perProvider.get(k) || 0) + 1); });
  const made = [];
  try {
    const { createBooking } = require('./booking/create');
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      const p = chosen.plan === 'single' ? chosen.provider : chosen.providers[i];
      const line = chosen.lines[i];
      const { booking } = await createBooking({
        ...it, userId, serviceMode, location, scheduledAt, slotLabel, paymentMethod,
        shopId: p.shopId || null, workerId: p.workerId || null,
        discountPaise: line.discountPaise, skipJourney: line.skipJourney, skipPlatformFee: line.skipPlatformFee,
        groupId: group._id, itemLabel: it.label || '', groupSize: perProvider.get(keyOf(p)) || 1,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}:${i}` : null,
      });
      made.push(booking._id);
    }
  } catch (err) {
    await undo(made);
    await RepairBookingGroup.deleteOne({ _id: group._id });
    throw err;
  }
  await RepairBookingGroup.updateOne({ _id: group._id }, { $set: { bookingIds: made } });
  return { group: { ...group.toObject(), bookingIds: made }, bookings: await RepairBooking.find({ _id: { $in: made } }).lean(), replayed: false };
}

/** The customer's group with its items. */
async function get(id, userId) {
  const group = await RepairBookingGroup.findOne({ _id: id, userId }).lean();
  if (!group) throw httpError('Booking not found', 404, 'NOT_FOUND');
  const bookings = await RepairBooking.find({ _id: { $in: group.bookingIds } }).lean();
  const order = new Map(group.bookingIds.map((b, i) => [String(b), i]));
  bookings.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
  return { group, bookings };
}

/**
 * The provider's other items in this group, still waiting where this one was.
 * A provider answers for the whole visit: accept one, accept all; pass on
 * one, pass on all; a shop giving one to a technician gives them all.
 */
async function siblingsOf(booking, statuses) {
  if (!booking?.groupId) return [];
  const provider = booking.shopId ? { shopId: booking.shopId } : booking.workerId ? { workerId: booking.workerId } : null;
  if (!provider) return [];
  return RepairBooking.find({ groupId: booking.groupId, _id: { $ne: booking._id }, ...provider, status: { $in: statuses } }).select('_id').lean();
}

module.exports = { quote, create, get, siblingsOf, billFor, MAX_ITEMS };
