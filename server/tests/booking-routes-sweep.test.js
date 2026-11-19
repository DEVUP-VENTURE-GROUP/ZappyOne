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
const LEAK = /`|enum value|Cast to|ObjectId|E11000|is not a function|Cannot read prop|undefined|\b[A-Z]{2,}(?:_[A-Z]+)+\b|validation failed|ValidationError|TypeError|ReferenceError/;

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

test('no booking route crashes or shows code wording, whatever is sent', async () => {
  const routes = routesOf();
  expect(routes.length).toBeGreaterThan(100);
  for (const r of routes) {
    const ids = /:\w/.test(r.path) ? [String(new mongoose.Types.ObjectId()), 'not-an-id'] : [null];
    for (const who of Object.keys(tokens)) {
      for (const id of ids) {
        const url = id ? fill(r.path, id) : r.path;
        const bodies = ['get', 'delete'].includes(r.method) ? [null] : BODIES;
        for (const body of bodies) {
          let res;
          try {
            let req = request(app)[r.method](url).set(tokens[who]).set('X-Forwarded-For', `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`);
            if (body) req = req.send(body);
            res = await req;
          } catch (e) { found.push(`${r.method.toUpperCase()} ${r.path} as ${who}: request threw ${e.message}`); continue; }
          const msg = res.body?.error || res.body?.message || '';
          if (res.status >= 500 && !PAY_OFF(res, r.path)) found.push(`${res.status} ${r.method.toUpperCase()} ${r.path} as ${who} id=${id} body=${body ? 'junk/empty' : '-'}: ${msg}`);
          else if (res.status >= 400 && typeof msg === 'string' && LEAK.test(msg)) found.push(`WORDING ${res.status} ${r.method.toUpperCase()} ${r.path} as ${who}: "${msg}"`);
          else if (who === 'none' && res.status < 400 && !PUBLIC.test(r.path)) found.push(`OPEN ${res.status} ${r.method.toUpperCase()} ${r.path} answers without sign-in`);
        }
      }
    }
  }
  const uniq = [...new Set(found)];
  console.log(`routes: ${routes.length}, findings: ${uniq.length}\n${uniq.slice(0, 200).join('\n')}`);
  expect(uniq).toEqual([]);
});
