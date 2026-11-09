// How long each API route takes, kept in this process's memory only (last 300 per route, no database or Redis writes), for admin App & traffic > Speed.
const KEEP = 300;
const MAX_ROUTES = 400;
const samples = new Map();
const started = Date.now();

function requestTiming(req, res, next) {
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    // Ids and numbers become :id, so /bookings/123 and /bookings/456 count as one route.
    const path = String(req.originalUrl || '').split('?')[0].split('/').map((seg) => (/^([0-9a-f]{24}|\d+|[0-9a-f-]{32,36})$/i.test(seg) ? ':id' : seg)).join('/');
    if (!path.startsWith('/api/') || path.includes('/telemetry/')) return;
    const route = `${req.method} ${path}`;
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    let row = samples.get(route);
    if (!row) {
      if (samples.size >= MAX_ROUTES) return;
      row = { times: [], count: 0, errors: 0 };
      samples.set(route, row);
    }
    row.count += 1;
    if (res.statusCode >= 500) row.errors += 1;
    row.times.push(ms);
    if (row.times.length > KEEP) row.times.shift();
  });
  next();
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);

/** The slowest routes by their worst 5%, with typical time, calls and server errors since this process started. */
function speedStats(limit = 25) {
  const rows = [...samples.entries()].map(([route, r]) => {
    const sorted = [...r.times].sort((a, b) => a - b);
    return { route, calls: r.count, errors: r.errors, p50: Math.round(pct(sorted, 0.5)), p95: Math.round(pct(sorted, 0.95)) };
  });
  return { since: new Date(started).toISOString(), routes: rows.sort((a, b) => b.p95 - a.p95).slice(0, limit) };
}

module.exports = { requestTiming, speedStats };
