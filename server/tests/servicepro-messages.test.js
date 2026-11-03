// ServicePro shops get the same automatic messages pros do: dues warning, jobs paused, payment received, and a reminder of the next setup step; links open ServicePro.
const { startMongo, stopMongo } = require('./helpers');
const Shop = require('../src/modules/shop/shop.model');
const Transaction = require('../src/modules/payment/transaction.model');
const { MessageLog, build } = require('../src/modules/messaging/send');
const dues = require('../src/modules/shop/shop-dues');
const { setupNudges } = require('../src/modules/messaging/lifecycle');
const { redis } = require('../src/config/redis');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

const owe = (shopId, paise, key) => Transaction.create({ type: 'debit', owner: { kind: 'platform', id: null }, amountPaise: -paise, reason: 'platform_commission', idempotencyKey: key, metadata: { shopId: String(shopId), cash: true }, status: 'succeeded' });
const logs = (shopId, key) => MessageLog.find({ toKind: 'shop', toId: String(shopId), key, channel: 'push' }).lean();

test('a shop hears when dues near the limit, when jobs pause, and when its payment lands', async () => {
  const shop = await Shop.create({ phone: '9822300001', businessName: 'Kondapur Fixers', ownerName: 'Ravi' });
  await owe(shop._id, 160000, 'sp-m1');
  await dues.notifyIfCrossed(shop._id);
  await dues.notifyIfCrossed(shop._id);
  expect((await logs(shop._id, 'provider.dues')).map((l) => l.subject)).toEqual(['You owe ₹1,600']);

  await owe(shop._id, 60000, 'sp-m2');
  await dues.notifyIfCrossed(shop._id);
  expect((await logs(shop._id, 'provider.dues')).map((l) => l.subject)).toContain('New jobs are paused');

  await dues.recordPayment({ shopId: shop._id, amountPaise: 220000, reference: 'UTR-SP-1' });
  await new Promise((r) => setTimeout(r, 50));
  expect((await logs(shop._id, 'provider.dues')).map((l) => l.subject)).toContain('Payment received');
});

test('partner links open their own portal and the job alert names the ZappyOne amount', async () => {
  const shopMsg = await build('provider.dues', { state: 'blocked', duesPaise: 210000, limitPaise: 200000 }, 'shop');
  expect(shopMsg.push.link).toBe('/shop');
  const proMsg = await build('provider.dues', { state: 'blocked', duesPaise: 210000, limitPaise: 200000 }, 'worker');
  expect(proMsg.push.link).toBe('/worker');
  const paid = await build('provider.paid', { f: { service: 'Screen repair', reference: 'ZR-1', linesPaise: [] }, earningPaise: 180000, zappyPaise: 20000, cash: true }, 'shop');
  expect(paid.push).toMatchObject({ link: '/shop/earnings', body: expect.stringContaining('₹200 is your ZappyOne amount') });
  expect(paid.push.body).not.toMatch(/commission/i);
});

test('a new shop still setting up hears its next step once that day, and a finished or older shop hears nothing', async () => {
  const now = new Date('2027-06-02T06:30:00Z'); // 12:00 IST, long after the other tests' shops signed up
  const fresh = await Shop.create({ phone: '9822300002', businessName: 'New Shop', ownerName: 'Sana', createdAt: new Date(now - 86400000 - 3600000) });
  const old = await Shop.create({ phone: '9822300003', businessName: 'Old Shop', ownerName: 'Om', createdAt: new Date(now - 40 * 86400000) });
  await redis.del('setup-nudge:ran:2027-06-02');

  expect(await setupNudges(now)).toBe(1);
  expect(await setupNudges(now)).toBe(0);
  const [log] = await logs(fresh._id, 'provider.setup_next');
  // The first real field still open, not the step's group name.
  expect(log.subject).toBe('Next: email for receipts and notices');
  expect(await logs(old._id, 'provider.setup_next')).toHaveLength(0);
});

test('independent pros and event partners are nudged too, with every step left and a link that opens the field; ZappyOne staff are not', async () => {
  const Worker = require('../src/modules/worker/worker.model');
  const EventPartner = require('../src/modules/events/event-partner.model');
  const { setupLeft } = require('../src/modules/messaging/lifecycle');
  const now = new Date('2027-07-03T06:30:00Z');
  const joined = new Date(now - 2 * 86400000 - 3600000);
  const pro = await Worker.create({ phone: '9822300011', name: 'Imran', createdAt: joined });
  const staff = await Worker.create({ phone: '9822300012', name: 'Staff', employment: { type: 'staff' }, createdAt: joined });
  const partner = await EventPartner.create({ phone: '9822300013', businessName: 'Gala Decor', ownerName: 'Ria', createdAt: joined });
  await redis.del('setup-nudge:ran:2027-07-03');

  const left = await setupLeft('worker', pro._id);
  expect(left).toMatchObject({ step: 'Your photo', path: '/worker/profile?focus=photo' });
  expect(left.left).toEqual(['Your photo', 'Identity documents sent for verification']);

  await setupNudges(now);
  const sentTo = (kind, id) => MessageLog.find({ toKind: kind, toId: String(id), key: 'provider.setup_next', channel: 'push' }).lean();
  expect(await sentTo('worker', pro._id)).toHaveLength(1);
  expect(await sentTo('event_partner', partner._id)).toHaveLength(1);
  expect(await sentTo('worker', staff._id)).toHaveLength(0);
});
