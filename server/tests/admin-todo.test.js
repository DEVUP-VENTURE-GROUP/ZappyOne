// Admin to-do: counts what waits in each queue, hides empty ones, and shows each admin only the areas their role can read.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
const { ShopPayout } = require('../src/modules/shop/shop-payout');
const todo = require('../src/modules/admin/todo.service');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

test('counts waiting work, filtered by role', async () => {
  await ProviderEnrolment.create([
    { providerKind: 'individual', workerId: new mongoose.Types.ObjectId(), domainCode: 'vehicles', lineCode: 'bike_wash', status: 'pending_review' },
    { providerKind: 'individual', workerId: new mongoose.Types.ObjectId(), domainCode: 'vehicles', lineCode: 'car_wash', status: 'pending_review' },
    { providerKind: 'individual', workerId: new mongoose.Types.ObjectId(), domainCode: 'vehicles', lineCode: 'car_wash', status: 'approved' },
  ]);
  await ShopPayout.create({ shopId: new mongoose.Types.ObjectId(), amountPaise: 50000, destination: { type: 'upi', label: 'UPI', upiId: 'x@upi' } });
  const sup = await todo.forAdmin({ role: 'super_admin', isActive: true });
  expect(sup.items.find((i) => i.key === 'verification')).toMatchObject({ count: 2, tab: 'verification' });
  expect(sup.items.find((i) => i.key === 'shop_payouts')).toMatchObject({ count: 1, tab: 'money' });
  expect(sup.items.find((i) => i.key === 'disputes')).toBeUndefined();
  expect(sup.total).toBe(3);
  const support = await todo.forAdmin({ role: 'support', isActive: true });
  expect(support.items.find((i) => i.key === 'shop_payouts')).toBeUndefined();
});
