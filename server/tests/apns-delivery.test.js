require('./env');
// iPhone push end to end against a local HTTP/2 server that answers the way Apple's does: the provider token is a real ES256 JWT for the team's key, a dev build's token is retried on the sandbox, a token from the other app is retried with that app's topic, dead tokens are pruned, and the push job routes a customer's iPhone through it.
const http2 = require('http2');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
const tok = (c) => c.repeat(64);
const OK = tok('a'); const DEV_BUILD = tok('b'); const OTHER_APP = tok('c'); const DEAD = tok('d'); const REVOKED_KEY = tok('e');
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const seen = [];
const servers = {};

// Apple's answers by token: one fixed answer, or one per environment / topic.
const ANSWERS = new Map([
  [OK, () => [200]],
  [DEV_BUILD, (env) => (env === 'sandbox' ? [200] : [400, 'BadDeviceToken'])],
  [OTHER_APP, (env, topic) => (topic === 'com.zappyone.servicepro' ? [200] : [400, 'DeviceTokenNotForTopic'])],
  [DEAD, () => [410, 'Unregistered']],
  [REVOKED_KEY, () => [403, 'InvalidProviderToken']],
]);
const answer = (env, token, topic) => (ANSWERS.get(token) || (() => [400, 'BadDeviceToken']))(env, topic);
function listen(env) {
  return new Promise((resolve) => {
    const server = http2.createServer();
    server.on('stream', (stream, headers) => {
      let body = '';
      stream.on('data', (c) => { body += c; });
      stream.on('end', () => {
        const token = headers[':path'].split('/').pop();
        seen.push({ env, token, headers, body: body ? JSON.parse(body) : null });
        const [status, reason] = answer(env, token, headers['apns-topic']);
        stream.respond({ ':status': status });
        stream.end(reason ? JSON.stringify({ reason }) : '');
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

let apns;
beforeAll(async () => {
  await startMongo();
  servers.production = await listen('production');
  servers.sandbox = await listen('sandbox');
  // The key from a file, as APNS_KEY_PATH allows.
  const keyFile = path.join(os.tmpdir(), `apns-test-${process.pid}.p8`);
  fs.writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  Object.assign(process.env, { APNS_KEY_ID: 'KEY1234567', APNS_TEAM_ID: 'TEAM123456', APNS_KEY_PATH: keyFile });
  delete process.env.APNS_KEY;
  apns = require('../src/modules/notification/apns');
  apns.HOSTS.production = `http://127.0.0.1:${servers.production.address().port}`;
  apns.HOSTS.sandbox = `http://127.0.0.1:${servers.sandbox.address().port}`;
});
afterAll(async () => {
  await Promise.all(Object.values(servers).map((s) => new Promise((r) => s.close(r))));
  await stopMongo();
});
beforeEach(() => { seen.length = 0; });

test('a customer push reaches Apple signed with the team key, for the customer app', async () => {
  expect(apns.isConfigured()).toBe(true);
  const r = await apns.sendApns({ tokens: [OK, OK, 'fcm:token'], kind: 'user', title: 'Booked', body: 'On the way', data: { deepLink: '/orders/9' } });
  expect(r).toMatchObject({ ok: true, success: 1, failure: 0, stale: [] });
  expect(seen).toHaveLength(1);
  const { headers, body } = seen[0];
  expect(headers['apns-topic']).toBe('com.zappyone.app');
  expect(headers['apns-push-type']).toBe('alert');
  const claims = jwt.verify(headers.authorization.replace('bearer ', ''), publicKey, { algorithms: ['ES256'] });
  expect(claims.iss).toBe('TEAM123456');
  expect(jwt.decode(headers.authorization.replace('bearer ', ''), { complete: true }).header.kid).toBe('KEY1234567');
  expect(body.body.deepLink).toBe('/orders/9');
});

test('a development build is retried on the sandbox, a token from the other app with its topic', async () => {
  const r = await apns.sendApns({ tokens: [DEV_BUILD, OTHER_APP], kind: 'user', title: 'x', body: 'y' });
  expect(r).toMatchObject({ success: 2, failure: 0 });
  expect(seen.filter((s) => s.token === DEV_BUILD).map((s) => s.env)).toEqual(['production', 'sandbox']);
  expect(seen.filter((s) => s.token === OTHER_APP).map((s) => s.headers['apns-topic'])).toEqual(['com.zappyone.app', 'com.zappyone.servicepro']);
});

test('a job offer rings as time-sensitive for ServicePro; a dead token is reported stale; a refused key is a failure', async () => {
  const r = await apns.sendApns({ tokens: [OK, DEAD, REVOKED_KEY], kind: 'worker', title: 'New job', body: 'AC', data: { orderId: 'o7' }, offer: true, windowSec: 30 });
  expect(r).toMatchObject({ success: 1, failure: 2, stale: [DEAD] });
  const ok = seen.find((s) => s.token === OK);
  expect(ok.headers['apns-topic']).toBe('com.zappyone.servicepro');
  expect(ok.headers['apns-collapse-id']).toBe('offer-o7');
  expect(ok.body.aps).toMatchObject({ sound: 'zappy_ring.wav', 'interruption-level': 'time-sensitive' });
});

test('the push job sends a customer iPhone through APNs and prunes a dead one', async () => {
  const User = require('../src/modules/user/user.model');
  const id = new mongoose.Types.ObjectId();
  await User.collection.insertOne({ _id: id, phone: '9100000301', deviceTokens: [OK, DEAD] });
  const { processJob } = require('../src/jobs/notifications.worker');
  const r = await processJob({ name: 'push', data: { recipient: { kind: 'user', id: String(id) }, title: 'Your pro accepted', body: 'Arriving soon', data: { deepLink: '/orders/1' } } });
  expect(r).toMatchObject({ ok: true, success: 1, failure: 1 });
  expect(seen.map((s) => s.headers['apns-topic'])).toEqual(['com.zappyone.app', 'com.zappyone.app']);
  await new Promise((res) => setTimeout(res, 200));
  expect((await User.findById(id).select('deviceTokens').lean()).deviceTokens).toEqual([OK]);
});

test('a job offer to a worker iPhone goes through APNs with the offer sound', async () => {
  const Worker = require('../src/modules/worker/worker.model');
  const Order = require('../src/modules/order/order.model');
  const workerId = new mongoose.Types.ObjectId(); const orderId = new mongoose.Types.ObjectId();
  await Worker.collection.insertOne({ _id: workerId, phone: '9100000302', deviceTokens: [OK] });
  await Order.collection.insertOne({ _id: orderId, service: 'ac_repair', pricing: { total: 499 }, pickupLocation: { address: 'Madhapur' } });
  const { processJob } = require('../src/jobs/notifications.worker');
  const r = await processJob({ name: 'worker_offer', data: { workerId: String(workerId), orderId: String(orderId) } });
  expect(r).toMatchObject({ ok: true, success: 1 });
  expect(seen[0].headers['apns-topic']).toBe('com.zappyone.servicepro');
  expect(seen[0].body.aps.sound).toBe('zappy_ring.wav');
});
