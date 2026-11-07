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

test('a dead token is removed from every kind of account', async () => {
  const Shop = require('../src/modules/shop/shop.model');
  const id = new mongoose.Types.ObjectId();
  await Shop.collection.insertOne({ _id: id, businessName: 'Stale shop', phone: '9100000003', deviceTokens: ['dead', 'live'], nativeTokens: ['dead'] });
  await devices.prune(['dead']);
  const t = await devices.tokensOf('shop', id);
  expect(t.tokens).toEqual(['live']);
  expect(t.native).toEqual([]);
});
