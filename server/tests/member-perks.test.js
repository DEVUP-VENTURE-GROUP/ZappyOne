// A customer's active plan: the platform fee and surge it waives are really waived, and only enforced perks are listed.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let app; let Subscription; let member; let pricing;
const user = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  Subscription = require('../src/modules/subscription/subscription.model');
  member = require('../src/modules/jobs/member');
  pricing = require('../src/modules/helping/services/pricing.service');
  await require('../src/modules/subscription/plan.seed').seedPlans();
});
afterAll(stopMongo);

test('no plan: nothing waived; active Premium: fee and surge waived', async () => {
  expect(await member.perks(user)).toEqual({ waivePlatformFee: false, noSurge: false });
  expect(await member.perks(null)).toEqual({ waivePlatformFee: false, noSurge: false });

  const other = new mongoose.Types.ObjectId();
  await Subscription.collection.insertOne({
    owner: { kind: 'user', id: other }, planCode: 'ZAPPY_PREMIUM', status: 'active', startAt: new Date(), endAt: new Date(Date.now() + 86400000),
    effectsSnapshot: { surgeCap: 1, waivePlatformFee: true, priorityAssignment: true },
  });
  expect(await member.perks(other)).toEqual({ waivePlatformFee: true, noSurge: true });
  const surge = await require('../src/modules/jobs/surge').quote({ kind: 'repair', line: 'mobile', lat: 17.38, lng: 78.48, basePaise: 50000, userId: other });
  expect(surge.totalPaise).toBe(0);
});

test('waivePlatformFee removes the fee from a helping charge', async () => {
  const { HelpingConfig } = require('../src/modules/helping/models/config.model');
  await HelpingConfig.create({
    serviceType: 'shopping', baseFeePaise: 8000, distanceSlabs: [{ fromKm: 0, toKm: null, feePaise: 0 }], freeWaitingMinutes: 10, waitingPerMinutePaise: 200,
    includedStops: 1, additionalStopFeePaise: 2500, maxStops: 3, commissionPct: 20, platformFeePaise: 1500, taxPct: 0,
    allowedPaymentModels: ['customer_preauth'], maxWorkerAdvancePaise: 100000, maxItemBudgetPaise: 1000000, priceTolerancePct: 0,
  });
  const plain = await pricing.quote({ serviceType: 'shopping' });
  const waived = await pricing.quote({ serviceType: 'shopping', waivePlatformFee: true });
  expect(plain.platformFeePaise).toBe(1500);
  expect(waived.platformFeePaise).toBe(0);
  expect(plain.serviceChargePaise - waived.serviceChargePaise).toBe(1500);
});

test('plans list only enforced benefits and say whether they can be bought', async () => {
  const r = await request(app).get('/api/subscriptions/plans?audience=user');
  expect(r.status).toBe(200);
  expect(typeof r.body.purchasable).toBe('boolean');
  const premium = r.body.plans.find((p) => p.code === 'ZAPPY_PREMIUM');
  expect(premium.benefits).toEqual(['No platform fee on any booking', 'No surge price, even when it is busy']);
  expect(JSON.stringify(r.body.plans.map((p) => p.benefits))).not.toMatch(/priority/i);
});
