// All prices up or down by a %: always from the normal price (never stacking), whole rupees, 0 puts them back; shops and pros alike.
require('./env');
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);
let app; let signAccessToken;
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ signAccessToken } = require('../src/modules/auth/token.service'));
  const { Repair } = require('../src/modules/repair/models/repair.model');
  await Repair.create([{ code: 'battery_swap', name: 'Battery swap', vertical: 'mobile' }, { code: 'port_clean', name: 'Port clean', vertical: 'mobile' }]);
});
afterAll(stopMongo);

async function asShop() {
  const Shop = require('../src/modules/shop/shop.model');
  const shop = await Shop.create({ businessName: 'Test Mobiles', ownerName: 'Ravi', phone: `98${Math.floor(1e7 + Math.random() * 9e7)}` });
  return { Authorization: `Bearer ${signAccessToken({ sub: String(shop._id), role: 'shop', phone: shop.phone })}` };
}
const price = async (auth, code) => (await request(app).get('/api/repair/provider/pricing?vertical=mobile').set(auth)).body.pricing.find((p) => p.repairCode === code);
const adjust = (auth, percent) => request(app).post('/api/repair/provider/pricing/adjust').set(auth).send({ vertical: 'mobile', percent });

test('+10% twice does not stack, rounds to whole rupees, and 0% is back to normal', async () => {
  const auth = await asShop();
  expect((await request(app).post('/api/repair/provider/pricing').set(auth).send({ vertical: 'mobile', repairCode: 'battery_swap', totalPaise: 100000 })).status).toBe(201);
  expect((await request(app).post('/api/repair/provider/pricing').set(auth).send({ vertical: 'mobile', repairCode: 'port_clean', totalPaise: 33300 })).status).toBe(201);

  expect((await adjust(auth, 10)).body).toMatchObject({ changed: 2 });
  expect(await price(auth, 'battery_swap')).toMatchObject({ totalPaise: 110000, normalPaise: 100000 });
  expect((await price(auth, 'port_clean')).totalPaise).toBe(36600);
  expect((await adjust(auth, 10)).body.changed).toBe(0);
  expect((await price(auth, 'battery_swap')).totalPaise).toBe(110000);

  await adjust(auth, -20).expect(200);
  expect((await price(auth, 'battery_swap')).totalPaise).toBe(80000);
  expect((await adjust(auth, 0)).body.note).toMatch(/back to normal/);
  expect(await price(auth, 'battery_swap')).toMatchObject({ totalPaise: 100000, normalPaise: null });
});

test('a price edited by hand becomes the new normal', async () => {
  const auth = await asShop();
  await request(app).post('/api/repair/provider/pricing').set(auth).send({ vertical: 'mobile', repairCode: 'battery_swap', totalPaise: 100000 });
  await adjust(auth, 10).expect(200);
  await request(app).post('/api/repair/provider/pricing').set(auth).send({ vertical: 'mobile', repairCode: 'battery_swap', totalPaise: 90000 });
  expect(await price(auth, 'battery_swap')).toMatchObject({ totalPaise: 90000, normalPaise: null });
  await adjust(auth, 10).expect(200);
  expect((await price(auth, 'battery_swap')).totalPaise).toBe(99000);
});

test('out-of-range or fractional percentages are refused; customers cannot call it', async () => {
  const auth = await asShop();
  expect((await adjust(auth, 101)).status).toBe(400);
  expect((await adjust(auth, -51)).status).toBe(400);
  expect((await adjust(auth, 5.5)).status).toBe(400);
  const user = { Authorization: `Bearer ${signAccessToken({ sub: String(new mongoose.Types.ObjectId()), role: 'user', phone: '9800000001' })}` };
  expect((await adjust(user, 10)).status).toBe(403);
});
