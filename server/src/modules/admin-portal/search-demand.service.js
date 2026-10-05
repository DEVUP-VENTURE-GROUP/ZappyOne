/**
 * What customers are looking for, for the admin Overview: the searches people
 * type, the ones we could not serve (the services to add or the places to find
 * providers), and which services are rising. Read from the SearchEvent stream:
 * typed searches (category = the service it found, or "unmatched") and service
 * opens. Counted by distinct people, so one person retyping is one search.
 */
const { SearchEvent } = require('../telemetry/telemetry.model');

const DAY = 86_400_000;
const who = { $ifNull: ['$userId', { $ifNull: ['$sessionId', '$_id'] }] };

async function summary({ now = Date.now() } = {}) {
  const today = new Date(now - DAY);
  const yesterday = new Date(now - 2 * DAY);
  const week = new Date(now - 7 * DAY);

  const [queries, unmet, services, prevServices] = await Promise.all([
    // Most-typed searches this week, by distinct people.
    SearchEvent.aggregate([
      { $match: { createdAt: { $gte: week }, query: { $nin: [null, ''] } } },
      { $group: { _id: { q: { $toLower: '$query' }, who }, today: { $max: { $cond: [{ $gte: ['$createdAt', today] }, 1, 0] } }, miss: { $max: { $cond: [{ $eq: ['$result', 'no_service'] }, 1, 0] } } } },
      { $group: { _id: '$_id.q', people: { $sum: 1 }, today: { $sum: '$today' }, unserved: { $sum: '$miss' } } },
      { $sort: { people: -1 } }, { $limit: 8 },
    ]),
    // Searches we could not serve this week: nothing matched, or nobody serves there.
    SearchEvent.aggregate([
      { $match: { createdAt: { $gte: week }, result: 'no_service', category: { $ne: 'all_services' } } },
      // What they typed, or the service they opened when they typed nothing.
      { $group: { _id: { what: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$query', ''] } }, 0] }, { $toLower: '$query' }, '$category'] }, city: '$city', who } } },
      { $group: { _id: { what: '$_id.what', city: '$_id.city' }, people: { $sum: 1 } } },
      { $sort: { people: -1 } }, { $limit: 6 },
    ]),
    // Services people went for in the last day, and the day before, for movers.
    SearchEvent.aggregate([
      { $match: { createdAt: { $gte: today }, category: { $nin: ['unmatched', 'all_services'] } } },
      { $group: { _id: { c: '$category', who } } },
      { $group: { _id: '$_id.c', people: { $sum: 1 } } },
    ]),
    SearchEvent.aggregate([
      { $match: { createdAt: { $gte: yesterday, $lt: today }, category: { $nin: ['unmatched', 'all_services'] } } },
      { $group: { _id: { c: '$category', who } } },
      { $group: { _id: '$_id.c', people: { $sum: 1 } } },
    ]),
  ]);

  const prev = new Map(prevServices.map((r) => [r._id, r.people]));
  const rising = services
    .map((r) => ({ service: r._id, today: r.people, yesterday: prev.get(r._id) || 0 }))
    .filter((r) => r.today >= 3 && r.today > r.yesterday)
    .sort((a, b) => (b.today - b.yesterday) - (a.today - a.yesterday))
    .slice(0, 5);

  return {
    topSearches: queries.map((r) => ({ query: r._id, people: r.people, today: r.today, unserved: r.unserved })),
    unserved: unmet.map((r) => ({ what: r._id.what, city: r._id.city || null, people: r.people })),
    rising,
    peopleToday: services.reduce((n, r) => n + r.people, 0),
  };
}

/**
 * The Demand screen: people searching each service against the providers we
 * have for it and the bookings it got, for a period with the one before it.
 *
 *   pressure     searchers per approved provider: where to recruit
 *   conversion   bookings per searcher: where demand is not turning into jobs
 */
async function demand({ days = 7, now = Date.now() } = {}) {
  days = [7, 30, 90].includes(Number(days)) ? Number(days) : 7;
  const { ServiceLine, ProviderEnrolment } = require('../onboarding/onboarding.model');
  const { bookingsIn, istDayStart } = require('./analytics.service');
  const start = istDayStart(now) - (days - 1) * DAY;
  const prevStart = start - (now - start);
  const range = { $gte: new Date(start) };

  const [daily, byLine, prevByLine, lines, providers, bookings, top] = await Promise.all([
    SearchEvent.aggregate([
      // Opening "All services" is browsing, not a search.
      { $match: { createdAt: range, category: { $ne: 'all_services' } } },
      { $group: { _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+05:30' } }, who }, miss: { $max: { $cond: [{ $eq: ['$result', 'no_service'] }, 1, 0] } } } },
      { $group: { _id: '$_id.d', people: { $sum: 1 }, unserved: { $sum: '$miss' } } },
      { $sort: { _id: 1 } },
    ]),
    SearchEvent.aggregate([
      { $match: { createdAt: range, category: { $nin: ['unmatched', 'all_services'] } } },
      { $group: { _id: { c: '$category', who }, miss: { $max: { $cond: [{ $eq: ['$result', 'no_service'] }, 1, 0] } } } },
      { $group: { _id: '$_id.c', people: { $sum: 1 }, unserved: { $sum: '$miss' } } },
    ]),
    SearchEvent.aggregate([
      { $match: { createdAt: { $gte: new Date(prevStart), $lt: new Date(start) }, category: { $nin: ['unmatched', 'all_services'] } } },
      { $group: { _id: { c: '$category', who } } },
      { $group: { _id: '$_id.c', people: { $sum: 1 } } },
    ]),
    ServiceLine.find({}).select('code name repairVertical status').lean(),
    ProviderEnrolment.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: '$lineCode', providers: { $sum: 1 } } },
    ]),
    bookingsIn(start, now),
    summary({ now }),
  ]);

  // A booking's service line, the same way every Insights screen maps it.
  const { lineOf } = await require('./analytics.service').lineMapper();
  const booked = new Map();
  for (const r of bookings) { const l = lineOf(r); if (l) booked.set(l, (booked.get(l) || 0) + 1); }

  const name = new Map(lines.map((l) => [l.code, l.name]));
  const pretty = (code) => name.get(code) || String(code).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  const prov = new Map(providers.map((p) => [p._id, p.providers]));
  const prev = new Map(prevByLine.map((p) => [p._id, p.people]));
  const services = byLine.map((r) => {
    const providersN = prov.get(r._id) || 0;
    const bookingsN = booked.get(r._id) || 0;
    return {
      lineCode: r._id,
      label: pretty(r._id),
      searchers: r.people,
      prevSearchers: prev.get(r._id) || 0,
      unserved: r.unserved,
      providers: providersN,
      bookings: bookingsN,
      pressure: providersN ? Math.round((r.people / providersN) * 10) / 10 : null,
      // Bookings can come without a search first; past 100% it simply reads as 100%+.
      conversion: r.people ? Math.min(100, Math.round((bookingsN / r.people) * 1000) / 10) : null,
    };
  }).sort((a, b) => b.searchers - a.searchers);

  // Every day of the period, so the chart's dates run without gaps.
  const byDay = new Map(daily.map((d) => [d._id, d]));
  const allDays = [];
  for (let t = start; t <= now; t += DAY) {
    const date = new Date(t + 330 * 60_000).toISOString().slice(0, 10);
    allDays.push({ date, people: byDay.get(date)?.people || 0, unserved: byDay.get(date)?.unserved || 0 });
  }
  const unservedNamed = top.unserved.map((u) => ({ ...u, what: name.has(u.what) ? name.get(u.what) : u.what }));
  const people = daily.reduce((s, d) => s + d.people, 0);
  const unserved = daily.reduce((s, d) => s + d.unserved, 0);
  const findings = [];
  const noSupply = services.filter((s) => s.searchers >= 3 && !s.providers).sort((a, b) => b.searchers - a.searchers)[0];
  if (noSupply) findings.push({ tone: 'bad', text: `${noSupply.searchers} people looked for ${noSupply.label} and there is no approved provider. Recruit there first.` });
  const pressed = services.filter((s) => s.providers && s.pressure >= 10).sort((a, b) => b.pressure - a.pressure)[0];
  if (pressed) findings.push({ tone: 'warn', text: `${pressed.label}: ${pressed.pressure} searchers per provider. Add providers before demand goes elsewhere.` });
  const leaky = services.filter((s) => s.searchers >= 10 && s.conversion != null && s.conversion < 10).sort((a, b) => a.conversion - b.conversion)[0];
  if (leaky) findings.push({ tone: 'warn', text: `${leaky.label}: only ${leaky.conversion}% of searchers book. Check its price and the booking steps.` });
  if (unservedNamed[0]) findings.push({ tone: 'bad', text: `Most asked for and not served: ${unservedNamed[0].what}${unservedNamed[0].city ? ` in ${unservedNamed[0].city}` : ''}.` });

  return {
    range: { days, from: new Date(start), to: new Date(now) },
    searchers: people,
    unserved,
    servedRate: people ? Math.round(((people - unserved) / people) * 1000) / 10 : null,
    daily: allDays,
    services,
    topSearches: top.topSearches,
    unservedSearches: unservedNamed,
    rising: top.rising,
    findings,
  };
}

module.exports = { summary, demand };
