// Staff IDs: issued once per staff member, unique even when asked at the same time, kept, searchable; partners get none.
const { startMongo, stopMongo } = require('./helpers');
const Worker = require('../src/modules/worker/worker.model');
const staffId = require('../src/modules/workforce/staff-id');

jest.setTimeout(60000);
beforeAll(async () => { await startMongo(); await Worker.syncIndexes(); });
afterAll(stopMongo);

test('one ID each, never a duplicate, partners none', async () => {
  const a = await Worker.create({ name: 'A', phone: '9844400001', employment: { type: 'staff' } });
  const b = await Worker.create({ name: 'B', phone: '9844400002', employment: { type: 'staff' } });
  const p = await Worker.create({ name: 'P', phone: '9844400003' });
  const [x, y] = await Promise.all([staffId.ensure(a._id), staffId.ensure(a._id)]);
  expect(x).toMatch(/^ZO\d{5}$/);
  expect(y).toBe(x);
  expect(await staffId.ensure(a._id)).toBe(x);
  expect(await staffId.ensureAll()).toBe(1);
  const idB = (await Worker.findById(b._id).lean()).employment.staffId;
  expect(idB).toMatch(/^ZO\d{5}$/);
  expect(idB).not.toBe(x);
  expect(await staffId.ensure(p._id)).toBeNull();
});
