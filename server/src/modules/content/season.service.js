/**
 * The festive season running now, for the customer home (content/season.model).
 * One at a time: if admin schedules two that overlap, the one that started
 * last shows. With none from admin, the built-in festival calendar fills in
 * (content/festival-calendar), unless admin switched that off by scheduling a
 * season that is not shown over the same days. Its offer is a live promo or nothing, so the strip never
 * promises a discount the checkout would refuse.
 */
const Season = require('./season.model');

const err = (status, code, message) => Object.assign(new Error(message), { status, code });

/** The promo behind the offer strip, as the strip shows it; null when it is not live. */
async function liveOffer(code, now = new Date()) {
  if (!code) return null;
  const Promo = require('../promo/promo.model');
  const p = await Promo.findOne({ code, isActive: true, 'validity.startAt': { $lte: now }, 'validity.endAt': { $gte: now } }).lean();
  if (!p) return null;
  if (p.limits?.totalUses && p.limits.usedCount >= p.limits.totalUses) return null;
  return {
    code: p.code, name: p.name, type: p.type, discountValue: p.discount.value,
    maxDiscountPaise: p.discount.maxDiscountPaise || 0, minOrderPaise: p.discount.minOrderPaise || 0,
    endAt: p.validity.endAt,
  };
}

/** What the customer home shows now, or null. */
async function current(now = new Date()) {
  const s = await Season.findOne({ startAt: { $lte: now }, endAt: { $gte: now } }).sort({ isActive: -1, startAt: -1 }).lean();
  if (!s) {
    const f = require('./festival-calendar').festivalAt(now);
    return f ? { id: f.id, name: f.name, theme: f.theme, greeting: f.greeting, headline: f.headline, subline: f.subline, endAt: f.endAt, tiles: f.tiles, offer: null, auto: true } : null;
  }
  // Admin's own season for these days, switched off: nothing festive (not even the built-in one).
  if (!s.isActive) return null;
  return {
    id: String(s._id), name: s.name, theme: s.theme, greeting: s.greeting, headline: s.headline, subline: s.subline,
    endAt: s.endAt, tiles: s.tiles || [], offer: await liveOffer(s.promoCode, now),
  };
}

/** Admin: the built-in festivals coming up, to customise or switch off. */
const upcomingAuto = (now = new Date()) => require('./festival-calendar').upcoming(now);

/** Admin: every season, newest first, with whether its offer is live. */
async function list() {
  const rows = await Season.find().sort({ startAt: -1 }).limit(100).lean();
  const now = new Date();
  return Promise.all(rows.map(async (s) => ({
    ...s, id: String(s._id),
    running: s.isActive && s.startAt <= now && s.endAt >= now,
    offerLive: !!(await liveOffer(s.promoCode, now)),
  })));
}

function check(body) {
  if (body.startAt && body.endAt && new Date(body.endAt) <= new Date(body.startAt)) throw err(400, 'BAD_DATES', 'The season must end after it starts');
}

async function create(body, adminId) {
  check(body);
  return Season.create({ ...body, updatedBy: String(adminId || '') });
}

async function update(id, body, adminId) {
  const before = await Season.findById(id).lean();
  if (!before) throw err(404, 'NOT_FOUND', 'Season not found');
  check({ startAt: body.startAt || before.startAt, endAt: body.endAt || before.endAt });
  const after = await Season.findByIdAndUpdate(id, { $set: { ...body, updatedBy: String(adminId || '') } }, { new: true, runValidators: true }).lean();
  return { before, after };
}

async function remove(id) {
  const before = await Season.findByIdAndDelete(id).lean();
  if (!before) throw err(404, 'NOT_FOUND', 'Season not found');
  return before;
}

module.exports = { current, list, upcomingAuto, create, update, remove, liveOffer };
