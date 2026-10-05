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

/**
 * A booking row's service line code, so bookings line up with searches and
 * provider enrolments: repairs by vertical, pet by category, helping by type.
 */
async function lineMapper() {
  const { ServiceLine } = require('../onboarding/onboarding.model');
  const { HELPING_LINE } = require('../jobs/kinds');
  const lines = await ServiceLine.find({}).select('code name repairVertical').lean();
  const byVertical = new Map(lines.filter((l) => l.repairVertical).map((l) => [l.repairVertical, l.code]));
  const name = new Map(lines.map((l) => [l.code, l.name]));
  const lineOf = (r) => (r.source === 'repair' ? byVertical.get(r.vertical) || null
    : r.source === 'pet' ? r.vertical : r.source === 'helping' ? HELPING_LINE[r.vertical] || null : r.source === 'event' ? 'events' : null);
  const label = (code) => name.get(code) || (code === 'events' ? 'Event décor' : String(code || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));
  return { lineOf, label };
}

/** Declines a booking records, whichever kind: [{ providerId }]. */
function declinesOf(source, doc) {
  if (source === 'repair') return (doc.declines || []).map((d) => String(d.providerId));
  if (source === 'pet') return (doc.declinedBy || []).map(String);
  if (source === 'helping') return (doc.statusHistory || []).filter((h) => h.status === 'WORKER_DECLINED' && h.by).map((h) => String(h.by));
  return [];
}

/**
 * Supply: do we have enough providers, in the right places, and do they
 * take the work? Per service: approved providers, online now, bookings, time
 * to a provider, jobs stuck now. Per provider: completed jobs, what they
 * earned, rating, declines and jobs dropped after taking them.
 */
async function supply({ days = 7, now = Date.now() } = {}) {
  days = [7, 30, 90].includes(Number(days)) ? Number(days) : 7;
  const key = `supply:${days}:${Math.floor(now / CACHE_MS)}`;
  if (cache.has(key)) return cache.get(key);
  const { ProviderEnrolment } = require('../onboarding/onboarding.model');
  const Worker = require('../worker/worker.model');
  const Shop = require('../shop/shop.model');
  const ops = require('../jobs/ops.service');
  const start = istDayStart(now) - (days - 1) * DAY;

  const [rows, enrol, stuck, map, rawDeclines] = await Promise.all([
    bookingsIn(start, now),
    ProviderEnrolment.find({ status: 'approved' }).select('lineCode providerKind workerId shopId').lean(),
    ops.stuckJobs({ now: new Date(now) }),
    lineMapper(),
    Promise.all(KIND_SOURCES.map(async (source) => {
      const docs = await KINDS[source].model().find({ createdAt: { $gte: new Date(start) } }).select('declines declinedBy statusHistory').lean();
      return docs.flatMap((d) => declinesOf(source, d));
    })),
  ]);
  const declineCount = new Map();
  for (const id of rawDeclines.flat()) declineCount.set(id, (declineCount.get(id) || 0) + 1);

  const workerIds = [...new Set(enrol.filter((e) => e.workerId).map((e) => String(e.workerId)))];
  const online = new Set((await Worker.find({ _id: { $in: workerIds }, isOnline: true }).select('_id').lean()).map((w) => String(w._id)));

  // Per service.
  const svc = new Map();
  const ensure = (code) => {
    if (!svc.has(code)) svc.set(code, { lineCode: code, label: map.label(code), providers: 0, shops: 0, workers: 0, online: 0, rows: [], stuck: 0 });
    return svc.get(code);
  };
  for (const e of enrol) {
    const s = ensure(e.lineCode);
    s.providers += 1;
    if (e.shopId) s.shops += 1; else s.workers += 1;
    if (e.workerId && online.has(String(e.workerId))) s.online += 1;
  }
  for (const r of rows) { const code = map.lineOf(r); if (code) ensure(code).rows.push(r); }
  for (const j of stuck) {
    const code = map.lineOf({ source: j.kind, vertical: j.vertical || null });
    if (code && svc.has(code)) svc.get(code).stuck += 1;
  }
  const services = [...svc.values()].map(({ rows: list, ...s }) => {
    const t = totals(list);
    return { ...s, bookings: t.bookings, completed: t.completed, cancelRate: t.cancelRate, medianAssignMin: t.medianAssignMin, perProvider: s.providers ? Math.round((t.bookings / s.providers) * 10) / 10 : null };
  }).sort((a, b) => b.bookings - a.bookings || b.providers - a.providers);

  // Per provider.
  const prov = new Map();
  for (const r of rows) {
    const id = r.shopId ? `shop:${r.shopId}` : r.workerId ? `worker:${r.workerId}` : null;
    if (!id) continue;
    if (!prov.has(id)) prov.set(id, { id, kind: r.shopId ? 'shop' : 'worker', completed: 0, dropped: 0, earnedPaise: 0, jobs: 0 });
    const p = prov.get(id);
    p.jobs += 1;
    if (r.statusBucket === 'completed') { p.completed += 1; p.earnedPaise += r.providerEarningPaise || 0; }
    if (r.statusBucket === 'cancelled') p.dropped += 1;
  }
  const ids = [...prov.values()];
  const [workers, shops] = await Promise.all([
    Worker.find({ _id: { $in: ids.filter((p) => p.kind === 'worker').map((p) => p.id.split(':')[1]) } }).select('name rating reviewCount').lean(),
    Shop.find({ _id: { $in: ids.filter((p) => p.kind === 'shop').map((p) => p.id.split(':')[1]) } }).select('businessName rating reviewCount').lean(),
  ]);
  const who = new Map([...workers.map((w) => [`worker:${w._id}`, { name: w.name, rating: w.rating, reviews: w.reviewCount }]),
    ...shops.map((s) => [`shop:${s._id}`, { name: s.businessName, rating: s.rating, reviews: s.reviewCount }])]);
  const providers = ids.map((p) => {
    const info = who.get(p.id) || {};
    return { ...p, name: info.name || 'Provider', rating: info.rating || null, reviews: info.reviews || 0, declines: declineCount.get(p.id.split(':')[1]) || 0 };
  }).sort((a, b) => b.completed - a.completed || b.earnedPaise - a.earnedPaise).slice(0, 12);

  const totalProviders = enrol.length;
  const findings = [];
  const none = services.filter((s) => !s.providers && s.bookings).sort((a, b) => b.bookings - a.bookings)[0];
  if (none) findings.push({ tone: 'bad', text: `${none.label} has ${none.bookings} bookings and no approved provider. Approve or recruit now.` });
  const busy = services.filter((s) => s.perProvider >= 8).sort((a, b) => b.perProvider - a.perProvider)[0];
  if (busy) findings.push({ tone: 'warn', text: `${busy.label}: ${busy.perProvider} bookings per provider this period. Add providers before they burn out.` });
  const slow = services.filter((s) => s.bookings >= 5 && s.medianAssignMin > 15).sort((a, b) => b.medianAssignMin - a.medianAssignMin)[0];
  if (slow) findings.push({ tone: 'warn', text: `${slow.label}: ${slow.medianAssignMin} min to get a provider. More providers online at peak hours would fix it.` });
  const decliner = providers.filter((p) => p.declines >= 5).sort((a, b) => b.declines - a.declines)[0];
  if (decliner) findings.push({ tone: 'warn', text: `${decliner.name} passed on ${decliner.declines} jobs. A call to understand why is worth it.` });
  const stuckNow = stuck.length;
  if (stuckNow) findings.push({ tone: 'bad', text: `${stuckNow} live ${stuckNow === 1 ? 'job is' : 'jobs are'} past the time limit right now.` });

  const result = {
    range: { days, from: new Date(start), to: new Date(now) },
    totals: { providers: totalProviders, online: services.reduce((s, x) => s + x.online, 0), stuckNow, activeProviders: ids.length },
    services, providers, findings,
  };
  cache.set(key, result);
  return result;
}

/**
 * Funnel: where do customers drop off? People at each step of the period:
 * visited, searched, opened a booking, booked, completed. Each step is
 * counted on its own (a customer can book without searching), and the
 * drop between steps is what to fix first.
 */
async function funnel({ days = 7, now = Date.now() } = {}) {
  days = [7, 30, 90].includes(Number(days)) ? Number(days) : 7;
  const key = `funnel:${days}:${Math.floor(now / CACHE_MS)}`;
  if (cache.has(key)) return cache.get(key);
  const { VisitorSession, SearchEvent } = require('../telemetry/telemetry.model');
  const start = istDayStart(now) - (days - 1) * DAY;
  const range = { $gte: new Date(start), $lte: new Date(now) };
  const customerSide = { userType: { $in: ['guest', 'user'] } };

  const [visitors, searchers, opened, rows, map, perLineSearch] = await Promise.all([
    VisitorSession.countDocuments({ ...customerSide, lastSeen: range }),
    SearchEvent.aggregate([
      { $match: { createdAt: range, category: { $ne: 'all_services' } } },
      { $group: { _id: { $ifNull: ['$userId', { $ifNull: ['$sessionId', '$_id'] }] } } },
      { $count: 'n' },
    ]),
    VisitorSession.countDocuments({ ...customerSide, bookingStartedAt: range }),
    bookingsIn(start, now),
    lineMapper(),
    SearchEvent.aggregate([
      { $match: { createdAt: range, category: { $nin: ['all_services', 'unmatched'] } } },
      { $group: { _id: { c: '$category', who: { $ifNull: ['$userId', { $ifNull: ['$sessionId', '$_id'] }] } } } },
      { $group: { _id: '$_id.c', people: { $sum: 1 } } },
    ]),
  ]);
  const people = (list) => new Set(list.map((r) => r.userId).filter(Boolean)).size;
  const booked = people(rows);
  const completed = people(rows.filter((r) => r.statusBucket === 'completed'));
  const steps = [
    { key: 'visited', label: 'Visited the app', people: visitors },
    { key: 'searched', label: 'Searched', people: searchers[0]?.n || 0 },
    { key: 'opened', label: 'Opened a booking', people: opened },
    { key: 'booked', label: 'Booked', people: booked },
    { key: 'completed', label: 'Job completed', people: completed },
  ];
  // "Opened a booking" is recorded from when tracking began: with none yet but
  // bookings made, it is not a real zero, so it is marked and skipped over.
  const openedStep = steps.find((s) => s.key === 'opened');
  if (openedStep.people === 0 && booked > 0) openedStep.notRecorded = true;
  for (let i = 0; i < steps.length; i += 1) {
    const s = steps[i];
    let j = i - 1;
    while (j >= 0 && steps[j].notRecorded) j -= 1;
    s.ofFirst = steps[0].people ? Math.round((s.people / steps[0].people) * 1000) / 10 : null;
    s.fromPrevious = j >= 0 && steps[j].people && !s.notRecorded ? Math.round((s.people / steps[j].people) * 1000) / 10 : null;
  }

  // Per service: searched → booked → completed.
  const searchBy = new Map(perLineSearch.map((r) => [r._id, r.people]));
  const bookBy = new Map();
  for (const r of rows) {
    const code = map.lineOf(r);
    if (!code) continue;
    if (!bookBy.has(code)) bookBy.set(code, { booked: new Set(), completed: new Set() });
    if (r.userId) { bookBy.get(code).booked.add(r.userId); if (r.statusBucket === 'completed') bookBy.get(code).completed.add(r.userId); }
  }
  const codes = new Set([...searchBy.keys(), ...bookBy.keys()]);
  const services = [...codes].map((code) => ({
    lineCode: code, label: map.label(code), searched: searchBy.get(code) || 0,
    booked: bookBy.get(code)?.booked.size || 0, completed: bookBy.get(code)?.completed.size || 0,
  })).sort((a, b) => b.searched + b.booked - (a.searched + a.booked));

  // The step that loses the most people (after the first), to fix first.
  const drops = steps.slice(1).filter((s) => s.fromPrevious != null && steps[steps.indexOf(s) - 1].people >= 10 && !steps[steps.indexOf(s) - 1].notRecorded);
  const worst = drops.sort((a, b) => a.fromPrevious - b.fromPrevious)[0];
  const findings = [];
  if (worst) {
    const before = steps[steps.indexOf(worst) - 1];
    findings.push({ tone: worst.fromPrevious < 30 ? 'bad' : 'warn', text: `Biggest drop: ${before.label.toLowerCase()} → ${worst.label.toLowerCase()}. Only ${worst.fromPrevious}% go on. Fix this step first.` });
  }
  if (visitors && booked) findings.push({ tone: 'good', text: `${Math.round((booked / visitors) * 1000) / 10}% of visitors booked this period.` });

  const result = { range: { days, from: new Date(start), to: new Date(now) }, steps, services, findings };
  cache.set(key, result);
  return result;
}

module.exports = { overview, supply, funnel, bookingsIn, totals, istDayStart, lineMapper };
