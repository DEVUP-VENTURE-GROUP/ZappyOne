// Admin reports ask for a replica; everything else stays on the primary.
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let rr; let User;
beforeAll(async () => {
  await startMongo();
  rr = require('../src/core/db/report-reads');
  User = require('../src/modules/user/user.model');
});
afterAll(stopMongo);

test('an aggregation inside a report asks for secondaryPreferred and still answers on a single server', async () => {
  await User.create({ phone: '+919000077001', name: 'R' });
  let agg;
  const rows = await rr.run(() => { agg = User.aggregate([{ $count: 'n' }]); return agg.exec(); });
  expect(agg.options.readPreference).toBeTruthy();
  expect(rows[0].n).toBeGreaterThan(0);
});

test('outside a report, aggregations stay on the primary', async () => {
  const agg = User.aggregate([{ $count: 'n' }]);
  await agg.exec();
  expect(agg.options.readPreference).toBeUndefined();
});

test('the middleware wraps admin GETs only', () => {
  let inside = null;
  rr.reportReads({ method: 'GET' }, {}, () => { inside = rr.inReport(); });
  expect(inside).toBe(true);
  rr.reportReads({ method: 'POST' }, {}, () => { inside = rr.inReport(); });
  expect(inside).toBe(false);
});
