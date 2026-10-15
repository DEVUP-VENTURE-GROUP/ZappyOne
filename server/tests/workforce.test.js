/**
 * ZappyOne's own staff (workforce/):
 *   - a staff member books a hub shift, up to what the hub needs
 *   - check-in only at the meeting point, with a selfie, near the shift time
 *   - on duty, they are first in line for a job nearby (fast-assign)
 *   - their jobs' money is ZappyOne's: online all revenue, cash all owed
 *   - cash owed never blocks them from work
 *   - salary for the month: monthly salary × paid days ÷ working days
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const Worker = require('../src/modules/worker/worker.model');
const Hub = require('../src/modules/workforce/hub.model');
const Shift = require('../src/modules/workforce/shift.model');
const Leave = require('../src/modules/workforce/leave.model');
const shifts = require('../src/modules/workforce/shifts.service');
const payroll = require('../src/modules/workforce/payroll.service');
const staff = require('../src/modules/workforce/staff');
const { PetBooking } = require('../src/modules/pet/models/booking.model');
const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
const Wallet = require('../src/modules/wallet/wallet.model');

jest.setTimeout(90000);

const HUB = { lat: 17.4483, lng: 78.3915 };
let hub; let n = 0;
const today = () => shifts.istDay();
const hhmm = (d) => new Date(d.getTime() + 330 * 60000).toISOString().slice(11, 16);

async function person({ isStaff = true, salary = 1500000 } = {}) {
  n += 1;
  return Worker.create({
    name: `Staff ${n}`, phone: `90000006${String(n).padStart(2, '0')}`, kyc: { status: 'approved' },
    isOnline: true, lastSeenAt: new Date(), currentLocation: { type: 'Point', coordinates: [HUB.lng, HUB.lat] },
    employment: isStaff ? { type: 'staff', hubId: hub._id, salaryPaise: salary } : { type: 'partner' },
  });
}

beforeAll(async () => {
  await startMongo();
  await Promise.all([PetBooking.init(), Worker.init(), Hub.init()]);
  // A shift running now, so check-in can be tested at any hour.
  const start = new Date(Date.now() - 30 * 60000); const end = new Date(Date.now() + 4 * 3600000);
  hub = await Hub.create({
    name: 'Madhapur', city: 'Hyderabad', radiusM: 200, serviceKm: 8,
    meetingPoint: { address: 'Madhapur metro', location: { type: 'Point', coordinates: [HUB.lng, HUB.lat] } },
    shifts: [{ code: 'now', label: 'Now', start: hhmm(start), end: hhmm(end), need: 2 }],
  });
});
afterAll(stopMongo);

describe('shifts', () => {
  test('book up to the number the hub needs, then it is full', async () => {
    const [a, b, c] = [await person(), await person(), await person()];
    await shifts.book({ workerId: a._id, day: today(), code: 'now' });
    await shifts.book({ workerId: b._id, day: today(), code: 'now' });
    await expect(shifts.book({ workerId: c._id, day: today(), code: 'now' })).rejects.toMatchObject({ code: 'FULL' });
    // Admin can still put someone on it.
    await expect(shifts.book({ workerId: c._id, day: today(), code: 'now', by: 'admin' })).resolves.toMatchObject({ status: 'booked' });
  });

  test('a partner cannot book staff shifts', async () => {
    const p = await person({ isStaff: false });
    await expect(shifts.book({ workerId: p._id, day: today(), code: 'now' })).rejects.toMatchObject({ code: 'NOT_STAFF' });
  });

  test('check-in only at the meeting point and with a selfie', async () => {
    await Shift.deleteMany({});
    const s = await person();
    await shifts.book({ workerId: s._id, day: today(), code: 'now' });
    await expect(shifts.checkIn({ workerId: s._id, lat: HUB.lat, lng: HUB.lng, selfieKey: '' })).rejects.toMatchObject({ code: 'SELFIE' });
    await expect(shifts.checkIn({ workerId: s._id, lat: HUB.lat + 0.02, lng: HUB.lng, selfieKey: 'staff-checkin/x.jpg' })).rejects.toMatchObject({ code: 'TOO_FAR' });
    const on = await shifts.checkIn({ workerId: s._id, lat: HUB.lat + 0.0005, lng: HUB.lng, selfieKey: 'staff-checkin/x.jpg' });
    expect(on.status).toBe('checked_in');
    expect((await staff.onDutyIds()).has(String(s._id))).toBe(true);
    const off = await shifts.checkOut({ workerId: s._id });
    expect(off.status).toBe('done');
  });
});

describe('dispatch', () => {
  test('staff on duty are first in line, even without auto-accept', async () => {
    await Shift.deleteMany({});
    const partner = await person({ isStaff: false });
    await Worker.updateOne({ _id: partner._id }, { $set: { 'autoAccept.enabled': true, currentLocation: { type: 'Point', coordinates: [HUB.lng, HUB.lat + 0.001] } } });
    const s = await person();
    await Worker.updateOne({ _id: s._id }, { $set: { currentLocation: { type: 'Point', coordinates: [HUB.lng, HUB.lat + 0.02] } } });
    await shifts.book({ workerId: s._id, day: today(), code: 'now' });
    await shifts.checkIn({ workerId: s._id, lat: HUB.lat, lng: HUB.lng, selfieKey: 'k' });
    await Worker.updateOne({ _id: s._id }, { $set: { currentLocation: { type: 'Point', coordinates: [HUB.lng, HUB.lat + 0.02] }, lastSeenAt: new Date() } });
    await Promise.all([partner, s].map((w) => ProviderEnrolment.create({ providerKind: 'individual', workerId: w._id, domainCode: 'pet_services', lineCode: 'pet_grooming', status: 'approved' })));
    const { insertedId } = await PetBooking.collection.insertOne({
      reference: 'ZPWF1', userId: new mongoose.Types.ObjectId(), categoryCode: 'pet_grooming', serviceMode: 'doorstep', status: 'BOOKED',
      workerId: null, shopId: null, declinedBy: [], serviceLocation: { type: 'Point', coordinates: [HUB.lng, HUB.lat], address: 'x' },
      pets: [], pricing: { totalPaise: 60000, providerAmountPaise: 50000 }, statusHistory: [], createdAt: new Date(), updatedAt: new Date(),
    });
    const list = await require('../src/modules/jobs/fast-assign').autoAcceptCandidates('pet', await PetBooking.findById(insertedId).lean(), 5);
    // The staff member is farther than the partner, and still first.
    expect(list[0]).toMatchObject({ id: String(s._id), staff: true });
    expect(list.map((p) => p.id)).toContain(String(partner._id));
  });
});

describe('money', () => {
  const settle = (booking, paymentMethod) => require('../src/modules/payment/settlement').settleProviderShare({
    source: 'pet', booking, reference: 'ZPX', paymentMethod, totalPaise: 50000, platformPaise: 10000,
  });

  test('online: all of it is ZappyOne revenue, nothing to the staff wallet', async () => {
    const s = await person();
    const out = await settle({ _id: new mongoose.Types.ObjectId(), workerId: s._id }, 'online');
    expect(out).toMatchObject({ settled: true, staff: true, providerPaise: 0, platformPaise: 50000 });
    expect((await Wallet.findOne({ 'owner.id': s._id }).lean())?.balancePaise || 0).toBe(0);
  });

  test('cash: they owe all of it, and owing never stops their work', async () => {
    const s = await person();
    await settle({ _id: new mongoose.Types.ObjectId(), workerId: s._id }, 'cash');
    await settle({ _id: new mongoose.Types.ObjectId(), workerId: s._id }, 'cash');
    expect((await Wallet.findOne({ 'owner.id': s._id }).lean()).balancePaise).toBe(-100000);
    await expect(require('../src/modules/worker/worker-dues.service').assertCanWork(s._id)).resolves.toBeUndefined();
  });
});

describe('salary', () => {
  test('monthly salary for days worked plus approved leave, out of the working days', async () => {
    const s = await person({ salary: 1300000 });
    const month = payroll.monthOf();
    const day = (d) => `${month}-${String(d).padStart(2, '0')}`;
    await Shift.create([1, 2, 3].map((d) => ({ workerId: s._id, hubId: hub._id, day: day(d), code: 'now', startAt: new Date(`${day(d)}T09:00:00+05:30`), endAt: new Date(`${day(d)}T17:00:00+05:30`), status: 'done' })));
    await Shift.create({ workerId: s._id, hubId: hub._id, day: day(4), code: 'now', startAt: new Date(`${day(4)}T09:00:00+05:30`), endAt: new Date(`${day(4)}T17:00:00+05:30`), status: 'missed' });
    await Leave.create({ workerId: s._id, day: day(5), status: 'approved' });
    const m = await payroll.myMonth(s._id, month);
    expect(m).toMatchObject({ workedDays: 3, leaveDays: 1, paidDays: 4, missedShifts: 1, workingDays: 26 });
    expect(m.payPaise).toBe(Math.round((1300000 * 4) / 26));
    expect(payroll.toCsv(await payroll.payroll(month))).toContain('Salary due');
  });
});

describe('fleet finance', () => {
  test('a hub’s month: its staff jobs’ revenue, salaries, expenses and profit', async () => {
    const Expense = require('../src/modules/workforce/expense.model');
    const finance = require('../src/modules/workforce/finance.service');
    const month = payroll.monthOf();
    const before = (await finance.hubFinance(month)).hubs.find((h) => h.id === String(hub._id));
    const s = await person({ salary: 1300000 });
    await require('../src/modules/payment/settlement').settleProviderShare({
      source: 'pet', booking: { _id: new mongoose.Types.ObjectId(), workerId: s._id }, reference: 'ZPF', paymentMethod: 'online', totalPaise: 80000, platformPaise: 10000,
    });
    await Expense.create({ hubId: hub._id, category: 'rent', amountPaise: 500000, day: `${month}-02` });
    await Expense.create({ hubId: null, category: 'uniforms', amountPaise: 200000, day: `${month}-02` });
    const out = await finance.hubFinance(month);
    const h = out.hubs.find((x) => x.id === String(hub._id));
    expect(h.revenuePaise - before.revenuePaise).toBe(80000);
    expect(h.jobs - before.jobs).toBe(1);
    expect(h.byCategory.rent).toBe(500000);
    expect(h.profitPaise).toBe(h.revenuePaise - h.salaryPaise - h.expensesPaise);
    expect(out.fleet.byCategory.uniforms).toBe(200000);
    expect(out.total.expensesPaise).toBeGreaterThanOrEqual(700000);
  });
});

describe('dark-store stock and the overview', () => {
  test('purchases raise stock and record a parts expense; issues never go below zero', async () => {
    const stock = require('../src/modules/workforce/stock.service');
    const Expense = require('../src/modules/workforce/expense.model');
    const item = await stock.addItem({ hubId: hub._id, name: 'Battery 4000mAh', unit: 'piece', reorderAt: 2 });
    await stock.purchase({ itemId: item._id, qty: 5, unitCostPaise: 60000, supplier: 'Sri Ram Traders' });
    await stock.purchase({ itemId: item._id, qty: 5, unitCostPaise: 80000 });
    const s = await person();
    const out = await stock.issue({ itemId: item._id, qty: 8, workerId: s._id, jobRef: 'ZP123' });
    expect(out.item).toMatchObject({ qty: 2, avgCostPaise: 70000 });
    await expect(stock.issue({ itemId: item._id, qty: 3 })).rejects.toMatchObject({ code: 'SHORT' });
    const listed = (await stock.items(hub._id)).find((i) => i.name === 'Battery 4000mAh');
    expect(listed).toMatchObject({ low: true, valuePaise: 140000 });
    expect(await Expense.countDocuments({ hubId: hub._id, category: 'parts' })).toBe(2);
  });

  test('the overview adds up: revenue, salary cost, expenses and hub ranking', async () => {
    const out = await require('../src/modules/workforce/analytics.service').overview({ days: 30 });
    expect(out.days).toHaveLength(30);
    expect(out.kpis.revenuePaise).toBe(out.days.reduce((t, d) => t + d.revenuePaise, 0));
    expect(out.kpis.profitPaise).toBe(Math.round(out.kpis.revenuePaise - out.kpis.salaryPaise - out.kpis.expensesPaise));
    expect(out.hubs.find((h) => h.key === String(hub._id))).toBeTruthy();
    expect(out.kpis.lowStock).toBeGreaterThanOrEqual(1);
  });
});
