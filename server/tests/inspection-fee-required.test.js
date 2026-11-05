// Every service needs its inspection fee chosen: until then the pro is told to set it and gets no inspection visits; ₹0 is a choice (free).
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(240000);
const LAT = 17.44; const LNG = 78.39;
let app; let worker; let pro;

beforeAll(async () => {
  await startMongo();
  await require('../src/modules/onboarding/run-catalog-az').seedCatalogAZ();
  app = require('../src/app')();
  const Worker = require('../src/modules/worker/worker.model');
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
  worker = await Worker.create({ phone: '9000000981', name: 'Ravi Kumar', kyc: { status: 'approved' }, isOnline: true, currentLocation: { type: 'Point', coordinates: [LNG, LAT] } });
  await ProviderEnrolment.create({ providerKind: 'individual', workerId: worker._id, domainCode: 'home_daily_help', lineCode: 'daily_cleaning', status: 'approved' });
  await ProviderServiceArea.create({ workerId: worker._id, cityCode: 'hyderabad', center: { type: 'Point', coordinates: [LNG, LAT] }, radiusKm: 10, serviceModes: ['doorstep'] });
  pro = { Authorization: `Bearer ${signAccessToken({ sub: String(worker._id), role: 'worker' })}` };
  await request(app).post('/api/repair/provider/menu/samples').set(pro).send({ vertical: 'daily_cleaning' });
  await require('../src/modules/worker/presence').markLive(worker._id);
});
afterAll(stopMongo);

const inspectors = () => require('../src/modules/repair/services/matching.service').findInspectors({ vertical: 'daily_cleaning', lat: LAT, lng: LNG, includeOffline: true });

test('no fee chosen: told to set it, shown as not set, and no inspection visits', async () => {
  const status = await request(app).get('/api/provider/onboarding/status').set(pro);
  expect(status.body.nextStep).toMatchObject({ code: 'SET_INSPECTION_FEE', vertical: 'daily_cleaning' });
  expect((await request(app).get('/api/repair/provider/inspection-fee').set(pro).query({ vertical: 'daily_cleaning' })).body).toMatchObject({ feePaise: 0, set: false });
  expect((await inspectors()).map((p) => String(p.workerId))).not.toContain(String(worker._id));
});

test('choosing ₹0 (a free inspection) counts: the step clears and inspection visits open', async () => {
  expect((await request(app).put('/api/repair/provider/inspection-fee').set(pro).send({ vertical: 'daily_cleaning', feePaise: 0 })).status).toBe(200);
  expect((await request(app).get('/api/repair/provider/inspection-fee').set(pro).query({ vertical: 'daily_cleaning' })).body).toMatchObject({ feePaise: 0, set: true });
  const status = await request(app).get('/api/provider/onboarding/status').set(pro);
  expect(status.body.nextStep.code).not.toBe('SET_INSPECTION_FEE');
  expect((await inspectors()).map((p) => String(p.workerId))).toContain(String(worker._id));
});
