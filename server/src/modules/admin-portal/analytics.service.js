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

/** Where the job was, rounded to about 100 m: enough for a map, never a doorstep. */
function pointFor(source, doc) {
  const p = source === 'event'
    ? (doc.address?.lat != null && doc.address?.lng != null ? { lat: doc.address.lat, lng: doc.address.lng } : null)
    : KINDS[source]?.ops?.where?.(doc);
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
  return { lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 };
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
        point: pointFor(source, d),
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
  const { ServiceLine } = require('../onboarding/onboarding.model');
  const liveCodes = new Set((await ServiceLine.find({ status: 'live' }).select('code').lean()).map((l) => l.code));
  const idle = services.filter((s) => liveCodes.has(s.lineCode) && s.providers && !s.bookings);
  if (idle.length) {
    findings.push({ tone: 'warn', text: `${idle.length} live ${idle.length === 1 ? 'service has' : 'services have'} providers but no bookings: ${idle.slice(0, 3).map((s) => s.label).join(', ')}${idle.length > 3 ? '…' : ''}. Promote them or check their prices.` });
  }
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

  // Repair quotes sent to customers in the period, and what happened to them.
  const { RepairQuote } = require('../repair/models/quote.model');
  const quoteRows = await RepairQuote.aggregate([
    { $match: { createdAt: range, status: { $in: ['sent', 'approved', 'rejected', 'expired', 'clarification_requested'] } } },
    { $group: { _id: '$status', n: { $sum: 1 }, value: { $sum: { $ifNull: ['$totalPaise', 0] } } } },
  ]);
  const q = Object.fromEntries(quoteRows.map((r) => [r._id, r]));
  const decided = (q.approved?.n || 0) + (q.rejected?.n || 0) + (q.expired?.n || 0);
  const quotes = {
    sent: quoteRows.reduce((t, r) => t + r.n, 0),
    approved: q.approved?.n || 0,
    declined: q.rejected?.n || 0,
    expired: q.expired?.n || 0,
    waiting: (q.sent?.n || 0) + (q.clarification_requested?.n || 0),
    approvedPaise: q.approved?.value || 0,
    lostPaise: (q.rejected?.value || 0) + (q.expired?.value || 0),
    approvalRate: decided ? Math.round(((q.approved?.n || 0) / decided) * 1000) / 10 : null,
  };
  if (decided >= 5 && quotes.approvalRate < 60) {
    findings.push({ tone: 'warn', text: `Only ${quotes.approvalRate}% of repair quotes are approved; ₹${Math.round(quotes.lostPaise / 100).toLocaleString('en-IN')} was turned down or left to expire. Check what technicians are quoting.` });
  }

  const cancellations = await cancellationReasons(range);
  const topCustomer = cancellations.customer[0];
  if (topCustomer && cancellations.customerTotal >= 5 && topCustomer.share >= 30) {
    findings.push({ tone: 'warn', text: `Most customer cancellations say "${topCustomer.reason}" (${topCustomer.share}%).` });
  }

  const result = { range: { days, from: new Date(start), to: new Date(now) }, steps, services, quotes, cancellations, findings };
  cache.set(key, result);
  return result;
}

/**
 * Why jobs ended early in the period: who cancelled (customer, provider, ops)
 * and the customers' own reasons, plus why providers handed jobs back.
 */
async function cancellationReasons(range) {
  const { ALL } = require('../jobs/kinds');
  const who = { customer: 0, provider: 0, ops: 0 };
  const reasons = new Map();
  for (const k of ALL.filter((x) => ['repair', 'pet', 'helping'].includes(x.kind))) {
    const docs = await k.model().find({ status: 'CANCELLED', updatedAt: range })
      .select('statusHistory cancellationReason').limit(5000).lean();
    for (const d of docs) {
      const last = [...(d.statusHistory || [])].reverse().find((h) => h.status === 'CANCELLED') || {};
      const role = last.byRole || last.actorRole || '';
      const side = ['user', 'customer'].includes(role) ? 'customer' : ['worker', 'shop', 'provider'].includes(role) ? 'provider' : 'ops';
      who[side] += 1;
      if (side === 'customer') {
        const text = String(d.cancellationReason || last.reason || last.note || '').trim() || 'No reason given';
        reasons.set(text, (reasons.get(text) || 0) + 1);
      }
    }
  }
  const customerTotal = who.customer;
  const customer = [...reasons.entries()].map(([reason, n]) => ({ reason, n, share: customerTotal ? Math.round((n / customerTotal) * 100) : 0 }))
    .sort((a, b) => b.n - a.n).slice(0, 8);

  const { JobGiveBack, REASONS } = require('../jobs/give-back');
  const label = (code) => (code === 'no_show' ? 'Did not turn up' : code === 'customer_no_show' ? 'Customer not there' : REASONS.find((r) => r.code === code)?.label || code);
  const given = await JobGiveBack.aggregate([
    { $match: { createdAt: range, toShop: false } },
    { $group: { _id: '$reason', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]);
  return {
    who, customerTotal, customer,
    providerHandBacks: given.map((g) => ({ reason: label(g._id), n: g.n })),
  };
}

/** First booking ever per customer, across every kind: customerId -> timestamp. */
async function firstBookings(userIds) {
  const first = new Map();
  if (!userIds.length) return first;
  const { Types } = require('mongoose');
  const ids = userIds.map((id) => new Types.ObjectId(id));
  await Promise.all(KIND_SOURCES.map(async (source) => {
    const rows = await KINDS[source].model().aggregate([
      { $match: { userId: { $in: ids } } },
      { $group: { _id: '$userId', at: { $min: '$createdAt' } } },
    ]);
    for (const r of rows) {
      const k = String(r._id);
      const t = new Date(r.at).getTime();
      if (!first.has(k) || t < first.get(k)) first.set(k, t);
    }
  }));
  return first;
}

/**
 * Customers: do people come back, and are they happy? New against returning
 * customers per day, monthly cohorts (of those who first booked in a month,
 * the share who booked again in each month after), sign-ups who went on to
 * book, and ratings per service from the review store.
 */
async function customers({ days = 30, now = Date.now() } = {}) {
  days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const key = `customers:${days}:${Math.floor(now / CACHE_MS)}`;
  if (cache.has(key)) return cache.get(key);
  const User = require('../user/user.model');
  const Review = require('../review/review.model');
  const { maskName } = require('../review/review.service');
  const start = istDayStart(now) - (days - 1) * DAY;
  const cohortStart = new Date(new Date(now + IST).getUTCFullYear(), new Date(now + IST).getUTCMonth() - 5, 1).getTime() - IST;

  const [rows, history, signups, reviews] = await Promise.all([
    bookingsIn(start, now),
    bookingsIn(cohortStart, now),
    User.find({ createdAt: { $gte: new Date(start) } }).select('_id').lean(),
    Review.find({ createdAt: { $gte: new Date(start) }, excluded: false }).populate('userId', 'name').lean(),
  ]);
  const people = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
  const first = await firstBookings([...new Set(history.map((r) => r.userId).filter(Boolean))]);
  const isNew = (id) => (first.get(id) || 0) >= start;
  const newPeople = people.filter(isNew);

  // Per day: new and returning customers who booked.
  const daily = [];
  for (let t = start; t <= now; t += DAY) {
    const ids = [...new Set(rows.filter((r) => r.at >= t && r.at < t + DAY).map((r) => r.userId).filter(Boolean))];
    const n = ids.filter(isNew).length;
    daily.push({ date: istDate(t), customers: ids.length, newCustomers: n, returning: ids.length - n });
  }

  // Monthly cohorts by first booking, last six months.
  const monthOf = (t) => { const d = new Date(t + IST); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
  const label = (m) => new Date(Date.UTC(Math.floor(m / 12), m % 12, 1)).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  const activeMonths = new Map();
  for (const r of history) {
    if (!r.userId) continue;
    if (!activeMonths.has(r.userId)) activeMonths.set(r.userId, new Set());
    activeMonths.get(r.userId).add(monthOf(r.at));
  }
  const nowMonth = monthOf(now);
  const cohorts = [];
  for (let m = nowMonth - 5; m <= nowMonth; m += 1) {
    const members = [...first].filter(([, t]) => monthOf(t) === m).map(([id]) => id);
    const after = [];
    for (let k = 1; k <= nowMonth - m && k <= 3; k += 1) {
      const back = members.filter((id) => activeMonths.get(id)?.has(m + k)).length;
      after.push(members.length ? Math.round((back / members.length) * 100) : null);
    }
    cohorts.push({ month: label(m), customers: members.length, after });
  }

  // Ratings per service, and the latest low ones to read.
  const kindLabel = { repair: 'Repairs', pet: 'Pet care', helping: 'Helping', event: 'Event décor', order: 'Older orders' };
  const ratingsByKind = Object.entries(reviews.reduce((acc, r) => { (acc[r.kind] ||= []).push(r.rating); return acc; }, {}))
    .map(([kind, list]) => ({ key: kind, label: kindLabel[kind] || kind, average: Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10, reviews: list.length }))
    .sort((a, b) => b.reviews - a.reviews);
  const low = reviews.filter((r) => r.rating <= 2).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5)
    .map((r) => ({ id: String(r._id), rating: r.rating, text: r.comment, service: r.serviceLabel || kindLabel[r.kind], by: maskName(r.userId?.name), at: r.createdAt }));
  const avg = reviews.length ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) * 10) / 10 : null;

  const findings = [];
  // At risk: had a job done, then nothing for 30 to 120 days. Worth a nudge.
  const last = new Map();
  for (const r of history) {
    if (!r.userId) continue;
    const cur = last.get(r.userId) || { at: 0, done: 0, service: null };
    if (r.at > cur.at) { cur.at = r.at; cur.service = r.service; }
    if (r.statusBucket === 'completed') cur.done += 1;
    last.set(r.userId, cur);
  }
  const atRiskList = [...last.values()].filter((v) => v.done && now - v.at >= 30 * DAY && now - v.at <= 120 * DAY);
  const atRiskBy = [...groupBy(atRiskList, (v) => v.service)].map(([service, list]) => ({ key: service, label: service, people: list.length }))
    .sort((a, b) => b.people - a.people).slice(0, 5);
  if (atRiskList.length >= 3) findings.push({ tone: 'warn', text: `${atRiskList.length} past customers have not booked in over a month. A reminder for their last service could bring them back.` });

  const signupIds = signups.map((u) => String(u._id));
  const activated = signupIds.filter((id) => first.has(id)).length;

  if (people.length >= 5) {
    const rr = Math.round(((people.length - newPeople.length) / people.length) * 100);
    findings.push({ tone: rr >= 30 ? 'good' : 'warn', text: `${rr}% of customers this period had booked before.${rr < 30 ? ' A follow-up offer after the first job would lift it.' : ''}` });
  }
  if (signupIds.length >= 5) {
    const ar = Math.round((activated / signupIds.length) * 100);
    if (ar < 40) findings.push({ tone: 'warn', text: `Only ${ar}% of new sign-ups have booked. A first-booking offer could convert the rest.` });
  }
  if (avg != null && reviews.length >= 5) findings.push({ tone: avg >= 4.3 ? 'good' : 'warn', text: `Average rating ${avg} from ${reviews.length} reviews.` });
  if (low.length) findings.push({ tone: 'bad', text: `${low.length} low rating${low.length > 1 ? 's' : ''} (2 stars or less) to read and follow up.` });

  const result = {
    range: { days, from: new Date(start), to: new Date(now) },
    totals: {
      customers: people.length, newCustomers: newPeople.length, returning: people.length - newPeople.length,
      repeatRate: people.length ? Math.round(((people.length - newPeople.length) / people.length) * 1000) / 10 : null,
      signups: signupIds.length, activated, activationRate: signupIds.length ? Math.round((activated / signupIds.length) * 1000) / 10 : null,
      averageRating: avg, reviews: reviews.length,
    },
    daily, cohorts, ratings: ratingsByKind, lowRatings: low, atRisk: { people: atRiskList.length, byService: atRiskBy }, findings,
  };
  cache.set(key, result);
  return result;
}

/**
 * Money: what makes us money? Booked value against what we earn (commission
 * and platform fee separately), what providers earned, take rate, per service,
 * per area and by payment method. Completed jobs only: money is counted when
 * the work is done.
 */
async function money({ days = 30, now = Date.now() } = {}) {
  days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const key = `money:${days}:${Math.floor(now / CACHE_MS)}`;
  if (cache.has(key)) return cache.get(key);
  const start = istDayStart(now) - (days - 1) * DAY;
  const prevStart = start - (now - start);
  const [rows, prevRows] = await Promise.all([bookingsIn(start, now), bookingsIn(prevStart, start)]);
  const done = rows.filter((r) => r.statusBucket === 'completed');
  const prevDone = prevRows.filter((r) => r.statusBucket === 'completed');

  const sum = (list, f) => list.reduce((s, r) => s + (f(r) || 0), 0);
  const fig = (list) => {
    const gmv = sum(list, (r) => r.totalPaise);
    const commission = sum(list, (r) => r.commissionPaise);
    const fee = sum(list, (r) => r.platformFeePaise);
    return {
      gmvPaise: gmv, commissionPaise: commission, platformFeePaise: fee, takePaise: commission + fee,
      providerPaise: sum(list, (r) => r.providerEarningPaise), jobs: list.length,
      aovPaise: list.length ? Math.round(gmv / list.length) : 0,
      takeRate: gmv ? Math.round(((commission + fee) / gmv) * 1000) / 10 : null,
    };
  };
  const cur = fig(done);
  const prev = fig(prevDone);
  const delta = Object.fromEntries(['gmvPaise', 'takePaise', 'commissionPaise', 'platformFeePaise', 'aovPaise'].map((k) => [k, change(cur[k], prev[k])]));

  const daily = [];
  const shift = start - prevStart;
  for (let t = start; t <= now; t += DAY) {
    const d = fig(done.filter((r) => r.at >= t && r.at < t + DAY));
    const p = fig(prevDone.filter((r) => r.at >= t - shift && r.at < t - shift + DAY));
    daily.push({ date: istDate(t), takePaise: d.takePaise, gmvPaise: d.gmvPaise, prevTakePaise: p.takePaise });
  }
  const byService = [...groupBy(done, (r) => r.serviceKey)].map(([k, list]) => ({ key: k, label: list[0].service, ...fig(list) }))
    .sort((a, b) => b.takePaise - a.takePaise);
  const byArea = [...groupBy(done, (r) => r.area)].map(([area, list]) => ({ key: area, label: area, ...fig(list) }))
    .sort((a, b) => b.takePaise - a.takePaise).slice(0, 8);
  const byMethod = [...groupBy(done, (r) => (r.paymentMethod === 'online' || r.source === 'event' ? 'online' : r.paymentMethod ? 'cash' : 'unknown'))]
    .map(([method, list]) => ({ key: method, label: method === 'online' ? 'Paid online' : method === 'cash' ? 'Cash' : 'Not recorded', ...fig(list) }));

  const findings = [];
  const d = delta.takePaise;
  if (cur.takePaise && d != null && Math.abs(d) >= 10) findings.push({ tone: d > 0 ? 'good' : 'bad', text: `We earned ${d > 0 ? `${d}% more` : `${Math.abs(d)}% less`} than the previous period.` });
  const top = byService[0];
  if (top && cur.takePaise) findings.push({ tone: 'good', text: `${top.label} brings ${Math.round((top.takePaise / cur.takePaise) * 100)}% of what we earn.` });
  const lowTake = byService.filter((s) => s.jobs >= 5 && s.takeRate != null && s.takeRate < 8)[0];
  if (lowTake) findings.push({ tone: 'warn', text: `${lowTake.label} keeps only ${lowTake.takeRate}% of its value. Review its fee and commission in Economics.` });
  const cash = byMethod.find((m) => m.key === 'cash');
  if (cash && cur.jobs >= 5 && cash.jobs / cur.jobs > 0.7) findings.push({ tone: 'warn', text: `${Math.round((cash.jobs / cur.jobs) * 100)}% of jobs are paid in cash. Commission on those is collected from providers later.` });

  const result = { range: { days, from: new Date(start), to: new Date(now) }, current: cur, previous: prev, delta, daily, byService, byArea, byMethod, findings };
  cache.set(key, result);
  return result;
}

/**
 * Map: where the business happens. Cells of about 1 km with bookings,
 * completed jobs, cancellations, what we earned, searches and the searches we
 * could not serve; provider coverage (shop service areas, online workers);
 * when bookings come in (day of week × hour, India time); and areas ranked,
 * with the gap between demand and providers as the place to expand.
 */
async function geo({ days = 30, service = null, now = Date.now() } = {}) {
  days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  service = service && /^[a-z0-9_]{2,40}$/.test(service) ? service : null;
  const key = `geo:${days}:${service || 'all'}:${Math.floor(now / CACHE_MS)}`;
  if (cache.has(key)) return cache.get(key);
  const { SearchEvent } = require('../telemetry/telemetry.model');
  const { ProviderServiceArea } = require('../repair/models/config.model');
  const Worker = require('../worker/worker.model');
  const start = istDayStart(now) - (days - 1) * DAY;

  const [allRows, searches, areas, workers, map] = await Promise.all([
    bookingsIn(start, now),
    SearchEvent.find({ createdAt: { $gte: new Date(start) }, lat: { $ne: null }, lng: { $ne: null }, category: service || { $ne: 'all_services' } })
      .select('lat lng result city userId sessionId').lean(),
    ProviderServiceArea.find({ isActive: true, center: { $ne: null } }).select('center radiusKm shopId workerId').lean(),
    Worker.find({ isOnline: true, 'currentLocation.coordinates.0': { $exists: true } }).select('currentLocation').lean(),
    lineMapper(),
  ]);
  // One service at a time, or all of them; the filter list is every service with bookings.
  const rows = service ? allRows.filter((r) => map.lineOf(r) === service) : allRows;
  const serviceList = [...new Set(allRows.map((r) => map.lineOf(r)).filter(Boolean))].map((code) => ({ code, label: map.label(code) }));

  // ~1 km cells.
  const cellOf = (lat, lng) => `${(Math.round(lat * 100) / 100).toFixed(2)},${(Math.round(lng * 100) / 100).toFixed(2)}`;
  const cells = new Map();
  const cell = (lat, lng) => {
    const k = cellOf(lat, lng);
    if (!cells.has(k)) {
      const [a, b] = k.split(',').map(Number);
      cells.set(k, { lat: a, lng: b, bookings: 0, completed: 0, cancelled: 0, takePaise: 0, searches: 0, unserved: 0, area: null });
    }
    return cells.get(k);
  };
  for (const r of rows) {
    if (!r.point) continue;
    const c = cell(r.point.lat, r.point.lng);
    c.bookings += 1;
    if (r.statusBucket === 'completed') { c.completed += 1; c.takePaise += r.take; }
    if (r.statusBucket === 'cancelled') c.cancelled += 1;
    if (r.area && !c.area) c.area = r.area;
  }
  const seen = new Set();
  for (const s of searches) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const who = String(s.userId || s.sessionId || s._id);
    const k = `${who}|${cellOf(s.lat, s.lng)}|${s.result}`;
    if (seen.has(k)) continue; // one person in one place counts once
    seen.add(k);
    const c = cell(s.lat, s.lng);
    c.searches += 1;
    if (s.result === 'no_service') c.unserved += 1;
    if (s.city && !c.area) c.area = s.city;
  }

  const providers = [
    ...areas.map((a) => ({ kind: a.shopId ? 'shop' : 'worker', lat: a.center.coordinates[1], lng: a.center.coordinates[0], radiusKm: a.radiusKm || 5, live: false })),
    ...workers.map((w) => ({ kind: 'worker', lat: Math.round(w.currentLocation.coordinates[1] * 1000) / 1000, lng: Math.round(w.currentLocation.coordinates[0] * 1000) / 1000, radiusKm: 0, live: true })),
  ].filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  // When: day of week × hour, India time.
  const when = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of rows) {
    const d = new Date(r.at + IST);
    when[d.getUTCDay()][d.getUTCHours()] += 1;
  }

  // Areas ranked; the expansion gap is demand with no provider covering it.
  const covered = (c) => providers.some((p) => {
    const km = Math.hypot((p.lat - c.lat) * 111, (p.lng - c.lng) * 111 * Math.cos((c.lat * Math.PI) / 180));
    return km <= Math.max(p.radiusKm, 3);
  });
  const byArea = new Map();
  for (const c of cells.values()) {
    const name = c.area || `${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}`;
    if (!byArea.has(name)) byArea.set(name, { area: name, lat: c.lat, lng: c.lng, bookings: 0, completed: 0, cancelled: 0, takePaise: 0, searches: 0, unserved: 0, uncovered: 0 });
    const a = byArea.get(name);
    for (const f of ['bookings', 'completed', 'cancelled', 'takePaise', 'searches', 'unserved']) a[f] += c[f];
    if (!covered(c)) a.uncovered += c.searches + c.bookings;
  }
  const areasRanked = [...byArea.values()].sort((x, y) => (y.bookings + y.searches) - (x.bookings + x.searches)).slice(0, 12);
  const expand = [...byArea.values()].filter((a) => a.unserved + a.uncovered > 0).sort((x, y) => (y.unserved + y.uncovered) - (x.unserved + x.uncovered)).slice(0, 5);

  const findings = [];
  if (expand[0]) {
    const n = expand[0].unserved + expand[0].uncovered;
    findings.push({ tone: 'bad', text: `${expand[0].area}: ${n} ${n === 1 ? 'search or booking' : 'searches and bookings'} with no provider nearby. The first place to recruit.` });
  }
  const hot = areasRanked.filter((a) => a.bookings >= 5 && a.cancelled / a.bookings >= 0.3)[0];
  if (hot) findings.push({ tone: 'warn', text: `${hot.area}: ${Math.round((hot.cancelled / hot.bookings) * 100)}% of bookings cancelled. Check provider reach there.` });
  let peak = { n: 0 };
  when.forEach((hours, dow) => hours.forEach((n, h) => { if (n > peak.n) peak = { n, dow, h }; }));
  if (peak.n >= 3) {
    const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][peak.dow];
    findings.push({ tone: 'good', text: `Busiest time: ${day} around ${peak.h % 12 || 12} ${peak.h < 12 ? 'am' : 'pm'}. Keep the most providers online then.` });
  }

  const result = {
    range: { days, from: new Date(start), to: new Date(now) },
    cells: [...cells.values()],
    providers,
    when,
    areas: areasRanked,
    expand,
    totals: {
      cells: cells.size, bookings: rows.length, mapped: rows.filter((r) => r.point).length,
      searches: [...cells.values()].reduce((s, c) => s + c.searches, 0), providers: providers.length, online: workers.length,
    },
    services: serviceList,
    findings,
  };
  cache.set(key, result);
  return result;
}

/**
 * Right now: people on the app this minute, people in a booking flow, live
 * jobs and providers online. Not cached; it is cheap and should feel live.
 */
async function live() {
  const { VisitorSession } = require('../telemetry/telemetry.model');
  const { activeNowCount } = require('../telemetry/telemetry.controller');
  const Worker = require('../worker/worker.model');
  const ops = require('../jobs/ops.service');
  const twoMin = new Date(Date.now() - 2 * 60_000);
  const [onApp, inBooking, jobs, workersOnline] = await Promise.all([
    activeNowCount(),
    VisitorSession.countDocuments({ lastSeen: { $gte: twoMin }, userType: { $in: ['guest', 'user'] }, currentPath: { $regex: '^/(repair|pet/book/|helping/(shopping|returns)|events/book/)' } }),
    ops.liveJobs(),
    Worker.countDocuments({ isOnline: true }),
  ]);
  return {
    onApp, inBooking, workersOnline,
    jobsLive: jobs.length,
    waitingForProvider: jobs.filter((j) => j.waiting && !j.hasProvider).length,
    stuck: jobs.filter((j) => j.stuck).length,
    at: new Date(),
  };
}

module.exports = { overview, supply, funnel, customers, money, geo, live, bookingsIn, totals, istDayStart, lineMapper };
