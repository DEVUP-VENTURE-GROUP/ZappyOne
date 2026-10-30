// Shifts optional (default): online staff count as on duty; with shifts required only a checked-in shift does.
const { startMongo, stopMongo } = require('./helpers');
const Worker = require('../src/modules/worker/worker.model');
const cfg = require('../src/modules/pricing/services/config.service');
const staff = require('../src/modules/workforce/staff');

jest.setTimeout(60000);
beforeAll(async () => {
  await startMongo();
  // Own staff are locked for version 1; these tests cover the version 2 behaviour.
  await require('../src/modules/feature-flags/feature-flag.service').set('own_staff', true, null);
});
afterAll(stopMongo);

test('online staff are on duty unless shifts are required', async () => {
  const on = await Worker.create({ name: 'On', phone: '9855500001', isOnline: true, employment: { type: 'staff' } });
  await Worker.create({ name: 'Off', phone: '9855500002', isOnline: false, employment: { type: 'staff' } });
  await Worker.create({ name: 'Partner', phone: '9855500003', isOnline: true });
  expect([...(await staff.onDutyIds())]).toEqual([String(on._id)]);
  jest.spyOn(cfg, 'workforceSettings').mockResolvedValue({ shiftRequired: true });
  expect([...(await staff.onDutyIds())]).toEqual([]);
});
