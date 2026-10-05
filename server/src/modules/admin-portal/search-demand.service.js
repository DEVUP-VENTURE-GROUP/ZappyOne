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

module.exports = { summary };
