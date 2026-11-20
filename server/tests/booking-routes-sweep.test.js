// Every booking route, called the way a broken or hostile app would: no sign-in, wrong role, a bad or unknown id, someone else's booking, an empty or junk body.
// Nothing may crash (5xx) and no reply may show code or database wording to a person.
jest.mock('../src/modules/maps/google-maps.service', () => ({ getDistanceMatrix: jest.fn(async () => { throw new Error('no network in tests'); }) }));
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(30 * 60000);
const SOURCES = [
  ['/api/repair', '../src/modules/repair/repair.routes'],
  ['/api/service-plans', '../src/modules/service-plan/plan.routes'],
  ['/api/jobs', '../src/modules/jobs/jobs.routes'],
  ['/api/helping', '../src/modules/helping/helping.routes'],
  ['/api/pet', '../src/modules/pet/pet.routes'],
  ['/api/orders', '../src/modules/order/order.routes'],
  ['/api/orders', '../src/modules/order/features.routes'],
  ['/api/events/partner', '../src/modules/events/event.routes', 'partnerRouter'],
  ['/api/events', '../src/modules/events/event.routes', 'router'],
  ['/api/rewards', '../src/modules/rewards/rewards.routes'],
  ['/api/wallet', '../src/modules/wallet/wallet.routes'],
];
const LEAK = /`|enum value|Cast to|ObjectId|E11000|is not a function|Cannot read prop|undefined|\b[A-Z]{2,}_[A-Z_]{2,}\b|validation failed|ValidationError|TypeError|ReferenceError/;

// The catalogue customers browse before signing in.
const PUBLIC = /public|catalog|config|categories|themes|share|\/repair\/(verticals|product-types|brands|problems|addons)|\/helping\/services$/i;
// Online payment switched off (no gateway yet) says so in plain words: not a crash.
const PAY_OFF = (res, path) => res.status === 503 && /\/pay\//.test(path) && /pay in cash/i.test(res.body?.error || '');
const found = [];
let app; let tokens;
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  const { signAccessToken } = require('../src/modules/auth/token.service');
  const User = require('../src/modules/user/user.model');
  const Worker = require('../src/modules/worker/worker.model');
  const u = await User.create({ name: 'Asha', phone: '9000000101' });
  const w = await Worker.create({ name: 'Ravi', phone: '9000000102', isOnline: true, currentLocation: { type: 'Point', coordinates: [78.39, 17.45], updatedAt: new Date() } });
  const shopId = new mongoose.Types.ObjectId();
  const t = (sub, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(sub), role })}` });
  tokens = { none: {}, user: t(u._id, 'user'), worker: t(w._id, 'worker'), shop: t(shopId, 'shop') };
});
afterAll(stopMongo);

function routesOf() {
  const out = [];
  for (const [prefix, file, key] of SOURCES) {
    let router;
    try { router = key ? require(file)[key] : require(file); } catch { continue; }
    for (const layer of router.stack || []) {
      if (!layer.route || typeof layer.route.path !== 'string') continue;
      for (const m of Object.keys(layer.route.methods)) out.push({ method: m, path: prefix + layer.route.path });
    }
  }
  return out;
}

const fill = (path, id) => path.replace(/:(\w+)\??/g, (_, name) => (/kind$/i.test(name) ? 'repair' : /action$/i.test(name) ? 'pause' : id));
const BODIES = [{}, { status: { $gt: '' }, amountPaise: -5, photos: 'x', reason: 12, date: 'not-a-date', lat: 'x', items: [{}] }];

// Every call one route gets: each identity, each id kind, each body kind.
function callsFor(r) {
  const ids = /:\w/.test(r.path) ? [String(new mongoose.Types.ObjectId()), 'not-an-id'] : [null];
  const bodies = ['get', 'delete'].includes(r.method) ? [null] : BODIES;
  return Object.keys(tokens).flatMap((who) => ids.flatMap((id) => bodies.map((body) => ({ who, id, body, url: id ? fill(r.path, id) : r.path }))));
}

async function send(r, c) {
  const ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const req = request(app)[r.method](c.url).set(tokens[c.who]).set('X-Forwarded-For', ip);
  return c.body ? req.send(c.body) : req;
}

// What is wrong with one answer, or null.
function judge(r, c, res) {
  const msg = res.body?.error || res.body?.message || '';
  const what = `${r.method.toUpperCase()} ${r.path} as ${c.who}`;
  if (res.status >= 500 && !PAY_OFF(res, r.path)) return `${res.status} ${what} id=${c.id}: ${msg}`;
  if (res.status >= 400 && typeof msg === 'string' && LEAK.test(msg)) return `WORDING ${res.status} ${what}: "${msg}"`;
  if (c.who === 'none' && res.status < 400 && !PUBLIC.test(r.path)) return `OPEN ${res.status} ${what} answers without sign-in`;
  return null;
}

test('no booking route crashes or shows code wording, whatever is sent', async () => {
  const routes = routesOf();
  expect(routes.length).toBeGreaterThan(100);
  for (const r of routes) {
    for (const c of callsFor(r)) {
      const problem = await send(r, c).then((res) => judge(r, c, res), (e) => `${r.method.toUpperCase()} ${r.path} as ${c.who}: request threw ${e.message}`);
      if (problem) found.push(problem);
    }
  }
  const uniq = [...new Set(found)];
  console.log(`routes: ${routes.length}, findings: ${uniq.length}`, uniq.slice(0, 200));
  expect(uniq).toEqual([]);
});
