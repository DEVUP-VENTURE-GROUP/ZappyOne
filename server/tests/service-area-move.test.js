// A shop moves its service area: the one area moves (no second one left behind), and customers near the new pin are matched whatever the area's city label says.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
let app; let shop; let token; let ProviderServiceArea; let matching;
const VIKARABAD = [77.9044, 17.3381];
const GACHIBOWLI = [78.3489, 17.4401];
const put = (body) => request(app).put('/api/repair/provider/service-areas').set('Authorization', `Bearer ${token}`)
  .send({ vertical: 'bike_wash', radiusKm: 20, serviceModes: ['doorstep'], ...body });

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  const Shop = require('../src/modules/shop/shop.model');
  ({ ProviderServiceArea } = require('../src/modules/repair/models/config.model'));
  matching = require('../src/modules/repair/services/matching.service');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  shop = await Shop.create({ businessName: 'MB Groups', ownerName: 'Asif', phone: '9000000921', isActive: true, kyc: { status: 'approved' } });
  token = signAccessToken({ sub: String(shop._id), role: 'shop', phone: shop.phone });
});
afterAll(stopMongo);

const found = async (cityCode) => (await matching.findServiceableProviders({ lng: GACHIBOWLI[0], lat: GACHIBOWLI[1] + 0.01, cityCode, serviceMode: 'doorstep' }))
  .some((p) => String(p.shopId || p.area?.shopId) === String(shop._id));

test('the pin moves to Hyderabad: one area, at the new pin, and Hyderabad customers find the shop', async () => {
  expect((await put({ cityCode: 'vikarabad', center: VIKARABAD, workshopAddress: 'Vikarabad' })).status).toBe(200);
  expect(await found('hyderabad')).toBe(false);

  // Moved with the city still reading Vikarabad (what happened), then with the city changed too.
  expect((await put({ cityCode: 'vikarabad', center: GACHIBOWLI, workshopAddress: 'Gachibowli, Hyderabad' })).status).toBe(200);
  expect(await found('hyderabad')).toBe(true);
  expect((await put({ cityCode: 'hyderabad', center: GACHIBOWLI, workshopAddress: 'Gachibowli, Hyderabad' })).status).toBe(200);

  const areas = await ProviderServiceArea.find({ shopId: shop._id }).lean();
  expect(areas).toHaveLength(1);
  expect(areas[0]).toMatchObject({ cityCode: 'hyderabad', workshopAddress: 'Gachibowli, Hyderabad' });
  expect(areas[0].center.coordinates).toEqual(GACHIBOWLI);

  const listed = await request(app).get('/api/repair/provider/service-areas?vertical=bike_wash').set('Authorization', `Bearer ${token}`);
  expect(listed.body.areas[0].workshopAddress).toBe('Gachibowli, Hyderabad');
});

test('a shop is measured from its own address: Vikarabad customers see the Vikarabad shop, Gachibowli (48 km) does not', async () => {
  const Shop = require('../src/modules/shop/shop.model');
  const vkb = await Shop.create({ businessName: 'VKB Wash', ownerName: 'Asif', phone: '9000000922', isActive: true, kyc: { status: 'approved' }, address: { text: 'Market Mainroad, Vikarabad', location: { type: 'Point', coordinates: VIKARABAD } } });
  // The area pin left near Gachibowli, as MB GROUPS had it.
  await ProviderServiceArea.create({ shopId: vkb._id, cityCode: 'vikarabad', center: { type: 'Point', coordinates: GACHIBOWLI }, radiusKm: 20, serviceModes: ['doorstep'] });
  const at = async ([lng, lat]) => (await matching.findServiceableProviders({ lng, lat, serviceMode: 'doorstep' })).find((p) => String(p.shopId) === String(vkb._id));
  const inVikarabad = await at([VIKARABAD[0] + 0.02, VIKARABAD[1]]);
  expect(inVikarabad).toBeTruthy();
  expect(inVikarabad.distanceKm).toBeLessThan(3);
  expect(await at([GACHIBOWLI[0], GACHIBOWLI[1] + 0.01])).toBeUndefined();
});
