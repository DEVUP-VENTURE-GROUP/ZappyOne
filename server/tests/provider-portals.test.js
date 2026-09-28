/**
 * Shop workers and independent workers live on different apps.
 *
 * servicepro.zappyone.com — shop owners and the workers a shop has added.
 * rakshak.zappyone.com    — independent workers, who may sign themselves up.
 *
 * A worker is one or the other. Letting a shop's technician also take open
 * jobs invites poaching fights; letting a shop "add" an independent worker's
 * number would silently take over that person's account.
 */

const { startMongo, stopMongo } = require('./helpers');
const { redis } = require('../src/config/redis');
const Worker = require('../src/modules/worker/worker.model');
const Shop = require('../src/modules/shop/shop.model');
const authService = require('../src/modules/auth/auth.service');
const shopService = require('../src/modules/shop/shop.service');

jest.setTimeout(60000);

let shop;
beforeAll(async () => {
  await startMongo();
  shop = await Shop.create({ phone: '9000000001', businessName: 'Ravi Mobiles', ownerName: 'Ravi' });
});
afterAll(stopMongo);

const otpFor = (phone) => redis.hset(`otp:${phone}`, { code: '1234', attempts: '0' });
async function login(phone, portal, extra = {}) {
  await otpFor(phone);
  return authService.loginWorkerWithOtp({ phone, otp: '1234', portal, ...extra });
}

test('servicepro refuses a number no shop has added, and never creates an account', async () => {
  await expect(login('9111111111', 'servicepro', { name: 'Stranger' }))
    .rejects.toMatchObject({ code: 'NOT_A_SHOP_WORKER' });
  expect(await Worker.countDocuments({ phone: '9111111111' })).toBe(0);
});

test('rakshak lets an independent worker sign up', async () => {
  const { worker } = await login('9222222222', 'rakshak', { name: 'Anil' });
  expect(worker.shopId).toBeFalsy();
});

test("a shop's worker signs in on servicepro but is sent away from rakshak", async () => {
  await shopService.addWorkerToShop(shop._id, { phone: '9333333333', name: 'Suresh' });
  const { worker } = await login('9333333333', 'servicepro');
  expect(String(worker.shopId)).toBe(String(shop._id));
  await expect(login('9333333333', 'rakshak')).rejects.toMatchObject({ code: 'SHOP_WORKER' });
});

test("a shop cannot take over an independent worker's account by adding their number", async () => {
  await expect(shopService.addWorkerToShop(shop._id, { phone: '9222222222' }))
    .rejects.toMatchObject({ code: 'WORKER_IS_INDEPENDENT' });
  expect((await Worker.findOne({ phone: '9222222222' }).lean()).shopId).toBeFalsy();
});

test('a wrong OTP is refused before the portal rule is revealed', async () => {
  await otpFor('9444444444');
  await expect(authService.loginWorkerWithOtp({ phone: '9444444444', otp: '0000', portal: 'servicepro' }))
    .rejects.toMatchObject({ code: 'OTP_INVALID' });
});

test('clients that send no portal (mobile, legacy web) are unaffected', async () => {
  const { worker } = await login('9333333333', null);
  expect(String(worker.shopId)).toBe(String(shop._id));
});
