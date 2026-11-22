// A partner's own offer on a menu job: one rule (whole rupees, never more than half off, ends on its date), set in one tap, seen the same on the menu, the store, search and the card price, frozen into a booking with the saving on the bill, and commission taken on what the customer actually pays.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(240000);
const LAT = 17.44; const LNG = 78.39;
const V = 'daily_cleaning';
const JOB = 'daicle_full_daily';
const at = { type: 'Point', coordinates: [LNG, LAT], address: '12 Kondapur Main Road', cityCode: 'hyderabad' };
let app; let worker; let other; let customer; let model; let offers;
let n = 0;
const tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });
const setOffer = (w, offer, code = JOB) => request(app).put(`/api/repair/provider/menu/item/${code}/offer`).set(tok(w._id, 'worker')).send({ vertical: V, offer });

beforeAll(async () => {
  await startMongo();
  await require('../src/modules/onboarding/run-catalog-az').seedCatalogAZ();
  app = require('../src/app')();
  offers = require('../src/modules/repair/services/offers');
  const Worker = require('../src/modules/worker/worker.model');
  const User = require('../src/modules/user/user.model');
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
  const menu = require('../src/modules/repair/services/provider-menu.service');
  const make = async (phone) => {
    const w = await Worker.create({ phone, name: `Pro ${phone}`, kyc: { status: 'approved' }, currentLocation: { type: 'Point', coordinates: [LNG, LAT] } });
    await ProviderEnrolment.create({ providerKind: 'individual', workerId: w._id, domainCode: 'home_daily_help', lineCode: V, status: 'approved' });
    await ProviderServiceArea.create({ workerId: w._id, cityCode: 'hyderabad', center: { type: 'Point', coordinates: [LNG, LAT] }, radiusKm: 10, serviceModes: ['doorstep'] });
    await menu.saveItem({ shopId: null, workerId: w._id }, V, { repairCode: JOB, includes: ['Sweep', 'Mop'], minutes: 90, photoKey: 'menu/daily.jpg', prices: { daicle_1bhk: 39900, daicle_2bhk: 49900 } }, { role: 'worker', id: String(w._id) });
    return w;
  };
  worker = await make('9000000911');
  other = await make('9000000912');
  customer = await User.create({ phone: '9000000913', name: 'Asha' });
  model = await require('../src/modules/service/device-model.model').findOne({ brandCode: 'daicle_2bhk' }).lean();
});
afterAll(stopMongo);

describe('the offer rule', () => {
  test.each([
    ['10% of ₹499 is ₹50 (whole rupees)', 49900, { kind: 'pct', value: 10 }, 5000],
    ['₹50 off', 49900, { kind: 'flat', value: 5000 }, 5000],
    ['never more than half, however big', 49900, { kind: 'flat', value: 100000 }, 24900],
    ['50% of ₹99 rounds down to keep it under half', 9900, { kind: 'pct', value: 50 }, 4900],
    ['an ended offer takes nothing', 49900, { kind: 'pct', value: 20, endsAt: new Date(Date.now() - 1000) }, 0],
    ['no offer takes nothing', 49900, null, 0],
  ])('%s', (_name, price, offer, off) => {
    expect(offers.offPaise(price, offer)).toBe(off);
  });
  test.each([
    ['3%', { kind: 'pct', value: 3 }],
    ['60%', { kind: 'pct', value: 60 }],
    ['₹5 off', { kind: 'flat', value: 500 }],
    ['₹10.50 off', { kind: 'flat', value: 1050 }],
    ['an end date in the past', { kind: 'pct', value: 10, endsAt: new Date(Date.now() - 60000) }],
    ['an end date 100 days away', { kind: 'pct', value: 10, endsAt: new Date(Date.now() + 100 * 86400000) }],
    ['an unknown kind', { kind: 'bogo', value: 1 }],
  ])('%s is refused', (_name, input) => {
    expect(() => offers.cleanOffer(input)).toThrow(expect.objectContaining({ code: 'BAD_OFFER' }));
  });
});

describe('setting an offer', () => {
  test('one tap sets it and the menu shows it with its label', async () => {
    const r = await setOffer(worker, { kind: 'pct', value: 10 });
    expect(r.status).toBe(200);
    expect(r.body.items.find((i) => i.repairCode === JOB).offer).toMatchObject({ kind: 'pct', value: 10, label: '10% off', prices: { daicle_1bhk: 35900, daicle_2bhk: 44900 } });
  });
  test('taking it off clears it', async () => {
    await setOffer(other, { kind: 'flat', value: 5000 });
    const r = await setOffer(other, null);
    expect(r.body.items.find((i) => i.repairCode === JOB).offer).toBeNull();
  });
  test.each([
    ['a job not on their menu', () => setOffer(worker, { kind: 'pct', value: 10 }, 'no_such_job'), 404],
    ['a bad offer', () => setOffer(worker, { kind: 'pct', value: 80 }), 400],
    ['no offer field at all', () => request(app).put(`/api/repair/provider/menu/item/${JOB}/offer`).set(tok(worker._id, 'worker')).send({ vertical: V }), 400],
    ['a customer', () => request(app).put(`/api/repair/provider/menu/item/${JOB}/offer`).set(tok(customer._id, 'user')).send({ vertical: V, offer: { kind: 'pct', value: 10 } }), 403],
  ])('%s is refused', async (_name, call, status) => {
    expect((await call()).status).toBe(status);
  });
});

describe('customers see the same offer price everywhere', () => {
  beforeAll(async () => { await setOffer(worker, { kind: 'pct', value: 10 }); await setOffer(other, null); });

  test('the store menu shows the offer price with the old one', async () => {
    const r = await request(app).get(`/api/repair/storefronts/worker/${worker._id}/menu`).query({ vertical: V });
    const item = r.body.items.find((i) => i.repairCode === JOB);
    expect(item.offerLabel).toBe('10% off');
    expect(item.options.find((o) => o.brandCode === 'daicle_2bhk')).toMatchObject({ totalPaise: 44900, wasPaise: 49900 });
    expect(item.options.find((o) => o.brandCode === 'daicle_1bhk')).toMatchObject({ totalPaise: 35900, wasPaise: 39900 });
  });
  test('the store card price and badge use the offer', async () => {
    const r = await request(app).get('/api/repair/storefronts').query({ vertical: V, lat: LAT, lng: LNG });
    const card = r.body.items.find((i) => i.id === String(worker._id));
    expect(card).toMatchObject({ fromPaise: 35900, offerLabel: '10% off' });
    expect(r.body.items.find((i) => i.id === String(other._id)).offerLabel || null).toBeNull();
  });
  test('the lowest price near the customer is the offer price', async () => {
    const map = await require('../src/modules/repair/services/pricing.service').nearbyPriceMap({ vertical: V, brandCode: 'daicle_2bhk', modelCode: model.code }, [JOB], { lat: LAT, lng: LNG });
    expect(map.get(JOB)).toBe(44900);
  });
});

describe('booking', () => {
  const book = (w) => request(app).post('/api/repair/bookings').set(tok(customer._id, 'user')).send({
    vertical: V, brandCode: 'daicle_2bhk', modelCode: model.code, problemCodes: [`${JOB}_req`], repairCode: JOB,
    serviceMode: 'doorstep', workerId: String(w._id), paymentMethod: 'cash', location: at, idempotencyKey: `offer-${++n}`,
  });

  test('freezes the offer price, shows the saving, and takes commission on what is paid', async () => {
    await setOffer(worker, { kind: 'flat', value: 5000 });
    const r = await book(worker);
    expect(r.status).toBe(201);
    const snap = r.body.booking.priceSnapshot;
    expect(snap).toMatchObject({ offerSavedPaise: 5000, offerLabel: '₹50 off', commissionBasePaise: 44900 });
    const { getConfig } = require('../src/modules/repair/services/pricing.service');
    const { commissionPct } = await getConfig(V);
    expect(snap.commissionPaise).toBe(Math.round((44900 * commissionPct) / 100));
  });
  test('without an offer the bill has no saving', async () => {
    const r = await book(other);
    expect(r.body.booking.priceSnapshot).toMatchObject({ offerSavedPaise: 0, commissionBasePaise: 49900 });
  });
  test('an offer that ends later never changes a booking already made, and new ones go back to full price', async () => {
    await setOffer(worker, { kind: 'pct', value: 20, endsAt: new Date(Date.now() + 2000) });
    const first = (await book(worker)).body.booking;
    expect(first.priceSnapshot.offerSavedPaise).toBe(10000);
    await new Promise((res) => setTimeout(res, 2200));
    const later = (await book(worker)).body.booking;
    expect(later.priceSnapshot.offerSavedPaise).toBe(0);
    const { RepairBooking } = require('../src/modules/repair/models/booking.model');
    expect((await RepairBooking.findById(first._id).lean()).priceSnapshot.offerSavedPaise).toBe(10000);
  });
  test('a customer cannot send their own discount or offer', async () => {
    await setOffer(other, null);
    const r = await request(app).post('/api/repair/bookings').set(tok(customer._id, 'user')).send({
      vertical: V, brandCode: 'daicle_2bhk', modelCode: model.code, problemCodes: [`${JOB}_req`], repairCode: JOB,
      serviceMode: 'doorstep', workerId: String(other._id), paymentMethod: 'cash', location: at, idempotencyKey: `offer-${++n}`,
      offerSavedPaise: 40000, discountPaise: 40000, priceSnapshot: { totalPaise: 100 },
    });
    if (r.status === 201) expect(r.body.booking.priceSnapshot).toMatchObject({ offerSavedPaise: 0, discountPaise: 0, commissionBasePaise: 49900 });
    else expect(r.status).toBe(400);
  });
});

test('another partner\'s offer never touches this partner\'s price', async () => {
  await setOffer(worker, { kind: 'pct', value: 30 });
  await setOffer(other, null);
  const price = await require('../src/modules/repair/services/pricing.service').resolveProviderPrice({ vertical: V, repairCode: JOB, brandCode: 'daicle_2bhk', modelCode: model.code }, { workerId: other._id });
  expect(price).toMatchObject({ totalPaise: 49900, offerWasPaise: null });
});
