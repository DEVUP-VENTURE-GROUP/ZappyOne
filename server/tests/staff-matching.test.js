// ZappyOne staff on duty are offered for fixed-price services they do (staffDoes lines) without a service area or capability row, at the ZappyOne price; partners still need theirs.
require('./helpers');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { run } = require('../src/modules/repair/seed/run-vertical-seed');
const { seedBands } = require('../src/modules/repair/seed/run-pricing-seed');
const { BIKE } = require('../src/modules/repair/seed/wash.seed');
const { ServiceLine, ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
const Worker = require('../src/modules/worker/worker.model');
const DeviceModel = require('../src/modules/service/device-model.model');
const matching = require('../src/modules/repair/services/matching.service');
const { syncAllStaff, syncWorker } = require('../src/modules/onboarding/staff-lines');

jest.setTimeout(120000);
const LAT = 17.39;
const LNG = 78.36;
let model;
let server;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGO_URI = `${server.getUri()}staffmatch`;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'table').mockImplementation(() => {});
  await run('bike_wash');
  await mongoose.connect(process.env.MONGO_URI);
  await seedBands(BIKE.PRICING, 'bike_wash');
  await ServiceLine.create({ code: 'bike_wash', name: 'Bike Wash', domainCode: 'vehicles', repairVertical: 'bike_wash', status: 'live', staffDoes: true });
  model = await DeviceModel.findOne({ brandCode: 'bw_scooter' }).lean();
});
afterAll(async () => { await mongoose.disconnect(); await server.stop(); });

const near = { type: 'Point', coordinates: [LNG + 0.01, LAT] };
const find = () => matching.findProviders({ vertical: 'bike_wash', repairCode: 'bw_quick', brandCode: 'bw_scooter', modelCode: model.code, serviceMode: 'doorstep', lat: LAT, lng: LNG });

test('an online staff member nearby is offered at the ZappyOne price; a partner without a service area is not', async () => {
  const kausar = await Worker.create({ name: 'Kausar', phone: '9811100001', isOnline: true, lastSeenAt: new Date(), kyc: { status: 'approved' }, employment: { type: 'staff' }, currentLocation: near });
  await Worker.create({ name: 'Partner', phone: '9811100002', isOnline: true, lastSeenAt: new Date(), kyc: { status: 'approved' }, currentLocation: near });
  const r = await syncAllStaff();
  expect(r.approved).toBe(1);
  const out = await find();
  expect(out.providers.map((p) => p.name)).toEqual(['Kausar']);
  expect(out.providers[0].totalPaise).toBe(9900);
  expect(String(out.providers[0].workerId)).toBe(String(kausar._id));
});

test('leaving staff removes only the staff approval, never a partner enrolment of their own', async () => {
  const w = await Worker.findOne({ name: 'Kausar' });
  await Worker.updateOne({ _id: w._id }, { $set: { 'employment.type': 'partner' } });
  await syncWorker(w._id);
  expect(await ProviderEnrolment.countDocuments({ workerId: w._id, lineCode: 'bike_wash' })).toBe(0);
  const partner = await Worker.findOne({ name: 'Partner' });
  await ProviderEnrolment.create({ workerId: partner._id, providerKind: 'individual', lineCode: 'bike_wash', domainCode: 'vehicles', status: 'approved' });
  await syncAllStaff();
  expect(await ProviderEnrolment.countDocuments({ workerId: partner._id, lineCode: 'bike_wash' })).toBe(1);
});

test('the customer sees one ZappyOne pro option, never a named staff member, and partners stay listed', () => {
  const { poolStaff } = matching;
  const kausar = { workerId: 'k', name: 'Kausar', staff: true, arrivalMinutes: 6, totalPaise: 9900, price: { totalPaise: 9900 } };
  const ravi = { workerId: 'r', name: 'Ravi', staff: true, arrivalMinutes: 4, totalPaise: 9900, price: { totalPaise: 9900 } };
  const shop = { shopId: 's', name: 'Shine Wash', totalPaise: 12900 };
  const out = poolStaff({ recommended: kausar, providers: [kausar, shop, ravi] });
  expect(out.providers.map((p) => p.name)).toEqual(['ZappyOne pro', 'Shine Wash']);
  expect(out.recommended).toMatchObject({ zappyPool: true, workerId: null, shopId: null, staffCount: 2, arrivalMinutes: 4, totalPaise: 9900 });
  expect(poolStaff({ recommended: shop, providers: [shop] }).providers).toEqual([shop]);
  const busyOnly = poolStaff({ recommended: null, providers: [{ ...kausar, busy: true, availableInMinutes: 25 }] });
  expect(busyOnly.providers[0]).toMatchObject({ zappyPool: true, busy: true, staffCount: 1 });
});

describe('staff are rung one at a time, fairest first, and never given a job without Accept', () => {
  const fast = require('../src/modules/jobs/fast-assign');
  const { RepairBooking } = require('../src/modules/repair/models/booking.model');
  const events = require('../src/modules/repair/services/events.service');

  test('ring the first, wait, then ring the second; nobody takes it without Accept', async () => {
    const a = { kind: 'worker', id: 'a', staff: true };
    const b = { kind: 'worker', id: 'b', staff: true };
    jest.spyOn(fast, 'autoAcceptCandidates').mockResolvedValue([a, b]);
    const offer = jest.spyOn(events, 'announceOffer').mockImplementation(() => {});
    const doc = await RepairBooking.collection.insertOne({ status: 'CONFIRMED', shopId: null, workerId: null, userId: null, matching: {} });
    const get = () => RepairBooking.findById(doc.insertedId).lean();

    expect((await fast.ringNextStaff('repair', await get(), 5)).id).toBe('a');
    let d = await get();
    expect(d.matching.offeredTo).toEqual(['worker:a']);
    expect(fast.staffDeciding(d)).toBe(true);
    expect(fast.staffDeciding(d, Date.now() + 11000)).toBe(false);
    expect((await fast.ringNextStaff('repair', d, 5)).id).toBe('b');
    d = await get();
    expect(d.matching.staffTried).toEqual(['a', 'b']);
    expect(await fast.ringNextStaff('repair', d, 5)).toBeNull();
    expect(offer).toHaveBeenCalledTimes(2);
    expect(d.workerId).toBeNull();
    jest.restoreAllMocks();
  });
});
