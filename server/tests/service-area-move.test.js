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

test('the shop changes its own address to Vikarabad: its service area follows, and Vikarabad customers find it', async () => {
  const patch = await request(app).patch('/api/shops/me/profile').set('Authorization', `Bearer ${token}`)
    .send({ address: { text: 'Market Mainroad 143, Vikarabad', location: { coordinates: VIKARABAD } } });
  expect(patch.status).toBe(200);
  const area = await ProviderServiceArea.findOne({ shopId: shop._id }).lean();
  expect(area.center.coordinates).toEqual(VIKARABAD);
  expect(area.workshopAddress).toBe('Market Mainroad 143, Vikarabad');
  const near = await matching.findServiceableProviders({ lng: VIKARABAD[0], lat: VIKARABAD[1] + 0.01, serviceMode: 'doorstep' });
  expect(near.some((p) => String(p.shopId) === String(shop._id))).toBe(true);
});
