// A partner shop that owes ZappyOne past the limit from cash jobs gets no new work; online earnings and a recorded payment clear it.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const Shop = require('../src/modules/shop/shop.model');
const Transaction = require('../src/modules/payment/transaction.model');
const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
const dues = require('../src/modules/shop/shop-dues');
const { approvedProviders } = require('../src/modules/onboarding/eligibility');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

const owe = (shopId, paise, key) => Transaction.create({ type: 'debit', owner: { kind: 'platform', id: null }, amountPaise: -paise, reason: 'platform_commission', idempotencyKey: key, metadata: { shopId: String(shopId), cash: true }, status: 'succeeded' });
const earn = (shopId, paise, key) => Transaction.create({ type: 'credit', owner: { kind: 'platform', id: null }, amountPaise: paise, reason: 'worker_earning', idempotencyKey: key, metadata: { shopId: String(shopId) }, status: 'succeeded' });

test('over the limit: blocked from claims and from alerts; online earnings and a payment clear it', async () => {
  const shop = await Shop.create({ phone: '9822200001', businessName: 'Cash Heavy Cleaners', ownerName: 'Anil', partnerType: 'agency' });
  const other = await Shop.create({ phone: '9822200002', businessName: 'Fine Co', ownerName: 'Bina' });
  for (const s of [shop, other]) await ProviderEnrolment.create({ providerKind: 'shop', shopId: s._id, domainCode: 'home_services', lineCode: 'cleaning', status: 'approved' });

  await owe(shop._id, 120000, 'c1');
  expect(await dues.duesOf(shop._id)).toMatchObject({ duesPaise: 120000, limitPaise: 100000, isBlocked: true });
  await expect(dues.assertShopCanWork(shop._id)).rejects.toMatchObject({ code: 'SHOP_DUES' });
  expect((await approvedProviders('cleaning')).map((p) => p.id)).toEqual([String(other._id)]);
  expect([...(await dues.blockedShops([shop._id, other._id]))]).toEqual([String(shop._id)]);

  await earn(shop._id, 30000, 'e1');
  expect((await dues.duesOf(shop._id)).isBlocked).toBe(false);
  await owe(shop._id, 50000, 'c2');
  expect((await dues.duesOf(shop._id)).duesPaise).toBe(140000);
  await expect(dues.recordPayment({ shopId: shop._id, amountPaise: 140000 })).rejects.toMatchObject({ code: 'REFERENCE_REQUIRED' });
  expect(await dues.recordPayment({ shopId: shop._id, amountPaise: 140000, reference: 'UTR998' })).toMatchObject({ duesPaise: 0, isBlocked: false });
  expect((await approvedProviders('cleaning')).length).toBe(2);
  expect((await dues.owingShops()).find((r) => r.shopId === String(shop._id))).toBeUndefined();
});

test('the same payment reference cannot be recorded twice', async () => {
  const shop = await Shop.create({ phone: '9822200003', businessName: 'Twice Co', ownerName: 'C' });
  await owe(shop._id, 20000, 'c3');
  await dues.recordPayment({ shopId: shop._id, amountPaise: 20000, reference: 'UTR1' });
  await expect(dues.recordPayment({ shopId: shop._id, amountPaise: 20000, reference: 'UTR1' })).rejects.toMatchObject({ code: 'DUPLICATE_REFERENCE' });
  void mongoose;
});
