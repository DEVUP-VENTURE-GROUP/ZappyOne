// The category catalogs (onboarding/catalog): each category has its most booked services in depth, every job is complete and bookable, the seed lands it with what is included, and a re-run keeps admin edits.
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(240000);
// Fewest services and jobs each category's seed must carry (built-in repair services are counted elsewhere).
const MIN = {
  home_daily_help: [15, 100], beauty_care: [15, 100], specialist_home: [15, 100], local_pros: [15, 90], moving: [9, 50],
  events: [6, 40], errands_pickup: [6, 40], home_services: [9, 55], vehicles: [8, 45], electronics: [7, 40],
};
const DONE = Object.keys(MIN);
let server;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGO_URI = `${server.getUri()}zappycat`;
  await mongoose.connect(process.env.MONGO_URI);
});
afterAll(async () => { await mongoose.disconnect(); await server.stop(); });

const { AZ_LINES } = require('../src/modules/onboarding/catalog-az.seed');
const { check, prefixOf } = require('../src/modules/repair/package-lines.service');
const prefix = (l) => l.prefix || prefixOf(l.code);

describe.each(DONE)('%s', (domain) => {
  const lines = AZ_LINES.filter((l) => l.domainCode === domain);
  test('carries its most booked services in depth', () => {
    expect(lines.length).toBeGreaterThanOrEqual(MIN[domain][0]);
    expect(lines.length).toBeLessThanOrEqual(25);
    expect(lines.reduce((n, l) => n + l.packages.length, 0)).toBeGreaterThanOrEqual(MIN[domain][1]);
  });
  test.each(lines.map((l) => [l.code, l]))('%s: every job is complete and passes the service check', (_code, l) => {
    expect(() => check(l)).not.toThrow();
    const types = l.types?.length ? l.types : [{ code: 'one' }];
    const codes = l.packages.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const p of l.packages) {
      expect(p.name.length).toBeLessThanOrEqual(80);
      expect(p.minutes).toBeGreaterThanOrEqual(5);
      for (const t of types) expect(p.prices[t.code]).toBeGreaterThanOrEqual(49);
      if (p.includes) {
        expect(p.includes.length).toBeGreaterThanOrEqual(2);
        expect(p.includes.length).toBeLessThanOrEqual(8);
        for (const i of p.includes) expect(i.length).toBeLessThanOrEqual(60);
      }
    }
  });
});

test('service codes and job code prefixes never clash across the whole catalog', () => {
  const codes = AZ_LINES.map((l) => l.code);
  expect(new Set(codes).size).toBe(codes.length);
  const prefixes = AZ_LINES.map(prefix);
  expect(prefixes.filter((p, i) => prefixes.indexOf(p) !== i)).toEqual([]);
});

test('seeding lands every job with what it includes, partners see the menu, and a re-run keeps admin edits', async () => {
  const { seedCatalogAZ } = require('../src/modules/onboarding/run-catalog-az');
  const { ServiceLine } = require('../src/modules/onboarding/onboarding.model');
  const { Repair } = require('../src/modules/repair/models/repair.model');
  const partner = { kind: 'worker', id: new mongoose.Types.ObjectId() };
  await ServiceLine.create({ code: 'handyman', name: 'Raju handyman works', domainCode: 'home_services', status: 'live', privateTo: partner });
  const first = await seedCatalogAZ();
  expect(first.skipped).toEqual(['handyman']);
  const kept = await ServiceLine.findOne({ code: 'handyman' }).lean();
  expect(kept).toMatchObject({ name: 'Raju handyman works', privateTo: partner });
  expect(kept.repairVertical || null).toBeNull();

  for (const domain of DONE) {
    const want = AZ_LINES.filter((l) => l.domainCode === domain && l.code !== 'handyman');
    const saved = await ServiceLine.find({ domainCode: domain, status: 'live' }).lean();
    expect(saved.length).toBeGreaterThanOrEqual(want.length);
    for (const l of want) {
      const line = saved.find((s) => s.code === l.code);
      const rows = await Repair.find({ vertical: line.repairVertical, owner: null }).select('code includes').lean();
      for (const p of l.packages.filter((x) => x.includes)) {
        expect(rows.find((r) => r.code === `${prefix({ ...l, code: line.repairVertical })}_${p.code}`)?.includes).toEqual(p.includes);
      }
    }
  }

  const line = await ServiceLine.findOne({ code: 'kitchen_deep' }).lean();
  const menu = await require('../src/modules/repair/services/provider-menu.service').menu({ shopId: new mongoose.Types.ObjectId(), workerId: null }, line.repairVertical);
  const full = menu.items.find((i) => i.name === 'Full kitchen deep clean');
  expect(full.suggested).toMatchObject({ kitdeep_small: 129900, kitdeep_medium: 159900, kitdeep_large: 199900 });
  expect(full.includes).toContain('Cabinets inside and outside');
  expect(full.offered).toBe(false);

  const job = `kitdeep_full`;
  await Repair.updateOne({ vertical: line.repairVertical, code: job }, { $set: { includes: ['Edited by admin'], name: 'Kitchen deep clean (admin)' } });
  const again = await seedCatalogAZ();
  expect(again.lines).toBe(0);
  const after = await Repair.findOne({ vertical: line.repairVertical, code: job }).lean();
  expect(after.includes).toEqual(['Edited by admin']);
  expect(after.name).toBe('Kitchen deep clean (admin)');
});
