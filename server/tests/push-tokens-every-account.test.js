// Every kind of account can save a push token and be found by the sender; a shop owner's token used to vanish into a customer record that did not exist.
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

const devices = require('../src/modules/notification/devices');

let app; let sign;
beforeAll(() => { app = require('../src/app')(); ({ signAccessToken: sign } = require('../src/modules/auth/token.service')); });

const as = (id, role) => ({ Authorization: `Bearer ${sign({ sub: String(id), role })}` });

test('a shop owner saves a token and the push sender finds it', async () => {
  const Shop = require('../src/modules/shop/shop.model');
  const id = new mongoose.Types.ObjectId();
  await Shop.collection.insertOne({ _id: id, businessName: 'Token shop', phone: '9100000001' });
  const res = await request(app).post('/api/users/device-token').set(as(id, 'shop')).send({ token: 'shop-phone-token', platform: 'android' });
  expect(res.status).toBe(200);
  expect((await devices.tokensOf('shop', id)).tokens).toEqual(['shop-phone-token']);
});

test('a customer still saves to their own record, and a phone that can ring is remembered as such', async () => {
  const User = require('../src/modules/user/user.model');
  const id = new mongoose.Types.ObjectId();
  await User.collection.insertOne({ _id: id, phone: '9100000002' });
  await request(app).post('/api/users/device-token').set(as(id, 'user')).send({ token: 'cust-token', platform: 'android-native' });
  const t = await devices.tokensOf('user', id);
  expect(t.tokens).toEqual(['cust-token']);
  expect(t.native).toEqual(['cust-token']);
});

describe('an iPhone keeps its raw APNs token, which goes straight to Apple', () => {
  const apns = require('../src/modules/notification/apns');
  const token = 'ab'.repeat(32);

  test('the token is saved as the phone sent it, with no Firebase swap', async () => {
    const id = new mongoose.Types.ObjectId();
    await require('../src/modules/worker/worker.model').collection.insertOne({ _id: id, phone: '9100000004' });
    expect(await devices.saveToken('worker', id, token, 'ios')).toBe(true);
    expect((await devices.tokensOf('worker', id)).tokens).toEqual([token]);
  });

  test('APNs tokens are told apart from FCM tokens', () => {
    expect(apns.isApnsToken(token)).toBe(true);
    expect(apns.isApnsToken('fGx1:APA91bH-abc_def')).toBe(false);
    expect(apns.isApnsToken('ab'.repeat(16))).toBe(false);
  });

  test('customers get the ZappyOne app, every partner ServicePro', () => {
    expect(apns.bundleFor('user')).toBe('com.zappyone.app');
    for (const k of ['worker', 'shop', 'event_partner']) expect(apns.bundleFor(k)).toBe('com.zappyone.servicepro');
  });

  test('a tap opens the right screen: data rides in `body`, where the app reads it', () => {
    const r = apns.buildRequest({ title: 'Booked', body: 'Your pro is on the way', data: { deepLink: '/orders/1', n: 2 } });
    const p = JSON.parse(r.body);
    expect(p.aps.alert).toEqual({ title: 'Booked', body: 'Your pro is on the way' });
    expect(p.aps.sound).toBe('default');
    expect(p.body).toEqual({ deepLink: '/orders/1', n: '2' });
    expect(r.headers['apns-push-type']).toBe('alert');
  });

  test('a job offer rings, breaks through Focus and expires with the offer', () => {
    const before = Math.floor(Date.now() / 1000);
    const r = apns.buildRequest({ title: 'New job', body: 'AC repair', data: { orderId: 'o1' }, offer: true, windowSec: 45 });
    const p = JSON.parse(r.body);
    expect(p.aps.sound).toBe('zappy_ring.wav');
    expect(p.aps['interruption-level']).toBe('time-sensitive');
    expect(Number(r.headers['apns-expiration'])).toBeLessThanOrEqual(before + 46);
    expect(r.headers['apns-collapse-id']).toBe('offer-o1');
  });

  test('without the APNs key nothing is sent and the reason is reported', async () => {
    const saved = process.env.APNS_KEY_ID;
    delete process.env.APNS_KEY_ID;
    expect(await apns.sendApns({ tokens: [token], kind: 'user', title: 't' })).toMatchObject({ skipped: true, reason: 'apns_not_configured' });
    if (saved) process.env.APNS_KEY_ID = saved;
  });
});

test('a dead token is removed from every kind of account', async () => {
  const Shop = require('../src/modules/shop/shop.model');
  const id = new mongoose.Types.ObjectId();
  await Shop.collection.insertOne({ _id: id, businessName: 'Stale shop', phone: '9100000003', deviceTokens: ['dead', 'live'], nativeTokens: ['dead'] });
  await devices.prune(['dead']);
  const t = await devices.tokensOf('shop', id);
  expect(t.tokens).toEqual(['live']);
  expect(t.native).toEqual([]);
});

describe('signing out takes the phone off the account', () => {
  const token = 'cd'.repeat(32);
  const loginAs = async (phone) => {
    const Worker = require('../src/modules/worker/worker.model');
    const id = new mongoose.Types.ObjectId();
    await Worker.collection.insertOne({ _id: id, phone, shopId: new mongoose.Types.ObjectId() });
    const { refreshToken } = await require('../src/modules/auth/token.service').issueTokenPair({ sub: String(id), role: 'worker', phone });
    return { id, refreshToken };
  };

  test('logout with the push token removes it; without a valid session nothing is removed', async () => {
    const a = await loginAs('9100000201');
    await devices.saveToken('worker', a.id, token, 'ios');
    await request(app).post('/api/auth/logout').set('X-Client-Type', 'mobile').send({ refreshToken: 'forged', pushToken: token });
    expect((await devices.tokensOf('worker', a.id)).tokens).toEqual([token]);
    const r = await request(app).post('/api/auth/logout').set('X-Client-Type', 'mobile').send({ refreshToken: a.refreshToken, pushToken: token });
    expect(r.status).toBe(200);
    expect((await devices.tokensOf('worker', a.id)).tokens).toEqual([]);
  });

  test('a phone that signs in to another account leaves the first one', async () => {
    const a = await loginAs('9100000202');
    const b = await loginAs('9100000203');
    await devices.saveToken('worker', a.id, token, 'ios');
    await devices.saveToken('worker', b.id, token, 'ios');
    expect((await devices.tokensOf('worker', a.id)).tokens).toEqual([]);
    expect((await devices.tokensOf('worker', b.id)).tokens).toEqual([token]);
  });
});
