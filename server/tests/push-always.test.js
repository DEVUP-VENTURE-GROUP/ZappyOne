// Every notification goes to the phone as a push, even while the person has the website or the app connected: FCM is free, and an open tab is not someone looking at their phone.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

const { notificationsQueue } = require('../src/jobs');
const { redis } = require('../src/config/redis');
const { notify } = require('../src/modules/notification/notification.service');

const pushes = () => notificationsQueue.add.mock.calls.filter(([name]) => name === 'push');
beforeEach(() => notificationsQueue.add.mockClear());

test('a push is queued even when the person has a live connection open', async () => {
  const id = String(new mongoose.Types.ObjectId());
  await redis.set(`presence:user:${id}`, '1', 'EX', 65);
  await notify({ recipient: { kind: 'user', id }, type: 'system_alert', title: 'Your pro accepted', body: 'They are getting ready.' });
  expect(pushes()).toHaveLength(1);
  expect(pushes()[0][1]).toMatchObject({ recipient: { kind: 'user', id }, title: 'Your pro accepted' });
});

test('quiet hours (push: false) still keep it in the app only', async () => {
  const id = String(new mongoose.Types.ObjectId());
  await notify({ recipient: { kind: 'user', id }, type: 'system_alert', title: 'Tip', body: 'Later', push: false });
  expect(pushes()).toHaveLength(0);
});
