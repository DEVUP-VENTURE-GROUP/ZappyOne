// A pro's job list names the device ("Geyser"), not its catalog codes ("apprep_geyser apprep-geyser-geyser"); an unknown model leaves `device` empty so the app falls back to the codes.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

const { listJobs } = require('../src/modules/repair/controllers/provider/catalog.controller');

test('each job carries its model name as device', async () => {
  const shopId = new mongoose.Types.ObjectId();
  await mongoose.connection.collection('devicemodels').insertOne({ vertical: 'appliance_repair', code: 'apprep-geyser-geyser', brandCode: 'apprep_geyser', name: 'Geyser' });
  const row = (modelCode) => ({
    _id: new mongoose.Types.ObjectId(), shopId, userId: new mongoose.Types.ObjectId(), vertical: 'appliance_repair',
    brandCode: 'apprep_geyser', modelCode, repairCode: 'apprep_inspect', status: 'PROVIDER_ASSIGNED', createdAt: new Date(),
  });
  await mongoose.connection.collection('repairbookings').insertMany([row('apprep-geyser-geyser'), row('apprep-unknown-model')]);

  let body;
  await listJobs({ auth: { role: 'shop', sub: String(shopId) }, query: {} }, { json: (b) => { body = b; } }, (e) => { throw e; });

  const byModel = Object.fromEntries(body.bookings.map((b) => [b.modelCode, b.device]));
  expect(byModel['apprep-geyser-geyser']).toBe('Geyser');
  expect(byModel['apprep-unknown-model']).toBeNull();
});

test('the job offer a shop is rung with names the device', async () => {
  const { redis } = require('../src/config/redis');
  const sent = [];
  const spy = jest.spyOn(redis, 'publish').mockImplementation(async (channel, msg) => { if (channel === 'provider:repair') sent.push(JSON.parse(msg)); return 1; });
  const events = require('../src/modules/repair/services/events.service');
  const base = { userId: new mongoose.Types.ObjectId(), shopId: new mongoose.Types.ObjectId(), vertical: 'appliance_repair', brandCode: 'apprep_geyser', serviceMode: 'doorstep', priceSnapshot: { totalPaise: 54900 } };

  events.announceOffer({ ...base, _id: new mongoose.Types.ObjectId(), modelCode: 'apprep-geyser-geyser' });
  events.announceOffer({ ...base, _id: new mongoose.Types.ObjectId(), modelCode: 'apprep-unknown-model' });
  for (let i = 0; i < 50 && sent.length < 2; i += 1) await new Promise((r) => setTimeout(r, 20)); // eslint-disable-line no-await-in-loop
  spy.mockRestore();

  const devices = sent.filter((m) => m.event === 'repair.offer').map((m) => m.payload.device).sort();
  // A known model by name; an unknown one keeps the codes rather than showing nothing.
  expect(devices).toEqual(['Geyser', 'apprep_geyser apprep-unknown-model']);
});
