// Two taps at once make one booking for every kind of job (repair already had a unique key; pet bookings and errands now do too).
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let PetBooking; let HelpingTask;
beforeAll(async () => {
  await startMongo();
  ({ PetBooking } = require('../src/modules/pet/models/booking.model'));
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  await Promise.all([PetBooking.init(), HelpingTask.init()]);
});
afterAll(stopMongo);

test('the unique key exists on pet bookings and errands, and a second record with the same key is refused', async () => {
  for (const M of [PetBooking, HelpingTask]) {
    const names = (await M.collection.indexes()).map((i) => i.name);
    expect(names).toContain('idempotencyKey_unique');
    const ref = () => `T${Math.random().toString(36).slice(2, 10)}`;
    await M.collection.insertOne({ reference: ref(), idempotencyKey: `k-${M.modelName}` });
    await expect(M.collection.insertOne({ reference: ref(), idempotencyKey: `k-${M.modelName}` })).rejects.toMatchObject({ code: 11000 });
    // Records without a key are never blocked by it.
    await M.collection.insertMany([{ reference: ref(), idempotencyKey: null }, { reference: ref(), idempotencyKey: null }]);
  }
});
