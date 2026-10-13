/**
 * "Also add…": what to suggest next to a service someone is booking, so the
 * platform gets smarter as it is used.
 *
 *   learned   services booked together: in the same group, or by the same
 *             customer within a day, over the last LOOKBACK_DAYS. Scored by
 *             how often the pair happens relative to how common the second
 *             service is (lift), so popular services do not drown the rest.
 *   fallback  until there is enough history: the most booked services of the
 *             same kind (vertical), then other active ones in it.
 *
 * Only active services are ever suggested, never the one already chosen.
 */
const { RepairBooking } = require('../models/booking.model');
const { Repair } = require('../models/repair.model');

const LOOKBACK_DAYS = 120;
const MIN_PAIRS = 3;   // a pair seen fewer times than this is noise
const LIMIT = 3;
const MAX_ROWS = 20000;         // the most recent bookings read, so it stays fast as volume grows
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

const keyOf = (b) => `${b.vertical}|${b.repairCode}`;

/** Pairs booked together, counted once per customer visit. */
async function togetherCounts(vertical, repairCode) {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
  const rows = await RepairBooking.find({ createdAt: { $gte: since }, repairCode: { $ne: null }, status: { $nin: ['CANCELLED', 'EXPIRED', 'REJECTED'] } })
    .select('userId groupId vertical repairCode createdAt').sort({ createdAt: -1 }).limit(MAX_ROWS).lean();
  // A "visit": a group, else the same customer within a day.
  const visits = new Map();
  for (const b of rows) {
    const k = b.groupId ? `g:${b.groupId}` : `u:${b.userId}:${Math.floor(new Date(b.createdAt).getTime() / 86400000)}`;
    if (!visits.has(k)) visits.set(k, new Set());
    visits.get(k).add(keyOf(b));
  }
  const target = `${vertical}|${repairCode}`;
  const together = new Map();
  const popularity = new Map();
  for (const items of visits.values()) {
    for (const it of items) popularity.set(it, (popularity.get(it) || 0) + 1);
    if (!items.has(target)) continue;
    for (const it of items) if (it !== target) together.set(it, (together.get(it) || 0) + 1);
  }
  return { together, popularity, visits: visits.size };
}

async function suggest({ vertical, repairCode }) {
  const key = `${vertical}|${repairCode}`;
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - CACHE_MS) return hit.value;
  const value = await compute({ vertical, repairCode });
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

async function compute({ vertical, repairCode }) {
  const { together, popularity, visits } = await togetherCounts(vertical, repairCode);
  const learned = [...together.entries()]
    .filter(([, n]) => n >= MIN_PAIRS)
    // Lift: together this often, against how often it is booked at all.
    .map(([k, n]) => ({ k, score: n * (visits / Math.max(1, popularity.get(k) || 1)) }))
    .sort((a, b) => b.score - a.score)
    .map(({ k }) => ({ k, reason: 'Often booked together' }));

  const popular = [...popularity.entries()]
    .filter(([k]) => k.startsWith(`${vertical}|`) && k !== `${vertical}|${repairCode}`)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => ({ k, reason: 'Popular' }));

  const picked = [];
  const seen = new Set([`${vertical}|${repairCode}`]);
  for (const c of [...learned, ...popular]) {
    if (picked.length >= LIMIT) break;
    if (!seen.has(c.k)) { seen.add(c.k); picked.push(c); }
  }
  // Still short (a new platform): other active services of the same kind.
  if (picked.length < LIMIT) {
    const more = await Repair.find({ vertical, isActive: true, code: { $ne: repairCode } }).select('code vertical').limit(LIMIT * 2).lean();
    for (const r of more) {
      const k = `${r.vertical}|${r.code}`;
      if (picked.length >= LIMIT) break;
      if (!seen.has(k)) { seen.add(k); picked.push({ k, reason: 'You might also need' }); }
    }
  }

  const codes = picked.map((p) => p.k.split('|'));
  const repairs = await Repair.find({ $or: codes.map(([v, c]) => ({ vertical: v, code: c })), isActive: true }).select('code vertical name').lean();
  const byKey = new Map(repairs.map((r) => [`${r.vertical}|${r.code}`, r]));
  return picked.filter((p) => byKey.has(p.k)).map((p) => {
    const r = byKey.get(p.k);
    return { vertical: r.vertical, repairCode: r.code, name: r.name, reason: p.reason };
  });
}

module.exports = { suggest, MIN_PAIRS };
