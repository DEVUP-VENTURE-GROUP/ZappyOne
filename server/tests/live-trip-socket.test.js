/**
 * The live map, over a real socket: a customer watching a pet booking sees
 * the groomer move, and a stranger can't join the room.
 *
 * The worker's app sends a plain ping with no job id (the dashboard feed);
 * the server works out which trip it belongs to.
 */
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { redis } = require('../src/config/redis');
const { PetBooking } = require('../src/modules/pet/models/booking.model');
const { signToken } = require('../src/modules/auth/auth.service');
const { initSockets } = require('../src/sockets');

// The server doesn't depend on the client library; the customer app does.
const { io: connect } = require(path.join(__dirname, '../../client/node_modules/socket.io-client'));

jest.setTimeout(60000);

const userId = new mongoose.Types.ObjectId();
const workerId = new mongoose.Types.ObjectId();
let server; let url; let bookingId;
const sockets = [];

function client(sub, role) {
  const s = connect(url, { auth: { token: signToken({ sub: String(sub), role }) }, transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return new Promise((resolve, reject) => { s.on('connect', () => resolve(s)); s.on('connect_error', reject); });
}
const once = (s, event, ms = 5000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`no ${event}`)), ms);
  s.once(event, (p) => { clearTimeout(t); resolve(p); });
});

beforeAll(async () => {
  await startMongo();
  await redis.flushall();
  const { insertedId } = await PetBooking.collection.insertOne({
    userId, workerId, status: 'PROVIDER_EN_ROUTE', serviceMode: 'doorstep', updatedAt: new Date(),
    serviceLocation: { type: 'Point', coordinates: [78.3915, 17.4483], address: 'Madhapur' },
  });
  bookingId = String(insertedId);
  server = http.createServer();
  initSockets(server);
  await new Promise((r) => server.listen(0, r));
  url = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.close());
  await new Promise((r) => server.close(r));
  await stopMongo();
});

test('the owner subscribes and sees the pro move', async () => {
  const owner = await client(userId, 'user');
  const subscribed = once(owner, 'order:subscribed');
  owner.emit('order:subscribe', { orderId: bookingId });
  expect(await subscribed).toEqual({ orderId: bookingId });

  const worker = await client(workerId, 'worker');
  const seen = once(owner, 'worker.location');
  worker.emit('worker:location', { lat: 17.44, lng: 78.38, acc: 20 });
  expect(await seen).toMatchObject({ lat: 17.44, lng: 78.38 });
});

test('someone else is refused', async () => {
  const stranger = await client(new mongoose.Types.ObjectId(), 'user');
  const denied = once(stranger, 'order:subscribe_denied');
  stranger.emit('order:subscribe', { orderId: bookingId });
  expect(await denied).toMatchObject({ reason: 'not_authorized' });
});
