const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

test('a device history lists the parts fitted on each finished job, with grade and warranty', async () => {
  const { CustomerAsset } = require('../src/modules/repair/models/customer-asset.model');
  const { RepairBooking } = require('../src/modules/repair/models/booking.model');
  const { RepairQuote } = require('../src/modules/repair/models/quote.model');
  const { getAssetHistory } = require('../src/modules/repair/controllers/assets.controller');
  const userId = new mongoose.Types.ObjectId();
  const asset = await CustomerAsset.create({ userId, vertical: 'mobile', brandCode: 'apple', modelCode: 'iphone_13' });
  const jobId = new mongoose.Types.ObjectId();
  await RepairBooking.collection.insertOne({ _id: jobId, userId, vertical: 'mobile', brandCode: 'apple', modelCode: 'iphone_13', status: 'COMPLETED', reference: 'RB-H1', completedAt: new Date() });
  await RepairQuote.collection.insertMany([
    { bookingId: jobId, status: 'approved', items: [{ kind: 'part', label: 'Battery', partGrade: 'original', quantity: 1, warrantyDays: 90 }, { kind: 'labour', label: 'Fitting' }] },
    { bookingId: jobId, status: 'rejected', items: [{ kind: 'part', label: 'Screen', partGrade: 'compatible' }] },
  ]);
  let body;
  await getAssetHistory({ params: { id: String(asset._id) }, auth: { sub: String(userId) } }, { json: (b) => { body = b; }, status: () => ({ json: () => {} }) }, (e) => { throw e; });
  expect(body.bookings[0].parts).toEqual([{ label: 'Battery', grade: 'original', quantity: 1, warrantyDays: 90 }]);
});
