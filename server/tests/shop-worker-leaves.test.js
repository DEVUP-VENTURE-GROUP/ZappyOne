/**
 * A technician who leaves a shop takes nothing of the shop's with them:
 * their ServicePro sessions end, and the shop's open jobs return to the shop.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { redis } = require('../src/config/redis');
const Shop = require('../src/modules/shop/shop.model');
const Worker = require('../src/modules/worker/worker.model');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const shopService = require('../src/modules/shop/shop.service');
const tokenService = require('../src/modules/auth/token.service');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

test('removing a technician ends their sessions and hands open jobs back to the shop', async () => {
  const shop = await Shop.create({ phone: '9000000901', businessName: 'Fixit', ownerName: 'Om', isActive: true });
  const tech = await Worker.create({ name: 'Kiran', phone: '9000000902', shopId: shop._id });
  await tokenService.issueTokenPair({ sub: String(tech._id), role: 'worker' });
  expect((await redis.keys(`rt:${tech._id}:*`)).length).toBeGreaterThan(0);

  const open = await RepairBooking.collection.insertOne({ shopId: shop._id, workerId: tech._id, status: 'ON_THE_WAY', reference: 'ZRLEAVE1', userId: new mongoose.Types.ObjectId() });
  const done = await RepairBooking.collection.insertOne({ shopId: shop._id, workerId: tech._id, status: 'COMPLETED', reference: 'ZRLEAVE2', userId: new mongoose.Types.ObjectId() });

  await shopService.removeWorkerFromShop(shop._id, tech._id);

  expect((await Worker.findById(tech._id).lean()).shopId).toBeNull();
  expect(await redis.keys(`rt:${tech._id}:*`)).toHaveLength(0);
  expect((await RepairBooking.findById(open.insertedId).lean()).workerId).toBeNull();
  // History stays theirs.
  expect(String((await RepairBooking.findById(done.insertedId).lean()).workerId)).toBe(String(tech._id));
});
