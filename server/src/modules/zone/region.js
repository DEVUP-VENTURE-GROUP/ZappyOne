/**
 * Launch regions: where every live service is SHOWN, whether or not a provider
 * covers the exact spot yet.
 *
 * Inside a region a customer sees the whole catalog; a service nobody near
 * them is verified for reads "coming soon" and records demand (which service,
 * where) instead of taking a booking nobody can fulfil. That demand is how we
 * decide where to recruit next. Outside every region the zone rules apply as
 * before.
 *
 * Bounds are the state's outer box — generous at the edges by design: a
 * customer just across a border seeing "coming soon" is harmless.
 */
const LAUNCH_REGIONS = [
  { code: 'telangana', name: 'Telangana', minLat: 15.83, maxLat: 19.92, minLng: 77.23, maxLng: 81.33 },
];

function regionAt(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  const r = LAUNCH_REGIONS.find((x) => la >= x.minLat && la <= x.maxLat && ln >= x.minLng && ln <= x.maxLng);
  return r ? { code: r.code, name: r.name } : null;
}

module.exports = { LAUNCH_REGIONS, regionAt };
