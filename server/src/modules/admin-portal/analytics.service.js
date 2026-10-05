/**
 * Business analytics for admin Insights and Overview, from the bookings the
 * platform takes today: repairs, pet care, helping and events. The retired
 * order engine is left out on purpose; its old rows made every chart stale.
 *
 * One pass per period over the four booking collections, normalised by
 * bookings.source (money in paise, five status buckets), plus where the job
 * was (area only, never a full address) and how long it took to get a
 * provider. Every figure comes with the previous period of the same length,
 * so each number on screen can say whether it is going up or down.
 *
 * Results are cached for three minutes per period: dashboards poll, the
 * database should not feel it.
 */
const { NORMALISERS } = require('./bookings.source');
const { KINDS } = require('../jobs/kinds');
const { areaOf } = require('../jobs/privacy');

const KIND_SOURCES = ['repair', 'pet', 'helping', 'event'];
const DAY = 86_400_000;
const IST = 330 * 60_000;
const CACHE_MS = 3 * 60_000;

/** Statuses that mean a provider has the job, whichever kind it is. */
const ASSIGNED = new Set(['PROVIDER_ASSIGNED', 'WORKER_ACCEPTED', 'WORKER_ASSIGNED', 'PROVIDER_ACCEPTED', 'partner_assigned']);

/** Midnight in India for the day containing `t`, as a timestamp. */
const istDayStart = (t) => Math.floor((t + IST) / DAY) * DAY - IST;
const istDate = (t) => new Date(t + IST).toISOString().slice(0, 10);

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const change = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

/** Labels the apps use for a pin, not a place: never shown as an area. */
const NOT_A_PLACE = /^(current|my|pinned|selected|your|home)\s*(location|place|pin|address)?$/i;

function areaFor(source, doc) {
  const raw = source === 'event'
    ? doc.address?.city || areaOf(doc.address?.line1 || '')
    : areaOf(KINDS[source]?.ops?.where?.(doc)?.address || '');
  return raw && !NOT_A_PLACE.test(raw.trim()) ? raw : null;
}

function assignMinutes(doc) {
  const hit = (doc.statusHistory || []).find((h) => ASSIGNED.has(h.status));
  if (!hit?.at || !doc.createdAt) return null;
  const m = (new Date(hit.at) - new Date(doc.createdAt)) / 60000;
  return m >= 0 && m < 7 * 24 * 60 ? Math.round(m) : null;
}

/** Every booking made in [from, to), normalised, with area and time to assign. */
async function bookingsIn(from, to) {
  const out = [];
  await Promise.all(KIND_SOURCES.map(async (source) => {
    const Model = KINDS[source].model();
    const docs = await Model.find({ createdAt: { $gte: new Date(from), $lt: new Date(to) } }).lean();
    for (const d of docs) {
      const r = NORMALISERS[source](d);
      out.push({
        ...r,
        // One name per service, as customers see it.
        service: r.serviceName,
        serviceKey: `${source}:${r.vertical || 'event'}`,
        area: areaFor(source, d),
        assignMin: assignMinutes(d),
        take: (r.commissionPaise || 0) + (r.platformFeePaise || 0),
        at: new Date(r.createdAt).getTime(),
        userId: r.userId ? String(r.userId) : null,
      });
    }
  }));
  return out;
}

/** Customers who had booked before `from`: the returning ones. */
async function bookedBefore(from, userIds) {
  if (!userIds.length) return new Set();
  const seen = new Set();
  await Promise.all(KIND_SOURCES.map(async (source) => {
    const ids = await KINDS[source].model().distinct('userId', { userId: { $in: userIds }, createdAt: { $lt: new Date(from) } });
    ids.forEach((id) => seen.add(String(id)));
  }));
  return seen;
}

function totals(rows) {
  const done = rows.filter((r) => r.statusBucket === 'completed');
  const cancelled = rows.filter((r) => r.statusBucket === 'cancelled');
  const gmv = done.reduce((s, r) => s + (r.totalPaise || 0), 0);
  const take = done.reduce((s, r) => s + r.take, 0);
  const assign = rows.map((r) => r.assignMin).filter((m) => m != null);
  return {
    bookings: rows.length,
    completed: done.length,
    cancelled: cancelled.length,
    active: rows.filter((r) => r.statusBucket === 'active').length,
    gmvPaise: gmv,
    takePaise: take,
    aovPaise: done.length ? Math.round(gmv / done.length) : 0,
    cancelRate: pct(cancelled.length, rows.length),
    medianAssignMin: median(assign),
    customers: new Set(rows.map((r) => r.userId).filter(Boolean)).size,
  };
}

function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = key(r);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

/**
 * Plain-language findings for the top of the screen: what moved, and what to
 * do about it. Only said when the numbers are big enough to mean something.
 */
function findings(cur, prev, byService) {
  const out = [];
  const d = change(cur.bookings, prev.bookings);
  if (cur.bookings >= 5 && d != null && Math.abs(d) >= 10) {
    out.push({ tone: d > 0 ? 'good' : 'bad', text: `Bookings ${d > 0 ? 'up' : 'down'} ${Math.abs(d)}% on the previous period.` });
  }
  const worst = byService.filter((s) => s.bookings >= 5 && s.cancelRate >= 25).sort((a, b) => b.cancelRate - a.cancelRate)[0];
  if (worst) out.push({ tone: 'bad', text: `${worst.label}: ${worst.cancelRate}% of bookings are cancelled. Check why on its stuck and cancelled jobs.` });
  const slow = byService.filter((s) => s.bookings >= 5 && s.medianAssignMin != null && s.medianAssignMin > 15).sort((a, b) => b.medianAssignMin - a.medianAssignMin)[0];
  if (slow) out.push({ tone: 'warn', text: `${slow.label}: a provider takes ${slow.medianAssignMin} min to accept. More providers are needed there.` });
  const best = [...byService].sort((a, b) => b.takePaise - a.takePaise)[0];
  if (best && best.takePaise > 0) out.push({ tone: 'good', text: `${best.label} earns the most: ₹${Math.round(best.takePaise / 100).toLocaleString('en-IN')} this period.` });
  return out;
}

const cache = new Map();

/**
 * Everything the Today and Money screens need for a period of `days` ending
 * now: headline numbers with the previous period, a daily series (India
 * days), each service and area, and findings in plain language.
 */
async function overview({ days = 7, now = Date.now() } = {}) {
  days = [1, 7, 30, 90].includes(Number(days)) ? Number(days) : 7;
  const key = `${days}:${Math.floor(now / CACHE_MS)}`;
  if (cache.has(key)) return cache.get(key);

  const end = now;
  const start = days === 1 ? istDayStart(now) : istDayStart(now) - (days - 1) * DAY;
  // Today is compared with yesterday up to the same time, not all of yesterday.
  const prevStart = days === 1 ? start - DAY : start - (end - start);
  const prevEnd = days === 1 ? end - DAY : start;
  const [rows, prevRows] = await Promise.all([bookingsIn(start, end), bookingsIn(prevStart, prevEnd)]);

  const cur = totals(rows);
  const prev = totals(prevRows);
  const returning = await bookedBefore(start, [...new Set(rows.map((r) => r.userId).filter(Boolean))]);
  cur.repeatCustomers = returning.size;
  cur.repeatRate = pct(returning.size, cur.customers);

  // Daily series (India days), with the previous period aligned beside it.
  const daily = [];
  for (let t = istDayStart(start), i = 0; t <= end; t += DAY, i += 1) {
    const inDay = rows.filter((r) => r.at >= t && r.at < t + DAY);
    const shift = start - prevStart;
    const prevDay = prevRows.filter((r) => r.at >= t - shift && r.at < t - shift + DAY);
    const tt = totals(inDay);
    daily.push({
      date: istDate(t), bookings: tt.bookings, completed: tt.completed, gmvPaise: tt.gmvPaise, takePaise: tt.takePaise,
      prevBookings: prevDay.length, prevTakePaise: totals(prevDay).takePaise,
    });
  }

  const prevByService = groupBy(prevRows, (r) => r.serviceKey);
  const byService = [...groupBy(rows, (r) => r.serviceKey)].map(([k, list]) => {
    const t = totals(list);
    return { key: k, label: list[0].service, source: list[0].source, ...t, prevBookings: prevByService.get(k)?.length || 0 };
  }).sort((a, b) => b.bookings - a.bookings);

  const byArea = [...groupBy(rows, (r) => r.area)].map(([area, list]) => {
    const t = totals(list);
    return { area, bookings: t.bookings, completed: t.completed, takePaise: t.takePaise, cancelRate: t.cancelRate };
  }).sort((a, b) => b.bookings - a.bookings).slice(0, 10);

  const delta = Object.fromEntries(['bookings', 'completed', 'gmvPaise', 'takePaise', 'aovPaise', 'customers'].map((k) => [k, change(cur[k], prev[k])]));

  const result = {
    range: { days, from: new Date(start), to: new Date(end) },
    current: cur,
    previous: prev,
    delta,
    daily,
    byService,
    byArea,
    findings: findings(cur, prev, byService),
    generatedAt: new Date(now),
  };
  cache.set(key, result);
  if (cache.size > 20) cache.delete(cache.keys().next().value);
  return result;
}

module.exports = { overview, bookingsIn, totals, istDayStart };
