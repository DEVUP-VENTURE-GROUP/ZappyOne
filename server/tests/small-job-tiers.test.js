// Small jobs pay a smaller commission: the lower of the partner's rate and the tier for the job's size (Economics → Small jobs).
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let pc; let cfg;
beforeAll(async () => {
  await startMongo();
  pc = require('../src/modules/shop/partner-commission');
  cfg = require('../src/modules/pricing/services/config.service');
});
afterAll(stopMongo);

test('each size falls in its tier; above every tier the partner rate stands', async () => {
  const { smallJobs } = await cfg.partnerCommissionSettings();
  const [small, mid] = [...smallJobs].sort((a, b) => a.uptoRupees - b.uptoRupees);
  expect(await pc.forBase(5, small.uptoRupees * 100)).toBe(Math.min(5, small.pct));
  expect(await pc.forBase(5, small.uptoRupees * 100 + 100)).toBe(Math.min(5, mid.pct));
  expect(await pc.forBase(5, mid.uptoRupees * 100 + 100)).toBe(5);
});

test('an agreed rate lower than the tier is never raised, and staff (no rate) stay without one', async () => {
  expect(await pc.forBase(1, 9900)).toBe(1);
  expect(await pc.forBase(null, 9900)).toBeNull();
});

test('with no tiers set, every job pays the partner rate', async () => {
  await cfg.updateActiveConfig({ partnerCommission: { ...cfg.PARTNER_COMMISSION_DEFAULTS, smallJobs: [] } }, null);
  expect(await pc.forBase(5, 9900)).toBe(5);
});
