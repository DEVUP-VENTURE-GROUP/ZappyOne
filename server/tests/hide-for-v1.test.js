// The v1 hide switches eight services off, and re-running the launch scripts never turns them back on.
const { startMongo, stopMongo } = require('./helpers');
const { ServiceDomain, ServiceLine } = require('../src/modules/onboarding/onboarding.model');
const { hide, HIDE } = require('../scripts/hide-for-v1');
const homeServices = require('../scripts/launch-home-services');
const familyAssist = require('../scripts/launch-family-assist');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

test('hidden stays hidden through a re-launch; the rest stay on', async () => {
  await ServiceDomain.create([{ code: 'home_services', name: 'Home' }, { code: 'family_assist', name: 'Family Assist' }]);
  await homeServices.launch();
  await familyAssist.launch();
  await ServiceLine.create({ code: 'returns_exchange', name: 'Returns', domainCode: 'family_assist', status: 'live', customerPath: '/helping/returns' });
  await hide();
  await homeServices.launch();
  await familyAssist.launch();
  expect(await ServiceLine.countDocuments({ code: { $in: HIDE }, isActive: true })).toBe(0);
  expect((await ServiceLine.find({ domainCode: 'family_assist', isActive: true }).lean()).map((l) => l.code).sort())
    .toEqual(['fa_doctor_escort', 'fa_elder_checkin', 'fa_grocery_run', 'fa_party_helper', 'fa_puja_help']);
});
