const Order = require('../../order/order.model');
const Worker = require('../../worker/worker.model');
const EventBooking = require('../../events/event-booking.model');
const { VisitorSession, SearchEvent } = require('../../telemetry/telemetry.model');
const { activeNowCount } = require('../../telemetry/telemetry.controller');
const cachedAnalytics = require('../lib/cached-analytics');
const { redis } = require('../../../config/redis');
const { getZoneLabel } = require('../../worker/maps.service');
const logger = require('../../../utils/logger');

/* IST calendar boundaries */
// Moved to utils/ist so the shop's opening hours and this dashboard cannot
// disagree about when "today" started.
const { istDayStart, istWeekStart, istMonthStart } = require('../../../utils/ist');

const ACTIVE_STATUSES = ['searching', 'assigned', 'on_the_way', 'arrived', 'in_progress'];

/* normalise a numeric array to 0..1 by its max (avoids div-by-zero) */
function norm(vals) {
  const max = Math.max(1, ...vals);
  return (v) => v / max;
}

/*
 * 1. LIVE TRAFFIC
 * */
async function liveTraffic(req, res, next) {
  try {
    const activeNow = await activeNowCount();          // cheap Redis read — always fresh
    const heavy = await cachedAnalytics('intel:live-traffic', 10, async () => {
      const [today, week, month, liveRows, devices, browsers, oses, referrers, cities] = await Promise.all([
        VisitorSession.countDocuments({ firstSeen: { $gte: istDayStart() } }),
        VisitorSession.countDocuments({ firstSeen: { $gte: istWeekStart() } }),
        VisitorSession.countDocuments({ firstSeen: { $gte: istMonthStart() } }),
        // Live table: sessions seen in the last 5 min
        VisitorSession.find({ lastSeen: { $gte: new Date(Date.now() - 5 * 60000) } })
          .sort({ lastSeen: -1 }).limit(100)
          .select('sessionId userType device browser os referrer currentPath pageEnteredAt city district state lastSeen pageCount')
          .lean(),
        VisitorSession.aggregate([{ $match: { lastSeen: { $gte: new Date(Date.now() - 30 * 60000) } } }, { $group: { _id: '$device', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
        VisitorSession.aggregate([{ $match: { firstSeen: { $gte: istDayStart() } } }, { $group: { _id: '$browser', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 6 }]),
        VisitorSession.aggregate([{ $match: { firstSeen: { $gte: istDayStart() } } }, { $group: { _id: '$os', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 6 }]),
        VisitorSession.aggregate([{ $match: { firstSeen: { $gte: istDayStart() } } }, { $group: { _id: '$referrer', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
        VisitorSession.aggregate([{ $match: { firstSeen: { $gte: istDayStart() }, city: { $ne: null } } }, { $group: { _id: '$city', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]),
      ]);
      return {
        today, week, month,
        live: liveRows.map((r) => ({
          sessionId: String(r.sessionId).slice(-6),
          userType: r.userType,
          device: r.device, browser: r.browser, os: r.os,
          referrer: r.referrer,
          path: r.currentPath,
          dwellSec: Math.max(0, Math.round((Date.now() - new Date(r.pageEnteredAt).getTime()) / 1000)),
          city: r.city, district: r.district, state: r.state,
          pageCount: r.pageCount,
          lastSeen: r.lastSeen,
        })),
        breakdown: {
          device:   devices.map((d) => ({ label: d._id || 'unknown', n: d.n })),
          browser:  browsers.map((d) => ({ label: d._id || 'unknown', n: d.n })),
          os:       oses.map((d) => ({ label: d._id || 'unknown', n: d.n })),
          referrer: referrers.map((d) => ({ label: d._id || 'direct', n: d.n })),
          city:     cities.map((d) => ({ label: d._id, n: d.n })),
        },
      };
    });
    res.json({ activeNow, ...heavy, at: Date.now() });
  } catch (err) { next(err); }
}

/* Visitor locations history — "where visitors come from" */
async function visitorLocations(req, res, next) {
  try {
    const days = Math.min(Number(req.query.days) || 30, 180);
    const data = await cachedAnalytics(`intel:visitor-locations:${days}`, 60, async () => {
      const since = new Date(Date.now() - days * 86_400_000);
      const rows = await VisitorSession.aggregate([
        { $match: { firstSeen: { $gte: since } } },
        { $group: {
          _id: { city: '$city', state: '$state' },
          visitors: { $sum: 1 },
          mobile:   { $sum: { $cond: [{ $eq: ['$device', 'mobile'] }, 1, 0] } },
          pages:    { $sum: '$pageCount' },
          lastSeen: { $max: '$lastSeen' },
        } },
        { $sort: { visitors: -1 } },
        { $limit: 100 },
      ]);
      const total = rows.reduce((s, r) => s + r.visitors, 0);
      const located = rows.filter((r) => r._id.city || r._id.state).reduce((s, r) => s + r.visitors, 0);
      return {
        windowDays: days,
        total,
        located,
        unknown: total - located,
        locations: rows.map((r) => ({
          city: r._id.city,
          state: r._id.state,
          visitors: r.visitors,
          pages: r.pages,
          mobilePct: r.visitors ? Math.round((r.mobile / r.visitors) * 100) : 0,
          sharePct: total ? Math.round((r.visitors / total) * 100) : 0,
          lastSeen: r.lastSeen,
        })),
      };
    });
    res.json(data);
  } catch (err) { next(err); }
}

/*
 * 2. DEMAND INTELLIGENCE
 * */
async function demandIntel(req, res, next) {
  try {
    const days = Math.min(Number(req.query.days) || 30, 180);
    const data = await cachedAnalytics(`intel:demand:${days}`, 60, async () => {
      const since = new Date(Date.now() - days * 86_400_000);
      const mid = new Date(Date.now() - (days / 2) * 86_400_000);

      const [byCategory, recentHalf, priorHalf, byCity, splitTotals] = await Promise.all([
        SearchEvent.aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $group: { _id: '$category', searches: { $sum: 1 },
            noService: { $sum: { $cond: [{ $eq: ['$result', 'no_service'] }, 1, 0] } } } },
          { $sort: { searches: -1 } }, { $limit: 25 },
        ]),
        SearchEvent.aggregate([{ $match: { createdAt: { $gte: mid } } }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
        SearchEvent.aggregate([{ $match: { createdAt: { $gte: since, $lt: mid } } }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
        SearchEvent.aggregate([
          { $match: { createdAt: { $gte: since }, city: { $ne: null } } },
          { $group: { _id: '$city', searches: { $sum: 1 },
            noService: { $sum: { $cond: [{ $eq: ['$result', 'no_service'] }, 1, 0] } } } },
          { $sort: { searches: -1 } }, { $limit: 15 },
        ]),
        SearchEvent.aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $group: { _id: '$result', n: { $sum: 1 } } },
        ]),
      ]);

      const recentMap = Object.fromEntries(recentHalf.map((r) => [r._id, r.n]));
      const priorMap = Object.fromEntries(priorHalf.map((r) => [r._id, r.n]));
      const trending = Object.keys(recentMap)
        .map((cat) => {
          const recent = recentMap[cat] || 0;
          const prior = priorMap[cat] || 0;
          const growthPct = prior === 0 ? (recent > 0 ? 100 : 0) : Math.round(((recent - prior) / prior) * 100);
          return { category: cat, recent, prior, growthPct };
        })
        .filter((t) => t.recent >= 3)
        .sort((a, b) => b.growthPct - a.growthPct)
        .slice(0, 12);

      const splitMap = Object.fromEntries(splitTotals.map((r) => [r._id, r.n]));
      return {
        windowDays: days,
        mostSearched: byCategory.map((c) => ({
          category: c._id, searches: c.searches, noService: c.noService,
          fulfilmentPct: c.searches > 0 ? Math.round(((c.searches - c.noService) / c.searches) * 100) : 0,
        })),
        trending,
        byCity: byCity.map((c) => ({ city: c._id, searches: c.searches, noService: c.noService })),
        split: { served: splitMap.served || 0, noService: splitMap.no_service || 0 },
      };
    });
    res.json(data);
  } catch (err) { next(err); }
}

/* avg completed fare per service + global, used for lost-revenue math */
async function fareMaps(since) {
  const rows = await Order.aggregate([
    { $match: { status: 'completed', completedAt: { $gte: since } } },
    { $group: { _id: '$service', avgFare: { $avg: '$pricing.total' }, n: { $sum: 1 } } },
  ]);
  const byCat = Object.fromEntries(rows.map((r) => [r._id, Math.round(r.avgFare || 0)]));
  const global = rows.length
    ? Math.round(rows.reduce((s, r) => s + (r.avgFare || 0) * r.n, 0) / Math.max(1, rows.reduce((s, r) => s + r.n, 0)))
    : 300; // sensible default avg ticket if no completed orders yet
  return { byCat, global };
}

/*
 * 3. UNMET DEMAND  (No Service Available)
 * */
async function unmetDemand(req, res, next) {
  try {
    const days = Math.min(Number(req.query.days) || 30, 180);
    const data = await cachedAnalytics(`intel:unmet:${days}`, 60, async () => {
      const since = new Date(Date.now() - days * 86_400_000);
      const [byArea, byCategory, byBucket, totalUnmet, fares] = await Promise.all([
        SearchEvent.aggregate([
          { $match: { result: 'no_service', createdAt: { $gte: since }, city: { $ne: null } } },
          { $group: { _id: { city: '$city', state: '$state' }, requests: { $sum: 1 },
            categories: { $addToSet: '$category' },
            lat: { $avg: '$lat' }, lng: { $avg: '$lng' } } },
          { $sort: { requests: -1 } }, { $limit: 25 },
        ]),
        SearchEvent.aggregate([
          { $match: { result: 'no_service', createdAt: { $gte: since } } },
          { $group: { _id: '$category', requests: { $sum: 1 } } },
          { $sort: { requests: -1 } }, { $limit: 20 },
        ]),
        // Map points for the heat layer
        SearchEvent.aggregate([
          { $match: { result: 'no_service', createdAt: { $gte: since }, lat: { $ne: null } } },
          { $group: { _id: '$bucket', requests: { $sum: 1 }, lat: { $first: '$lat' }, lng: { $first: '$lng' } } },
          { $sort: { requests: -1 } }, { $limit: 300 },
        ]),
        SearchEvent.countDocuments({ result: 'no_service', createdAt: { $gte: since } }),
        fareMaps(since),
      ]);

      // Potential revenue lost = Σ per-category(unmet × avgFare(category))
      const revenueLostByCat = byCategory.map((c) => {
        const fare = fares.byCat[c._id] || fares.global;
        return { category: c._id, requests: c.requests, lostRevenue: c.requests * fare };
      });
      const potentialRevenueLost = revenueLostByCat.reduce((s, c) => s + c.lostRevenue, 0);

      return {
        windowDays: days,
        lostBookings: totalUnmet,
        potentialRevenueLost,
        topAreas: byArea.map((a) => {
          const fare = fares.global;
          return {
            city: a._id.city, state: a._id.state,
            requests: a.requests,
            categories: a.categories.filter(Boolean).slice(0, 6),
            lat: a.lat, lng: a.lng,
            estLostRevenue: a.requests * fare,
          };
        }),
        topCategories: revenueLostByCat,
        mapPoints: byBucket.map((b) => ({ lat: b.lat, lng: b.lng, requests: b.requests })),
      };
    });
    res.json(data);
  } catch (err) { next(err); }
}

/*
 * 4. CITY EXPANSION ENGINE  (composite score)
 * */
async function computeExpansion(days) {
  const since = new Date(Date.now() - days * 86_400_000);
  const mid = new Date(Date.now() - (days / 2) * 86_400_000);

  const [cityAgg, recentHalf, fares] = await Promise.all([
    SearchEvent.aggregate([
      { $match: { createdAt: { $gte: since }, city: { $ne: null } } },
      { $group: {
        _id: { city: '$city', state: '$state' },
        searches: { $sum: 1 },
        noService: { $sum: { $cond: [{ $eq: ['$result', 'no_service'] }, 1, 0] } },
        categories: { $addToSet: '$category' },
        lat: { $avg: '$lat' }, lng: { $avg: '$lng' },
      } },
      { $sort: { searches: -1 } }, { $limit: 20 },
    ]),
    SearchEvent.aggregate([
      { $match: { createdAt: { $gte: mid }, city: { $ne: null } } },
      { $group: { _id: '$city', n: { $sum: 1 } } },
    ]),
    fareMaps(since),
  ]);

  const recentMap = Object.fromEntries(recentHalf.map((r) => [r._id, r.n]));

  // Worker availability per city centroid (approved workers within 15km)
  const withSupply = await Promise.all(cityAgg.map(async (c) => {
    let approvedWorkers = 0;
    let onlineWorkers = 0;
    if (typeof c.lat === 'number' && typeof c.lng === 'number') {
      try {
        // $geoWithin/$centerSphere (NOT $near) — countDocuments runs as an aggregation
        // and forbids geo-sort operators. 15 km ÷ 6378.1 = radius in radians.
        approvedWorkers = await Worker.countDocuments({
          currentLocation: { $geoWithin: { $centerSphere: [[c.lng, c.lat], 15 / 6378.1] } },
          'kyc.status': 'approved', isBlocked: false,
        });
      } catch (_) { /* geo index missing — leave 0 */ }
      try {
        const r = await redis.geosearch('workers:online', 'FROMLONLAT', c.lng, c.lat, 'BYRADIUS', 15, 'km', 'COUNT', 100).catch(() => []);
        onlineWorkers = Array.isArray(r) ? r.length : 0;
      } catch (_) { /* ignore */ }
    }
    return { ...c, approvedWorkers, onlineWorkers };
  }));

  // Normalisers across the candidate set
  const demandN  = norm(withSupply.map((c) => c.searches));
  const unmetN   = norm(withSupply.map((c) => c.noService));
  const revN     = norm(withSupply.map((c) => c.noService * (fares.global)));
  const growthRaw = withSupply.map((c) => {
    const recent = recentMap[c._id.city] || 0;
    const prior = Math.max(0, c.searches - recent);
    return prior === 0 ? (recent > 0 ? 1 : 0) : (recent - prior) / prior;
  });
  const growthN = norm(growthRaw.map((g) => Math.max(0, g)));

  const ranked = withSupply.map((c, i) => {
    const demandScore  = demandN(c.searches);                       // 0..1
    const unmetScore   = unmetN(c.noService);
    const revenueScore = revN(c.noService * fares.global);
    const growthScore  = growthN(Math.max(0, growthRaw[i]));
    // Supply GAP: fewer approved workers vs a 5-worker target = bigger opportunity
    const supplyGap    = Math.max(0, 1 - c.approvedWorkers / 5);
    const score = Math.round(100 * (
      0.30 * demandScore +
      0.25 * unmetScore +
      0.20 * revenueScore +
      0.15 * growthScore +
      0.10 * supplyGap
    ));
    const topCategory = c.categories.filter(Boolean)[0] || null;
    const rec = c.approvedWorkers < 5
      ? `High demand, only ${c.approvedWorkers} approved worker(s). Onboard workers${topCategory ? ` for ${topCategory}` : ''} and launch.`
      : c.onlineWorkers < 2
        ? 'Workers approved but few online — run a soft launch / activation push.'
        : 'Operational supply present — scale marketing to capture demand.';
    return {
      city: c._id.city, state: c._id.state,
      score,
      demand: c.searches, unmetRequests: c.noService,
      categories: c.categories.filter(Boolean).slice(0, 6),
      approvedWorkers: c.approvedWorkers, onlineWorkers: c.onlineWorkers,
      estMonthlyRevenue: Math.round((c.searches) * fares.global * (30 / days)),
      lat: c.lat, lng: c.lng,
      recommendation: rec,
      breakdown: {
        demand: Math.round(demandScore * 100),
        unmet: Math.round(unmetScore * 100),
        revenue: Math.round(revenueScore * 100),
        growth: Math.round(growthScore * 100),
        supplyGap: Math.round(supplyGap * 100),
      },
    };
  }).sort((a, b) => b.score - a.score);

  return { windowDays: days, cities: ranked };
}

async function expansionEngine(req, res, next) {
  try {
    const days = Math.min(Number(req.query.days) || 30, 180);
    const data = await cachedAnalytics(`intel:expansion:${days}`, 120, () => computeExpansion(days));
    res.json(data);
  } catch (err) { next(err); }
}

/*
 * 5. CEO PULSE  (single-screen leadership view)
 * */
async function ceoPulse(req, res, next) {
  try {
    const activeNow = await activeNowCount();
    const data = await cachedAnalytics('intel:ceo', 20, async () => {
      const todayStart = istDayStart();
      const yest = new Date(todayStart.getTime() - 86_400_000);
      const since30 = new Date(Date.now() - 30 * 86_400_000);

      const [liveOrders, onlineWorkers, revToday, revYest, ordersToday,
             orderCats, orderBuckets, searchCats, searchCities, unmetToday, expansion] = await Promise.all([
        Order.countDocuments({ status: { $in: ACTIVE_STATUSES } }),
        (async () => { try { return await redis.zcard('workers:online'); } catch { return 0; } })(),
        Order.aggregate([{ $match: { status: 'completed', completedAt: { $gte: todayStart } } }, { $group: { _id: null, rev: { $sum: '$pricing.total' } } }]),
        Order.aggregate([{ $match: { status: 'completed', completedAt: { $gte: yest, $lt: todayStart } } }, { $group: { _id: null, rev: { $sum: '$pricing.total' } } }]),
        Order.countDocuments({ createdAt: { $gte: todayStart } }),
        // Realized demand from actual orders (always present) — not just new search telemetry
        Order.aggregate([{ $match: { createdAt: { $gte: since30 } } }, { $group: { _id: '$service', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
        // Demand buckets (rounded coords) → reverse-geocoded to city below
        Order.aggregate([
          { $match: { createdAt: { $gte: since30 }, 'pickupLocation.coordinates.0': { $exists: true } } },
          { $project: {
            lat: { $round: [{ $arrayElemAt: ['$pickupLocation.coordinates', 1] }, 2] },
            lng: { $round: [{ $arrayElemAt: ['$pickupLocation.coordinates', 0] }, 2] },
          } },
          { $group: { _id: { lat: '$lat', lng: '$lng' }, n: { $sum: 1 } } },
          { $sort: { n: -1 } }, { $limit: 12 },
        ]),
        // Pre-booking search intent (telemetry) — merged on top of realized demand
        SearchEvent.aggregate([{ $match: { createdAt: { $gte: since30 } } }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
        SearchEvent.aggregate([{ $match: { createdAt: { $gte: since30 }, city: { $ne: null } } }, { $group: { _id: '$city', n: { $sum: 1 } } }]),
        SearchEvent.countDocuments({ result: 'no_service', createdAt: { $gte: todayStart } }),
        computeExpansion(30),
      ]);

      const rToday = revToday[0]?.rev || 0;
      const rYest = revYest[0]?.rev || 0;
      const revGrowthPct = rYest === 0 ? (rToday > 0 ? 100 : 0) : Math.round(((rToday - rYest) / rYest) * 100);

      // Merge realized demand (orders) + search intent (telemetry) for categories
      const catMap = {};
      for (const c of orderCats)  catMap[c._id] = (catMap[c._id] || 0) + c.n;
      for (const c of searchCats) catMap[c._id] = (catMap[c._id] || 0) + c.n;
      const topCategories = Object.entries(catMap)
        .filter(([k]) => k && k !== 'null')
        .map(([category, searches]) => ({ category, searches }))
        .sort((a, b) => b.searches - a.searches).slice(0, 5);

      // City names from order demand buckets (reverse-geocoded, cached) + search cities
      const labelled = await Promise.all(orderBuckets.map(async (b) => ({
        city: await getZoneLabel(b._id.lat, b._id.lng), n: b.n,
      })));
      const cityMap = {};
      for (const r of labelled)    if (r.city) cityMap[r.city] = (cityMap[r.city] || 0) + r.n;
      for (const c of searchCities) if (c._id)  cityMap[c._id]  = (cityMap[c._id] || 0) + c.n;
      const topCities = Object.entries(cityMap)
        .map(([city, searches]) => ({ city, searches }))
        .sort((a, b) => b.searches - a.searches).slice(0, 5);

      return {
        revenueToday: Math.round(rToday),
        revenueGrowthPct: revGrowthPct,
        ordersToday,
        liveOrders,
        onlineWorkers,
        unmetToday,
        topCategories,
        topCities,
        expansionTop: expansion.cities.slice(0, 5),
        lostOpportunities: { unmetToday },
      };
    });
    res.json({ liveUsers: activeNow, ...data, at: Date.now() });
  } catch (err) { next(err); }
}

/* Reverse-geocode top order buckets → city counts (shared by report) */
async function topCitiesFromOrders(since, limit = 5) {
  const buckets = await Order.aggregate([
    { $match: { createdAt: { $gte: since }, 'pickupLocation.coordinates.0': { $exists: true } } },
    { $project: {
      lat: { $round: [{ $arrayElemAt: ['$pickupLocation.coordinates', 1] }, 2] },
      lng: { $round: [{ $arrayElemAt: ['$pickupLocation.coordinates', 0] }, 2] },
      revenue: { $cond: [{ $eq: ['$status', 'completed'] }, '$pricing.total', 0] },
    } },
    { $group: { _id: { lat: '$lat', lng: '$lng' }, orders: { $sum: 1 }, revenue: { $sum: '$revenue' } } },
    { $sort: { orders: -1 } }, { $limit: 12 },
  ]);
  const labelled = await Promise.all(buckets.map(async (b) => ({
    city: await getZoneLabel(b._id.lat, b._id.lng), orders: b.orders, revenue: Math.round(b.revenue || 0),
  })));
  const map = {};
  for (const r of labelled) {
    if (!r.city) continue;
    map[r.city] = map[r.city] || { city: r.city, orders: 0, revenue: 0 };
    map[r.city].orders += r.orders; map[r.city].revenue += r.revenue;
  }
  return Object.values(map).sort((a, b) => b.orders - a.orders).slice(0, limit);
}

/*
 * 6. CONVERSION FUNNEL  (visitor → search → booking → assigned → completed)
 * */
async function funnel(req, res, next) {
  try {
    const days = Math.min(Number(req.query.days) || 30, 180);
    const data = await cachedAnalytics(`intel:funnel:${days}`, 60, async () => {
      const since = new Date(Date.now() - days * 86_400_000);
      const ASSIGNED_PLUS = ['assigned', 'on_the_way', 'arrived', 'in_progress', 'completed'];

      const [visitors, searchSessions, booked, assigned, completed] = await Promise.all([
        VisitorSession.countDocuments({ firstSeen: { $gte: since } }),
        SearchEvent.distinct('sessionId', { createdAt: { $gte: since }, sessionId: { $ne: null } }).then((a) => a.length),
        Order.countDocuments({ createdAt: { $gte: since } }),
        Order.countDocuments({ createdAt: { $gte: since }, $or: [{ workerId: { $ne: null } }, { status: { $in: ASSIGNED_PLUS } }] }),
        Order.countDocuments({ createdAt: { $gte: since }, status: 'completed' }),
      ]);

      const raw = [
        { key: 'visitors',  label: 'Visitors',        count: visitors },
        { key: 'search',    label: 'Searched',        count: searchSessions },
        { key: 'booked',    label: 'Booked',          count: booked },
        { key: 'assigned',  label: 'Worker assigned', count: assigned },
        { key: 'completed', label: 'Completed',       count: completed },
      ];
      const top = Math.max(1, raw[0].count);
      const stages = raw.map((s, i) => {
        const prev = i === 0 ? null : raw[i - 1].count;
        return {
          ...s,
          pctOfTop: Math.round((s.count / top) * 100),
          dropPct: prev == null ? 0 : (prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : 0),
          convFromPrev: prev == null ? 100 : (prev > 0 ? Math.round((s.count / prev) * 100) : 0),
        };
      });
      return {
        windowDays: days,
        stages,
        overallConvPct: visitors > 0 ? Math.round((completed / visitors) * 1000) / 10 : 0,
        bookingCompletionPct: booked > 0 ? Math.round((completed / booked) * 100) : 0,
        biggestDrop: stages.slice(1).reduce((m, s) => (s.dropPct > (m?.dropPct ?? -1) ? s : m), null),
      };
    });
    res.json(data);
  } catch (err) { next(err); }
}

/*
 * 10. DAILY / WEEKLY BUSINESS REPORT
 * */
async function report(req, res, next) {
  try {
    const period = req.query.period === 'weekly' ? 'weekly' : 'daily';
    const since = period === 'weekly' ? new Date(Date.now() - 7 * 86_400_000) : istDayStart();
    const prevSince = period === 'weekly' ? new Date(Date.now() - 14 * 86_400_000) : new Date(istDayStart().getTime() - 86_400_000);
    const prevTill = since;

    const data = await cachedAnalytics(`intel:report:${period}`, 120, async () => {
      const [visitors, bookings, completed, revAgg, prevRevAgg, topCats, unmetAreas, topWorkersRaw, topCities] = await Promise.all([
        VisitorSession.countDocuments({ firstSeen: { $gte: since } }),
        Order.countDocuments({ createdAt: { $gte: since } }),
        Order.countDocuments({ createdAt: { $gte: since }, status: 'completed' }),
        Order.aggregate([{ $match: { status: 'completed', completedAt: { $gte: since } } }, { $group: { _id: null, rev: { $sum: '$pricing.total' } } }]),
        Order.aggregate([{ $match: { status: 'completed', completedAt: { $gte: prevSince, $lt: prevTill } } }, { $group: { _id: null, rev: { $sum: '$pricing.total' } } }]),
        Order.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$service', orders: { $sum: 1 } } }, { $sort: { orders: -1 } }, { $limit: 8 }]),
        SearchEvent.aggregate([
          { $match: { result: 'no_service', createdAt: { $gte: since }, city: { $ne: null } } },
          { $group: { _id: { city: '$city', state: '$state' }, requests: { $sum: 1 } } },
          { $sort: { requests: -1 } }, { $limit: 8 },
        ]),
        Order.aggregate([
          { $match: { status: 'completed', completedAt: { $gte: since }, workerId: { $ne: null } } },
          { $group: { _id: '$workerId', jobs: { $sum: 1 }, earnedPaise: { $sum: { $ifNull: ['$earnings.workerPaise', 0] } } } },
          { $sort: { jobs: -1 } }, { $limit: 5 },
          { $lookup: { from: 'workers', localField: '_id', foreignField: '_id', as: 'w' } },
          { $unwind: { path: '$w', preserveNullAndEmptyArrays: true } },
          { $project: { name: '$w.name', phone: '$w.phone', rating: '$w.rating', jobs: 1, earnedRupees: { $round: [{ $divide: ['$earnedPaise', 100] }, 0] } } },
        ]),
        topCitiesFromOrders(since, 6),
      ]);

      const revenue = Math.round(revAgg[0]?.rev || 0);
      const prevRevenue = Math.round(prevRevAgg[0]?.rev || 0);
      const growthPct = prevRevenue === 0 ? (revenue > 0 ? 100 : 0) : Math.round(((revenue - prevRevenue) / prevRevenue) * 100);

      return {
        period,
        generatedAt: new Date(),
        windowLabel: period === 'weekly' ? 'Last 7 days' : 'Today',
        visitors,
        bookings,
        completed,
        revenue,
        revenueGrowthPct: growthPct,
        completionRatePct: bookings > 0 ? Math.round((completed / bookings) * 100) : 0,
        topCategories: topCats.map((c) => ({ category: c._id, orders: c.orders })),
        topCities,
        noServiceAreas: unmetAreas.map((a) => ({ city: a._id.city, state: a._id.state, requests: a.requests })),
        topWorkers: topWorkersRaw.map((w) => ({ name: w.name || 'Worker', phone: w.phone, rating: w.rating, jobs: w.jobs, earnedRupees: w.earnedRupees })),
      };
    });
    res.json(data);
  } catch (err) { next(err); }
}

/*
 * 8. PARTNER ANALYTICS  (event partners ranked by performance)
 * */
async function partnerAnalytics(req, res, next) {
  try {
    const days = Math.min(Number(req.query.days) || 30, 180);
    const data = await cachedAnalytics(`intel:partners:${days}`, 120, async () => {
      const since = new Date(Date.now() - days * 86_400_000);
      const rows = await EventBooking.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: {
          _id: '$partnerId',
          bookings:     { $sum: 1 },
          completed:    { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          cancelled:    { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          revenuePaise: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$pricing.totalPaise', 0] } },
        } },
        { $sort: { revenuePaise: -1, bookings: -1 } },
        { $limit: 50 },
        { $lookup: { from: 'eventpartners', localField: '_id', foreignField: '_id', as: 'p' } },
        { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
        { $project: {
          name: '$p.businessName', rating: '$p.rating',
          bookings: 1, completed: 1, cancelled: 1,
          revenueRupees: { $round: [{ $divide: ['$revenuePaise', 100] }, 0] },
        } },
      ]);
      const totals = rows.reduce((a, r) => ({
        bookings: a.bookings + r.bookings, completed: a.completed + r.completed, revenue: a.revenue + r.revenueRupees,
      }), { bookings: 0, completed: 0, revenue: 0 });
      return {
        windowDays: days,
        totalPartners: rows.length,
        totals,
        partners: rows.map((r, i) => ({
          rank: i + 1,
          name: r.name || 'Partner',
          rating: r.rating ?? 0,
          bookings: r.bookings,
          completed: r.completed,
          cancelled: r.cancelled,
          completionPct: r.bookings > 0 ? Math.round((r.completed / r.bookings) * 100) : 0,
          revenueRupees: r.revenueRupees,
        })),
      };
    });
    res.json(data);
  } catch (err) { next(err); }
}

module.exports = { liveTraffic, visitorLocations, demandIntel, unmetDemand, expansionEngine, ceoPulse, funnel, report, partnerAnalytics };
