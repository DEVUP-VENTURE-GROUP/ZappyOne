// Where to launch the next hub: demand cells (analytics geo) against hub and partner coverage, then a greedy pick of the sites that would serve the most unserved demand within the arrival promise.
const Hub = require('../workforce/hub.model');
const { covers } = require('../workforce/coverage');

const DAY = 86_400_000;
const IST = 330 * 60_000;
const km = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180));
// Unmet searches count double: someone asked and nobody could come.
const weightOf = (c) => c.bookings + c.searches + c.unserved;

async function nextLaunch({ days = 30, sites = 3, now = Date.now() } = {}) {
  const span = Math.min(90, Math.max(7, Number(days) || 30));
  const analytics = require('./analytics.service');
  const cfg = require('../pricing/services/config.service');
  const [geo, rows, hubs, fa, wf] = await Promise.all([
    analytics.geo({ days: span, now }),
    analytics.bookingsIn(analytics.istDayStart(now) - (span - 1) * DAY, now),
    Hub.find({ isActive: true }).select('name serviceKm area places meetingPoint isActive').lean(),
    cfg.fastAssignSettings(),
    cfg.workforceSettings(),
  ]);
  const radius = Math.max(1, require('../jobs/arrival').kmWithinPromise(fa.fairBandMin));
  const perMonth = 30 / span;

  const byPartner = (c) => geo.providers.some((p) => !p.live && km(p, c) <= Math.max(p.radiusKm, 3));
  const cells = geo.cells.map((c) => ({ ...c, w: weightOf(c), hub: hubs.some((h) => covers(h, c)), partner: byPartner(c) })).filter((c) => c.w > 0);
  const total = cells.reduce((s, c) => s + c.w, 0);
  const share = (f) => (total ? Math.round((cells.filter(f).reduce((s, c) => s + c.w, 0) / total) * 100) : 0);
  const coverage = { hubPct: share((c) => c.hub), partnerOnlyPct: share((c) => !c.hub && c.partner), nobodyPct: share((c) => !c.hub && !c.partner), demand: total };

  // Grid buckets of ~2.2 km so each candidate only looks at its neighbours: O(cells × neighbours) per pick.
  const step = radius / 111;
  const key = (lat, lng) => `${Math.floor(lat / step)}:${Math.floor(lng / step)}`;
  const open = cells.filter((c) => !c.hub);
  const grid = new Map();
  for (const c of open) { const k = key(c.lat, c.lng); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c); }
  const near = (c) => {
    const [gy, gx] = key(c.lat, c.lng).split(':').map(Number);
    const out = [];
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) for (const o of grid.get(`${gy + dy}:${gx + dx}`) || []) if (!o.taken && km(c, o) <= radius) out.push(o);
    return out;
  };

  const picks = [];
  for (let i = 0; i < sites; i += 1) {
    let best = null;
    for (const c of open) {
      if (c.taken) continue;
      const group = near(c);
      const gain = group.reduce((s, o) => s + o.w, 0);
      if (!best || gain > best.gain) best = { c, group, gain };
    }
    if (!best || best.gain <= 0) break;
    best.group.forEach((o) => { o.taken = true; });
    const g = best.group;
    const at = { lat: g.reduce((s, o) => s + o.lat * o.w, 0) / best.gain, lng: g.reduce((s, o) => s + o.lng * o.w, 0) / best.gain };
    const sum = (f) => g.reduce((s, o) => s + (o[f] || 0), 0);
    const areaVotes = {};
    g.forEach((o) => { if (o.area) areaVotes[o.area] = (areaVotes[o.area] || 0) + o.w; });
    const local = rows.filter((r) => r.point && km(r.point, at) <= radius);
    const services = {};
    local.forEach((r) => { if (r.service) services[r.service] = (services[r.service] || 0) + 1; });
    const hours = Array(24).fill(0);
    local.forEach((r) => { hours[new Date(r.at + IST).getUTCHours()] += 1; });
    const peak = hours.indexOf(Math.max(...hours));
    const jobs = Math.round((sum('bookings') + sum('unserved')) * perMonth);
    const nearestHub = hubs.map((h) => ({ name: h.name, km: km({ lat: h.meetingPoint.location.coordinates[1], lng: h.meetingPoint.location.coordinates[0] }, at) })).sort((a, b) => a.km - b.km)[0] || null;
    picks.push({
      rank: i + 1, lat: Number(at.lat.toFixed(5)), lng: Number(at.lng.toFixed(5)), radiusKm: Number(radius.toFixed(1)),
      area: Object.entries(areaVotes).sort((a, b) => b[1] - a[1])[0]?.[0] || `${at.lat.toFixed(3)}, ${at.lng.toFixed(3)}`,
      demandShare: total ? Math.round((best.gain / total) * 100) : 0,
      bookings: sum('bookings'), searches: sum('searches'), unserved: sum('unserved'), cancelled: sum('cancelled'),
      jobsPerMonth: jobs, staffNeeded: Math.max(1, Math.ceil(jobs / Math.max(1, wf.monthlyJobTarget))),
      takePerMonthPaise: Math.round(sum('takePaise') * perMonth),
      topServices: Object.entries(services).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => ({ name, n })),
      peakHour: local.length ? peak : null,
      partnersNearby: geo.providers.filter((p) => !p.live && km(p, at) <= radius + Math.max(p.radiusKm, 0)).length,
      nearestHub: nearestHub && { name: nearestHub.name, km: Number(nearestHub.km.toFixed(1)) },
    });
  }

  const summary = [];
  const hr = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
  if (!total) summary.push('Not enough bookings or searches with a location yet to say where demand is.');
  else {
    summary.push(`${coverage.hubPct}% of demand in the last ${span} days falls inside your hubs' areas; ${coverage.partnerOnlyPct}% is served only by partners, and ${coverage.nobodyPct}% by nobody.`);
    if (picks[0]) {
      const p = picks[0];
      summary.push(`Launch next in ${p.area}: about ${p.jobsPerMonth} jobs a month within ${p.radiusKm} km (${p.demandShare}% of all demand), needing about ${p.staffNeeded} staff at ${wf.monthlyJobTarget} jobs each.${p.topServices[0] ? ` Mostly ${p.topServices.map((s) => s.name).join(', ')}.` : ''}${p.peakHour != null ? ` Busiest around ${hr(p.peakHour)}.` : ''}`);
      if (p.unserved) summary.push(`${p.unserved} people searched there and found no one. That is the clearest sign of unmet demand.`);
      if (p.partnersNearby) summary.push(`${p.partnersNearby} partner${p.partnersNearby === 1 ? '' : 's'} already work near ${p.area}; a hub there competes with them, or recruit them instead.`);
    }
    if (picks.length > 1) summary.push(`After that: ${picks.slice(1).map((p) => `${p.area} (about ${p.jobsPerMonth} jobs a month)`).join(', then ')}.`);
    if (total < 60) summary.push(`Only ${total} demand signals so far, so treat these as early pointers; they firm up as bookings grow.`);
  }

  return { days: span, promise: { minutes: fa.fairBandMin, km: Number(radius.toFixed(1)) }, coverage, sites: picks, summary, cells: cells.map(({ lat, lng, w, hub, partner }) => ({ lat, lng, w, hub, partner })), hubs: hubs.map((h) => ({ name: h.name, lat: h.meetingPoint.location.coordinates[1], lng: h.meetingPoint.location.coordinates[0], serviceKm: h.serviceKm, area: h.area, places: h.places })) };
}

module.exports = { nextLaunch };
