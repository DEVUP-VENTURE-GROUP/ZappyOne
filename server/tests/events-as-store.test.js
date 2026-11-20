// Events run on the one store engine: an Events category, a line whose packages are a menu, photos required, no diagnosis or quotes.
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
beforeAll(async () => {
  await startMongo();
  await require('../src/modules/onboarding/run-catalog-az').seedCatalogAZ();
});
afterAll(stopMongo);

test('the catalogue seeds Events & Celebrations with event decoration as a store menu', async () => {
  const { ServiceDomain, ServiceLine } = require('../src/modules/onboarding/onboarding.model');
  expect(await ServiceDomain.findOne({ code: 'events' }).lean()).toMatchObject({ name: 'Events & Celebrations', isActive: true });
  const line = await ServiceLine.findOne({ code: 'event_decoration' }).lean();
  expect(line).toMatchObject({ domainCode: 'events' });
  expect(await require('../src/modules/repair/services/provider-menu.service').isMenuService(line.repairVertical || 'event_decoration')).toBe(true);
});

test('an event job: priced up front, photographed when done, no diagnosis or quotes', async () => {
  const ws = require('../src/modules/onboarding/workspace');
  expect((await ws.termsForVertical('event_decoration')).flow).toMatchObject({ diagnosis: false, quote: false, photos: true });
});
