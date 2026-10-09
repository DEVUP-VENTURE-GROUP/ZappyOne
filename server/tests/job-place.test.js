/**
 * Where a job happens, for every kind (jobs/kinds whereOf) — repairs included,
 * which have no open-job start and so were missed by surge and the arrival
 * promise — and the customer's booked place kept on their record.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

test('repairs have a place too', () => {
  const { whereOf } = require('../src/modules/jobs/kinds');
  expect(whereOf('repair', { location: { coordinates: [78.39, 17.44], address: 'Madhapur' } })).toEqual({ lng: 78.39, lat: 17.44, address: 'Madhapur' });
  expect(whereOf('helping', { pickupLocation: { coordinates: [78.4, 17.4], address: 'Shop' } })).toMatchObject({ address: 'Shop' });
  expect(whereOf('repair', {})).toBeNull();
});

test('a booking keeps its place on the customer record (admin sees a location)', async () => {
  const User = require('../src/modules/user/user.model');
  const u = await User.create({ name: 'Keerthi', phone: '9000004001' });
  await require('../src/modules/jobs/place').remember('repair', { userId: u._id, location: { coordinates: [78.39, 17.44], address: 'Kondapur, Hyderabad' } });
  const after = await User.findById(u._id).lean();
  expect(after.recentLocations[0]).toMatchObject({ address: 'Kondapur, Hyderabad', lat: 17.44, lng: 78.39 });
  await require('../src/modules/jobs/place').remember('repair', { userId: new mongoose.Types.ObjectId() }); // nothing to keep: no error
});
