// Each trade's own steps (onboarding/workspace flowOf): diagnosis, quotes and photos differ by category, and the server holds to them.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);

let ws; let RepairBooking; let lifecycle; let quotes;
beforeAll(async () => {
  await startMongo();
  ws = require('../src/modules/onboarding/workspace');
  ({ RepairBooking } = require('../src/modules/repair/models/booking.model'));
  lifecycle = require('../src/modules/repair/services/booking/lifecycle');
  quotes = require('../src/modules/repair/services/booking/quotes');
  const { ServiceLine, ServiceDomain } = require('../src/modules/onboarding/onboarding.model');
  await ServiceDomain.create([{ code: 'local_pros', name: 'Other Local Services' }, { code: 'beauty_care', name: 'Beauty & Personal Care' }]);
  await ServiceLine.create({ code: 'dance_teacher', name: 'Dance classes', domainCode: 'local_pros', repairVertical: 'dance_teacher', status: 'live' });
  require('../src/modules/repair/vertical').register('dance_teacher');
});
afterAll(stopMongo);

test('profiles by category, narrowed by service, with the admin able to set a category\'s own', () => {
  expect(ws.flowOf({ code: 'mobile_repair' }, { code: 'electronics' })).toEqual({ diagnosis: true, quote: true, photos: true });
  expect(ws.flowOf({ code: 'salon_home' }, { code: 'beauty_care' })).toEqual({ diagnosis: false, quote: false, photos: false });
  expect(ws.flowOf({ code: 'home_tutor' }, { code: 'local_pros' })).toEqual({ diagnosis: false, quote: false, photos: false });
  expect(ws.flowOf({ code: 'bike_wash', repairVertical: 'bike_wash' }, { code: 'vehicles' })).toEqual({ diagnosis: false, quote: false, photos: true });
  expect(ws.flowOf({ code: 'two_wheeler', repairVertical: 'two_wheeler' }, { code: 'vehicles' }).diagnosis).toBe(true);
  expect(ws.flowOf({ code: 'appliance_repair', repairVertical: 'appliance_repair' }, { code: 'home_services' }).diagnosis).toBe(true);
  expect(ws.flowOf({ code: 'carpentry', repairVertical: 'carpentry' }, { code: 'home_services' })).toEqual({ diagnosis: false, quote: true, photos: true });
  expect(ws.flowOf({ code: 'x' }, { code: 'specialist_home', dashboard: { flow: { photos: false } } }).photos).toBe(false);
});

test('the terms every screen reads carry the flow', async () => {
  expect((await ws.termsForVertical('dance_teacher')).flow).toEqual({ diagnosis: false, quote: false, photos: false });
  expect((await ws.termsForVertical('nothing_like_this')).flow).toEqual(ws.REPAIR_FLOW);
});

const booking = (vertical, status, extra = {}) => RepairBooking.create({
  reference: `F${Math.random().toString(36).slice(2, 9).toUpperCase()}`, userId: new mongoose.Types.ObjectId(), workerId: new mongoose.Types.ObjectId(),
  vertical, brandCode: 'one', modelCode: 'one', serviceMode: 'doorstep', status,
  location: { type: 'Point', coordinates: [78.38, 17.44], address: 'Test' },
  priceSnapshot: { subtotalPaise: 0, totalPaise: 0 }, statusHistory: [{ status, at: new Date() }], ...extra,
});

test('a fixed-price trade takes no quotes', async () => {
  const b = await booking('dance_teacher', 'ARRIVED');
  await expect(quotes.submitQuote({ bookingId: b._id, actorRole: 'admin', items: [] })).rejects.toMatchObject({ code: 'QUOTES_NOT_USED' });
});

test('a class finishes without a photo; a repair trade still needs one', async () => {
  const cls = await booking('dance_teacher', 'QA_PENDING');
  const done = await lifecycle.transition(cls._id, 'COMPLETED', { actorRole: 'worker', actorId: cls.workerId });
  expect((done.booking || done).status).toBe('COMPLETED');
  const fix = await booking('mobile', 'QA_PENDING');
  await expect(lifecycle.transition(fix._id, 'COMPLETED', { actorRole: 'worker', actorId: fix.workerId })).rejects.toMatchObject({ code: 'PHOTO_REQUIRED' });
});
