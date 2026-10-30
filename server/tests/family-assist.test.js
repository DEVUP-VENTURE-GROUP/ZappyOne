// Family Assist: eight staff-only services, priced from config, every staff member approved and no partner, Family Assist third on home.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { launch } = require('../scripts/launch-family-assist');
const { ServiceDomain, ServiceLine, ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
const { HelpingConfig, FAMILY_ASSIST_TYPES, startsAtCustomer } = require('../src/modules/helping/models/config.model');
const pricingService = require('../src/modules/helping/services/pricing.service');
const taskService = require('../src/modules/helping/services/task.service');
const { approvedLines, assertApproved } = require('../src/modules/onboarding/eligibility');
const { lineOf, KINDS } = require('../src/modules/jobs/kinds');
const { syncWorker } = require('../src/modules/onboarding/staff-lines');
const onboarding = require('../src/modules/onboarding/onboarding.service');
const Worker = require('../src/modules/worker/worker.model');

jest.setTimeout(60000);

const HOME = { type: 'Point', coordinates: [78.4867, 17.3850], address: 'Flat 4, Narsingi' };
const CLINIC = { type: 'Point', coordinates: [78.5100, 17.3900], address: 'City Clinic' };
const userId = new mongoose.Types.ObjectId();
let staff;
let partner;

beforeAll(async () => {
  await startMongo();
  await ServiceDomain.create([
    { code: 'vehicles', name: 'Vehicles', displayOrder: 0 },
    { code: 'home_services', name: 'Home Services', displayOrder: 3 },
    { code: 'family_assist', name: 'Family Assist', displayOrder: 4 },
    { code: 'helping_services', name: 'Helping Services', displayOrder: 5 },
  ]);
  await ServiceLine.create({ code: 'elder_care', name: 'Elder Care', domainCode: 'family_assist', providerKinds: ['individual'] });
  staff = await Worker.create({ name: 'Ravi', phone: '9000000001', employment: { type: 'staff' } });
  partner = await Worker.create({ name: 'Sita', phone: '9000000002' });
  await launch();
  pricingService.invalidateConfigCache();
});
afterAll(stopMongo);

test('all eight services are live, staff-only, and the coming-soon lines are hidden', async () => {
  const lines = await ServiceLine.find({ domainCode: 'family_assist', isActive: true }).lean();
  expect(lines).toHaveLength(8);
  expect(lines.every((l) => l.status === 'live' && l.staffOnly && l.customerPath.startsWith('/helping/'))).toBe(true);
  expect(await ServiceLine.findOne({ code: 'elder_care' }).lean()).toMatchObject({ isActive: false });
});

test('Family Assist is the third section', async () => {
  const order = (await ServiceDomain.find().sort({ displayOrder: 1 }).lean()).map((d) => d.code);
  expect(order.indexOf('family_assist')).toBe(2);
});

test('every service is priced from config at the listed fee', async () => {
  const fees = Object.fromEntries((await HelpingConfig.find().lean()).map((c) => [c.serviceType, c.baseFeePaise / 100]));
  expect(fees).toEqual({ grocery_run: 149, medicine: 99, parcel_drop: 99, doctor_escort: 399, queue_errand: 199, elder_checkin: 149, party_helper: 599, puja_help: 399 });
  const q = await pricingService.quote({ serviceType: 'doctor_escort', pickupLocation: HOME, destination: CLINIC });
  expect(q.baseFeePaise).toBe(39900);
  expect(q.distanceFeePaise).toBe(0);
  expect(q.serviceChargePaise).toBe(39900 + 1000);
  // Salaried staff: nothing of the fee is a per-job earning.
  expect(q.workerEarningPaise).toBe(0);
  expect(q.commissionPaise).toBe(39900);
});

test('a second launch keeps a price admin changed', async () => {
  await HelpingConfig.updateOne({ serviceType: 'party_helper' }, { $set: { baseFeePaise: 69900 } });
  await launch();
  expect((await HelpingConfig.findOne({ serviceType: 'party_helper' }).lean()).baseFeePaise).toBe(69900);
});

test('staff are approved for every service, partners for none and cannot apply', async () => {
  const mine = await approvedLines({ role: 'worker', id: staff._id });
  for (const type of FAMILY_ASSIST_TYPES) {
    const line = await lineOf('helping', { serviceType: type });
    expect(mine.has(line)).toBe(true);
    await expect(assertApproved({ role: 'worker', id: partner._id }, line)).rejects.toMatchObject({ code: 'NOT_APPROVED_FOR_SERVICE' });
  }
  await expect(onboarding.enrol({ owner: { workerId: partner._id, providerKind: 'individual' }, providerKind: 'individual', lineCode: 'fa_party_helper' }))
    .rejects.toMatchObject({ code: 'STAFF_ONLY_LINE' });
  expect((await onboarding.listLines({ domainCode: 'family_assist' })).length).toBe(0);
});

test('a worker made staff gains the services, and loses them on leaving', async () => {
  await Worker.updateOne({ _id: partner._id }, { $set: { 'employment.type': 'staff' } });
  await syncWorker(partner._id);
  expect((await approvedLines({ role: 'worker', id: partner._id })).has('fa_elder_checkin')).toBe(true);
  await Worker.updateOne({ _id: partner._id }, { $set: { 'employment.type': 'partner' } });
  await syncWorker(partner._id);
  expect(await ProviderEnrolment.countDocuments({ workerId: partner._id })).toBe(0);
});

test('at-home help takes the customer code when work starts; grocery at handover', () => {
  const code = KINDS.helping.startCode.required;
  expect(code({ serviceType: 'elder_checkin' }, 'TASK_STARTED')).toBe(true);
  expect(code({ serviceType: 'elder_checkin' }, 'COMPLETED')).toBe(false);
  expect(code({ serviceType: 'grocery_run' }, 'COMPLETED')).toBe(true);
  expect(startsAtCustomer('grocery_run')).toBe(false);
  expect(KINDS.helping.trip.heading({ serviceType: 'party_helper', status: 'RETURNING', pickupLocation: HOME })).toBeNull();
});

test('a booking is priced on the server and carries its listed duration', async () => {
  const { task } = await taskService.createTask({
    userId, serviceType: 'party_helper', title: 'Party helper', instructions: 'Birthday, 20 guests', pickupLocation: HOME,
    scheduledAt: new Date(Date.now() + 86400000),
  });
  expect(task.estimatedDurationMinutes).toBe(180);
  expect(task.charge.baseFeePaise).toBe(69900);
  const grocery = await taskService.createTask({
    userId, serviceType: 'grocery_run', pickupLocation: HOME, destination: HOME,
    items: [{ name: 'Atta 5kg', quantity: 1, maxApprovedPricePaise: 30000 }],
  });
  expect(grocery.task.itemMoney.budgetPaise).toBe(30000);
  await expect(taskService.createTask({
    userId, serviceType: 'grocery_run', pickupLocation: HOME, items: [{ name: 'Whisky', description: 'alcohol', quantity: 1, maxApprovedPricePaise: 100000 }],
  })).rejects.toMatchObject({ code: 'RESTRICTED_ITEM' });
});

test('the catalog carries each form, and an app too old to draw it does not see the service', async () => {
  const request = require('supertest');
  const app = require('../src/app')();
  const codes = (res) => res.body.domains.flatMap((d) => d.services).filter((s) => s.code.startsWith('fa_'));
  const web = await request(app).get('/api/provider/onboarding/catalog');
  expect(codes(web)).toHaveLength(8);
  expect(codes(web).find((s) => s.code === 'fa_doctor_escort').form).toMatchObject({ type: 'doctor_escort', when: true, endRequired: true });
  const oldApp = await request(app).get('/api/provider/onboarding/catalog').set('X-Client-Type', 'mobile');
  expect(codes(oldApp)).toHaveLength(0);
  const newApp = await request(app).get('/api/provider/onboarding/catalog').set('X-Client-Type', 'mobile').set('X-UI-Level', '2');
  expect(codes(newApp)).toHaveLength(8);
});
