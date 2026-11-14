// One booking through the real API with every price part on at once (distance, platform fee, tax, late-night surge, a tip on the bill): the quote, the booking, the customer's screen, what the pro is asked to collect and the receipt all say the same amount, and each part follows its rule.
const path = require('path');
const request = require('supertest');
const mongoose = require('mongoose');
const { execFileSync } = require('child_process');
const { startMongo, stopMongo, passHandoverGates } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(240000);
const PRO = { lat: 17.44, lng: 78.39 };
const HOME = { lat: 17.503, lng: 78.39 }; // about 7 km north of the pro
const door = { type: 'Point', coordinates: [HOME.lng, HOME.lat], address: '4 Kukatpally Road', cityCode: 'hyderabad' };
let app; let worker; let customer; let model;
const tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });
const km = (a, b) => {
  const R = 6371; const r = (d) => (d * Math.PI) / 180;
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

beforeAll(async () => {
  await startMongo();
  await require('../src/modules/onboarding/run-catalog-az').seedCatalogAZ();
  app = require('../src/app')();
  const Worker = require('../src/modules/worker/worker.model');
  const User = require('../src/modules/user/user.model');
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const { ProviderServiceArea, RepairConfig } = require('../src/modules/repair/models/config.model');
  worker = await Worker.create({ phone: '9000000951', name: 'Ravi Kumar', kyc: { status: 'approved' }, currentLocation: { type: 'Point', coordinates: [PRO.lng, PRO.lat] } });
  customer = await User.create({ phone: '9000000952', name: 'Abilash' });
  await ProviderEnrolment.create({ providerKind: 'individual', workerId: worker._id, domainCode: 'home_daily_help', lineCode: 'daily_cleaning', status: 'approved' });
  await ProviderServiceArea.create({ workerId: worker._id, cityCode: 'hyderabad', center: { type: 'Point', coordinates: [PRO.lng, PRO.lat] }, radiusKm: 15, serviceModes: ['doorstep'] });

  // Every part on: ₹20 to start the trip, 3 km free, ₹6 a km after; ₹10 platform fee; 18% tax.
  await RepairConfig.updateOne({ vertical: 'daily_cleaning', supersededAt: null },
    { $set: { platformFeePaise: 1000, taxPct: 18, minJobPaise: 0 } }, { upsert: true });
  require('../src/modules/repair/services/pricing.service').invalidateConfigCache();
  // The journey part of it (Economics → Travel & waiting), straight-line km and no traffic hours so the sum below holds at any time of day.
  const travelCfg = require('../src/modules/pricing/services/config.service');
  await travelCfg.updateActiveConfig({ travel: { ...travelCfg.TRAVEL_DEFAULTS, baseFeePaise: 2000, perKmPaise: 600, freeKm: 3, roadFactor: 1, maxPaise: 0, trafficHours: [] } }, new mongoose.Types.ObjectId());

  // Late night right now (the window covers this hour); no busy-area surge.
  const config = require('../src/modules/pricing/services/config.service');
  const h = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' })) % 24;
  await config.updateActiveConfig({ surgeAuto: { ...config.SURGE_DEFAULTS, __configured: true, minDemand: 1e9, nightPaise: 2000, nightStartHour: h, nightEndHour: (h + 2) % 24 } }, new mongoose.Types.ObjectId());

  const DeviceModel = require('../src/modules/service/device-model.model');
  model = await DeviceModel.findOne({ brandCode: 'daicle_2bhk' }).lean();
});
afterAll(stopMongo);

function screenTotal(data) {
  const shared = path.join(__dirname, '../../shared/src/customer').replace(/\\/g, '/');
  const hook = require('url').pathToFileURL(path.join(__dirname, 'esm-ext.mjs')).href;
  const register = `data:text/javascript,import{register}from'node:module';register(${JSON.stringify(hook)});`;
  const code = `import { KINDS } from 'file:///${shared}/jobKinds.js'; import { readFileSync } from 'node:fs';
    const job = KINDS.repair.toJob(JSON.parse(readFileSync(0, 'utf8')));
    console.log(JSON.stringify({ total: job.price.totalPaise, lines: job.price.lines }));`;
  return JSON.parse(execFileSync(process.execPath, ['--import', register, '--input-type=module', '-e', code], { input: JSON.stringify(data) }).toString());
}

test('distance, platform fee, tax, late-night and a tip: one amount from quote to receipt', async () => {
  const cust = tok(customer._id, 'user');
  const repairCode = 'daicle_full_daily';

  // 0. The pro puts the standard jobs on their menu, as every new pro does.
  // The pro is online and really there, as a pro taking jobs is.
  await require('../src/modules/worker/worker.model').updateOne({ _id: worker._id }, { $set: { isOnline: true } });
  await require('../src/modules/worker/presence').markLive(worker._id);
  const menu = await request(app).post('/api/repair/provider/menu/samples').set(tok(worker._id, 'worker')).send({ vertical: 'daily_cleaning' });
  expect(menu.status).toBe(200);

  // 1. The confirm screen's quote: the pro's bill for this address.
  const found = await request(app).get('/api/repair/providers').set(cust)
    .query({ vertical: 'daily_cleaning', repairCode, brandCode: 'daicle_2bhk', modelCode: model.code, serviceMode: 'doorstep', lat: HOME.lat, lng: HOME.lng });
  expect(found.status).toBe(200);
  const offer = (found.body.providers || found.body.items || []).find((p) => String(p.workerId) === String(worker._id));
  expect(offer).toBeTruthy();
  const bill = offer.bill || offer.price?.bill || offer;
  expect(bill.distanceKm).toBeGreaterThan(6);
  expect(Math.abs(bill.distanceKm - km(PRO, HOME))).toBeLessThan(0.2);

  // Distance: ₹20 + (km − 3) × ₹6. Tax: 18% of what is taxed. Platform fee: ₹10.
  // Charged on the exact distance; the bill shows it rounded, so allow the paise that rounding moves.
  expect(Math.abs(bill.travelPaise - (2000 + Math.round((km(PRO, HOME) - 3) * 600)))).toBeLessThanOrEqual(10);
  expect(bill.travelPaise).toBeGreaterThan(4000);
  expect(bill.platformFeePaise).toBe(1000);
  expect(bill.taxPaise).toBeGreaterThan(0);

  // 2. Late-night surge, quoted on that bill.
  const sq = await request(app).get('/api/jobs/surge-quote').set(cust).query({ kind: 'repair', vertical: 'daily_cleaning', lat: HOME.lat, lng: HOME.lng, basePaise: bill.totalPaise, serviceMode: 'doorstep' });
  expect(sq.status).toBe(200);
  expect(sq.body.lines.map((l) => [l.type, l.paise])).toEqual([['night', 2000]]);
  const quoted = bill.totalPaise + sq.body.totalPaise + 2000; // + ₹20 tip on the bill

  // 3. Book at that quote, with the tip.
  const booked = await request(app).post('/api/repair/bookings').set(cust).send({
    vertical: 'daily_cleaning', brandCode: 'daicle_2bhk', modelCode: model.code, problemCodes: [`${repairCode}_req`], repairCode,
    serviceMode: 'doorstep', workerId: String(worker._id), paymentMethod: 'cash', location: door, idempotencyKey: 'full-pricing-1',
    surgeQuoteId: sq.body.quoteId, surgeBasePaise: bill.totalPaise, tipPaise: 2000,
  });
  expect(booked.status).toBe(201);
  const id = booked.body.booking._id;
  const { RepairBooking } = require('../src/modules/repair/models/booking.model');
  const saved = await RepairBooking.findById(id).lean();
  expect(saved.priceSnapshot.travelPaise).toBe(bill.travelPaise);
  expect(saved.priceSnapshot.taxPaise).toBe(bill.taxPaise);
  expect(saved.priceSnapshot.totalPaise).toBe(bill.totalPaise);
  expect(saved.surge?.paise).toBe(2000);

  // 4. Every place that states the amount.
  const { PAYABLES } = require('../src/modules/payment/payables');
  expect(PAYABLES.repair.payable(saved).amountPaise).toBe(quoted);
  const detail = await request(app).get(`/api/repair/bookings/${id}`).set(cust);
  const screen = screenTotal(detail.body);
  expect(screen.total).toBe(quoted);
  expect(screen.lines.reduce((a, [, p]) => a + (p || 0), 0)).toBe(quoted);
  expect(screen.lines.map(([l]) => l)).toEqual(expect.arrayContaining(['Late-night fee', 'Tip for your pro']));

  await passHandoverGates(id);
  const bookingService = require('../src/modules/repair/services/booking.service');
  for (const s of ['WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'REPAIR_IN_PROGRESS', 'QA_PENDING']) await bookingService.transition(id, s, { actorRole: 'worker', actorId: worker._id });
  const opts = await request(app).get(`/api/jobs/${id}/options`).set(cust);
  expect(opts.body.payTo.amountPaise).toBe(quoted); // what the pro is asked to collect

  await bookingService.collectCash({ bookingId: id, actorRole: 'worker', actorId: worker._id });
  await require('./helpers').withProof(id);
  await bookingService.transition(id, 'COMPLETED', { actorRole: 'worker', actorId: worker._id });
  const receipt = await request(app).get(`/api/jobs/${id}/receipt?view=json`).set(cust);
  expect(receipt.status).toBe(200);
  const f = await require('../src/modules/messaging/facts').jobFacts('repair', await RepairBooking.findById(id).lean());
  expect(f.totalPaise).toBe(quoted);
  expect(receipt.body.bill.totalPaise).toBe(quoted);
  expect(receipt.body.bill.lines.reduce((a, l) => a + l.paise, 0)).toBe(quoted);
  expect(receipt.body.bill.lines.map((l) => l.label)).toEqual(expect.arrayContaining(['Taxes', 'Platform fee', 'Late-night fee']));
});
