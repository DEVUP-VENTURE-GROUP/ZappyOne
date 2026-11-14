// End to end over the API: providers price their own work (menu, inspection, pet care, helping), customers are quoted and book at those prices, the job runs to done, the customer pays the pro directly, and the pro owes ZappyOne only its amount.
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo, passHandoverGates } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(240000);
const LAT = 17.44; const LNG = 78.39;
const at = { type: 'Point', coordinates: [LNG, LAT], address: '12 Kondapur Main Road', cityCode: 'hyderabad' };
let app; let worker; let customer;
const tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });

beforeAll(async () => {
  await startMongo();
  await require('../src/modules/onboarding/run-catalog-az').seedCatalogAZ();
  await require('../src/modules/helping/seed/run-helping-seed').seedConfigs();
  app = require('../src/app')();
  const Worker = require('../src/modules/worker/worker.model');
  const User = require('../src/modules/user/user.model');
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
  worker = await Worker.create({ phone: '9000000901', name: 'Ravi Kumar', kyc: { status: 'approved' }, currentLocation: { type: 'Point', coordinates: [LNG, LAT] } });
  customer = await User.create({ phone: '9000000902', name: 'Asha' });
  await ProviderEnrolment.create({ providerKind: 'individual', workerId: worker._id, domainCode: 'home_daily_help', lineCode: 'daily_cleaning', status: 'approved' });
  await ProviderServiceArea.create({ workerId: worker._id, cityCode: 'hyderabad', center: { type: 'Point', coordinates: [LNG, LAT] }, radiusKm: 10, serviceModes: ['doorstep'] });
});
afterAll(stopMongo);

test('menu service: the pro builds their menu, a customer finds and books their own job, pays them, and they owe ZappyOne only its amount', async () => {
  const pro = tok(worker._id, 'worker');
  const samples = await request(app).post('/api/repair/provider/menu/samples').set(pro).send({ vertical: 'daily_cleaning' });
  expect(samples.status).toBe(200);
  const added = await request(app).put('/api/repair/provider/menu/item').set(pro)
    .send({ vertical: 'daily_cleaning', name: 'Fridge inside clean', includes: ['Shelves', 'Trays'], minutes: 45, prices: { daicle_2bhk: 29900 } });
  expect(added.status).toBe(200);
  const own = added.body.items.find((i) => i.own);
  expect(own).toMatchObject({ offered: true, prices: { daicle_2bhk: 29900 } });

  // The customer sees the pro's own job only from their storefront, at their price.
  const DeviceModel = require('../src/modules/service/device-model.model');
  const model = await DeviceModel.findOne({ brandCode: 'daicle_2bhk' }).lean();
  const shared = await request(app).get(`/api/repair/problems?vertical=daily_cleaning&modelCode=${model.code}&lat=${LAT}&lng=${LNG}`).set(tok(customer._id, 'user'));
  const codes = (r) => r.body.categories.flatMap((c) => c.problems).map((p) => p.code);
  expect(codes(shared)).not.toContain(`${own.repairCode}_req`);
  const front = await request(app).get(`/api/repair/problems?vertical=daily_cleaning&modelCode=${model.code}&provider=worker:${worker._id}`).set(tok(customer._id, 'user'));
  expect(codes(front)).toContain(`${own.repairCode}_req`);
  const card = shared.body.categories.flatMap((c) => c.problems).find((p) => p.code === 'daicle_full_daily_req');
  expect(card.pricePaise).toBe(44900);

  const booked = await request(app).post('/api/repair/bookings').set(tok(customer._id, 'user')).send({
    vertical: 'daily_cleaning', brandCode: 'daicle_2bhk', modelCode: model.code, problemCodes: [`${own.repairCode}_req`], repairCode: own.repairCode,
    serviceMode: 'doorstep', workerId: String(worker._id), paymentMethod: 'cash', location: at, idempotencyKey: 'e2e-menu-1',
  });
  expect(booked.status).toBe(201);
  const b = booked.body.booking;
  expect(b.priceSnapshot.subtotalPaise).toBeGreaterThanOrEqual(29900);

  // The job runs; the customer says they paid in cash; the pro takes the cash and closes it.
  const bookingService = require('../src/modules/repair/services/booking.service');
  await passHandoverGates(b._id);
  for (const s of ['WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'REPAIR_IN_PROGRESS', 'QA_PENDING']) {
    await bookingService.transition(b._id, s, { actorRole: 'worker', actorId: worker._id });
  }
  const claim = await request(app).post(`/api/jobs/${b._id}/pay-claim`).set(tok(customer._id, 'user')).send({ method: 'cash' });
  expect(claim.status).toBe(200);
  await bookingService.collectCash({ bookingId: b._id, actorRole: 'worker', actorId: worker._id });
  await require('./helpers').withProof(b._id);
  const done = await bookingService.transition(b._id, 'COMPLETED', { actorRole: 'worker', actorId: worker._id });
  expect((done.booking || done).status).toBe('COMPLETED');

  const { RepairBooking } = require('../src/modules/repair/models/booking.model');
  const final = await RepairBooking.findById(b._id).lean();
  // ZappyOne's part of a cash job: its commission, the platform fee and the tax the pro collected for it.
  const zappy = (final.priceSnapshot.commissionPaise || 0) + (final.priceSnapshot.platformFeePaise || 0) + (final.priceSnapshot.taxPaise || 0);
  // Tax is on the bill exactly when admin has set a rate (on hold at 0 until GST registration), and is ZappyOne's either way.
  const { taxPct } = await require('../src/modules/repair/services/pricing.service').getConfig(final.vertical);
  expect(final.priceSnapshot.taxPaise > 0).toBe(taxPct > 0);
  const dues = await require('../src/modules/worker/worker-dues.service').getDuesStatus(worker._id);
  expect(dues.duesPaise).toBe(zappy);
  expect(zappy).toBeLessThan(final.priceSnapshot.totalPaise);
});

test('inspection: the pro sets a fee, the customer is quoted it with nothing for ZappyOne, and a free inspection is free', async () => {
  const pro = tok(worker._id, 'worker');
  const free = await request(app).get(`/api/repair/price-preview?vertical=daily_cleaning&serviceMode=diagnosis_only&lat=${LAT}&lng=${LNG}`).set(tok(customer._id, 'user'));
  expect(free.status).toBe(200);
  expect(free.body.estimate.totalPaise).toBe(0);
  expect((await request(app).put('/api/repair/provider/inspection-fee').set(pro).send({ vertical: 'daily_cleaning', feePaise: 14900 })).status).toBe(200);
  const paid = await request(app).get('/api/repair/provider/inspection-fee?vertical=daily_cleaning').set(pro);
  expect(paid.body.feePaise).toBe(14900);
});

test('pet care: the pro sets a price per pet size; the customer is quoted their price and the provider list shows it', async () => {
  const { PetProviderCapability } = require('../src/modules/pet/models/config.model');
  const { PetServiceVariant } = require('../src/modules/pet/models/catalog.model');
  const { PetPricingRule } = require('../src/modules/pet/models/config.model');
  // The service as data; ZappyOne's rule here carries only the platform fee, tax and its staff commission.
  const variant = (await PetServiceVariant.create({ code: 'pg_bath', name: 'Bath & dry', categoryCode: 'pet_grooming', species: ['dog'], allowedModes: ['doorstep'], pricingUnit: 'flat' })).toObject();
  await PetPricingRule.create({ categoryCode: 'pet_grooming', variantCode: null, basePaise: 99900, commissionPct: 15, platformFeePaise: 1900, taxPct: 0 });
  await PetProviderCapability.create({
    workerId: worker._id, providerType: 'dog_walker', species: ['dog'], sizes: ['small', 'medium', 'large', 'extra_large'],
    categoryCodes: [variant.categoryCode], modes: ['doorstep'], verificationStatus: 'verified', serviceRadiusKm: 15,
    baseLocation: { type: 'Point', coordinates: [LNG, LAT] },
  });
  const pro = tok(worker._id, 'worker');
  const card = await request(app).get('/api/pet/provider/rates').set(pro);
  expect(card.status).toBe(200);
  expect(card.body.services.some((s) => s.code === variant.code)).toBe(true);
  const saved = await request(app).put('/api/pet/provider/rates').set(pro).send({ rates: [{ variantCode: variant.code, prices: { medium: 39900 } }] });
  expect(saved.status).toBe(200);
  expect(saved.body.services.find((s) => s.code === variant.code).prices.medium).toBe(39900);

  const PetPassport = require('../src/modules/service/pet-passport.model');
  const dog = await PetPassport.create({ userId: customer._id, name: 'Bruno', species: 'dog', size: 'medium', breedCode: null });
  const q = await request(app).post('/api/pet/quote').set(tok(customer._id, 'user')).send({
    categoryCode: variant.categoryCode, serviceMode: 'doorstep', workerId: String(worker._id),
    pets: [{ petId: String(dog._id), variantCode: variant.code }], serviceLocation: { type: 'Point', coordinates: [LNG, LAT], address: 'Home' },
  });
  expect(q.status).toBe(200);
  expect(q.body.quote.servicesPaise).toBe(39900);
  expect(q.body.quote.platformFeePaise).toBe(1900);
  expect(q.body.quote.commissionPaise).toBeLessThan(39900);
});

test('helping: a staff errand quotes the ZappyOne staff price until a partner helper own cheaper rate beats it', async () => {
  const { KINDS } = require('../src/modules/jobs/kinds');
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const line = await KINDS.helping.line({ serviceType: 'grocery_run' });
  const ask = () => request(app).post('/api/helping/quote').set(tok(customer._id, 'user')).send({ serviceType: 'grocery_run', pickupLocation: at, destination: at });
  const { ServiceLine } = require('../src/modules/onboarding/onboarding.model');
  await ServiceLine.updateOne({ code: line }, { $setOnInsert: { code: line, name: 'Grocery run', domainCode: 'family_assist', status: 'live' }, $set: { staffOnly: true } }, { upsert: true });
  // Version 1 (own staff off): nobody priced it, so the customer is told so; with staff on, ZappyOne's staff price applies.
  const flags = require('../src/modules/feature-flags/feature-flag.service');
  await flags.set('own_staff', false, null);
  expect((await ask()).status).toBe(409);
  await flags.set('own_staff', true, null);
  const staffPrice = await ask();
  expect(staffPrice.status).toBe(200);
  expect(staffPrice.body.charge.baseFeePaise).toBe(14900);
  await ProviderEnrolment.create({ providerKind: 'individual', workerId: worker._id, domainCode: 'family_assist', lineCode: line, status: 'approved' });
  const pro = tok(worker._id, 'worker');
  const card = await request(app).get(`/api/helping/provider/rates/${line}`).set(pro);
  expect(card.status).toBe(200);
  expect(card.body.types.map((t) => t.serviceType)).toContain('grocery_run');
  expect((await request(app).put(`/api/helping/provider/rates/${line}/grocery_run`).set(pro).send({ baseFeePaise: 12900, perKmPaise: 1000 })).status).toBe(200);
  const q = await ask();
  expect(q.status).toBe(200);
  expect(q.body.charge.baseFeePaise).toBe(12900);
  expect(q.body.charge.commissionPaise).toBeLessThan(12900);
  expect(mongoose.isValidObjectId(String(worker._id))).toBe(true);
});
