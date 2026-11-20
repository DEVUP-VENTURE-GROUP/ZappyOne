// Load test of the routes every booking passes through, on this machine against a throwaway database: many customers at once, response times and errors per route.
// Run: node scripts/load-test.js [users=50] [seconds=20]. It never touches a real database: it starts its own in-memory MongoDB.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const http = require('http');
const mongoose = require('mongoose');

const USERS = Number(process.argv[2]) || 50;
const SECONDS = Number(process.argv[3]) || 20;
const LAT = 17.44; const LNG = 78.39;

async function seed() {
  await require('../src/modules/onboarding/run-catalog-az').seedCatalogAZ();
  const Shop = require('../src/modules/shop/shop.model');
  const User = require('../src/modules/user/user.model');
  const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const menu = require('../src/modules/repair/services/provider-menu.service');
  for (let i = 0; i < 20; i += 1) {
    const s = await Shop.create({ businessName: `Load Shop ${i}`, ownerName: 'Owner', phone: `96000${String(i).padStart(5, '0')}`, isActive: true, kyc: { status: 'approved' },
      address: { location: { type: 'Point', coordinates: [LNG + i / 500, LAT] } }, services: ['daily_cleaning'] });
    await ProviderEnrolment.create({ providerKind: 'shop', shopId: s._id, domainCode: 'home_daily_help', lineCode: 'daily_cleaning', status: 'approved' });
    await ProviderServiceArea.create({ shopId: s._id, cityCode: 'hyderabad', center: { type: 'Point', coordinates: [LNG, LAT] }, radiusKm: 15, serviceModes: ['doorstep'] });
    await menu.saveItem({ shopId: s._id, workerId: null }, 'daily_cleaning', { repairCode: 'daicle_full_daily', photoKey: 'menu/x.jpg', prices: { daicle_2bhk: 40000 + i * 100 } }, { role: 'admin', id: null });
  }
  const users = await Promise.all(Array.from({ length: 5 }, (_, i) => User.create({ name: `Load ${i}`, phone: `95000${String(i).padStart(5, '0')}` })));
  const { signAccessToken } = require('../src/modules/auth/token.service');
  return users.map((u) => `Bearer ${signAccessToken({ sub: String(u._id), role: 'user' })}`);
}

const ROUTES = [
  ['catalogue', '/api/repair/verticals'],
  ['storefronts near', `/api/repair/storefronts?vertical=daily_cleaning&lat=${LAT}&lng=${LNG}`],
  ['arrival estimate', `/api/jobs/arrival?line=daily_cleaning&lat=${LAT}&lng=${LNG}`],
  ['menu search', `/api/repair/menu-search?q=daily&lat=${LAT}&lng=${LNG}`],
  ['my bookings', '/api/repair/bookings/mine'],
];

function hit(port, path, auth, ip) {
  return new Promise((resolve) => {
    const t = process.hrtime.bigint();
    const req = http.get({ host: '127.0.0.1', port, path, headers: { Authorization: auth, 'X-Forwarded-For': ip } }, (res) => {
      res.resume();
      res.on('end', () => resolve({ ms: Number(process.hrtime.bigint() - t) / 1e6, status: res.statusCode }));
    });
    req.on('error', () => resolve({ ms: Number(process.hrtime.bigint() - t) / 1e6, status: 0 }));
  });
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] || 0;

async function main() {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const tokens = await seed();
  const server = http.createServer(require('../src/app')());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();

  const stats = Object.fromEntries(ROUTES.map(([name]) => [name, { times: [], errors: 0, codes: {} }]));
  const until = Date.now() + SECONDS * 1000;
  await Promise.all(Array.from({ length: USERS }, async (_, u) => {
    let i = u;
    while (Date.now() < until) {
      const [name, path] = ROUTES[i % ROUTES.length];
      i += 1;
      // Each simulated customer has their own address, as real ones do, so per-visitor limits behave as live.
      const r = await hit(port, path, tokens[u % tokens.length], `10.1.${Math.floor(u / 250)}.${u % 250}`);
      const s = stats[name];
      s.times.push(r.ms);
      s.codes[r.status] = (s.codes[r.status] || 0) + 1;
      if (r.status === 0 || r.status >= 500) s.errors += 1;
    }
  }));

  const rows = Object.entries(stats).map(([route, s]) => {
    const t = s.times.sort((a, b) => a - b);
    return { route, requests: t.length, perSec: Math.round(t.length / SECONDS), p50ms: Math.round(pct(t, 50)), p95ms: Math.round(pct(t, 95)), p99ms: Math.round(pct(t, 99)), errors: s.errors, codes: JSON.stringify(s.codes) };
  });
  console.log(`\n${USERS} customers at once for ${SECONDS}s, this machine, in-memory database:`);
  console.table(rows);
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(0);
}

main().catch((e) => { console.error('[load-test] failed:', e.message); process.exit(1); });
