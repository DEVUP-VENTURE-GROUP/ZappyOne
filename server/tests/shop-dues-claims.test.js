// A shop reports paying its dues with a reference; admin confirms it once against the same ledger entry, or rejects it; duplicates and floods are refused.
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
let dues; let Shop; let DuesClaim;
beforeAll(async () => {
  await startMongo();
  dues = require('../src/modules/shop/shop-dues');
  Shop = require('../src/modules/shop/shop.model');
  ({ DuesClaim } = require('../src/modules/worker/worker-dues.service'));
});
afterAll(stopMongo);

test('claim, confirm once, refuse duplicates', async () => {
  const shop = await Shop.create({ businessName: 'Ravi Repairs', ownerName: 'Ravi', phone: '9000000501' });
  await expect(dues.claimPayment({ shopId: shop._id, amountPaise: 50000, reference: '' })).rejects.toMatchObject({ code: 'REFERENCE_REQUIRED' });
  const claim = await dues.claimPayment({ shopId: shop._id, amountPaise: 50000, reference: 'UPI-778899' });
  await expect(dues.claimPayment({ shopId: shop._id, amountPaise: 50000, reference: 'UPI-778899' })).rejects.toMatchObject({ code: 'DUPLICATE_REFERENCE' });
  expect((await dues.duesOf(shop._id)).claims[0]).toMatchObject({ reference: 'UPI-778899', status: 'pending' });

  await dues.recordPayment({ shopId: shop._id, claimId: claim._id, adminId: null });
  expect((await DuesClaim.findById(claim._id).lean()).status).toBe('confirmed');
  await expect(dues.recordPayment({ shopId: shop._id, claimId: claim._id, adminId: null })).rejects.toMatchObject({ code: 'CLAIM_CLOSED' });
  const Transaction = require('../src/modules/payment/transaction.model');
  expect(await Transaction.countDocuments({ 'metadata.shopId': String(shop._id), 'metadata.reference': 'UPI-778899' })).toBe(1);
});

test('a claim belongs to exactly one worker or one shop', async () => {
  await expect(DuesClaim.create({ amountPaise: 1000 })).rejects.toThrow(/one worker or one shop/);
});
