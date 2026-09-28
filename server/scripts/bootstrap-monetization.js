/**
 * Bootstrap default plans and initial active pricing config.
 * Idempotent: re-running upserts.
 *
 *   node scripts/bootstrap-monetization.js
 */
require('dotenv').config();
const { connectMongo } = require('../src/config/mongo');
const Plan = require('../src/models/Plan');
const PricingConfig = require('../src/models/PricingConfig');

const PLANS = [
  {
    code: 'USER_PREMIUM',
    name: 'QuickFix Premium',
    description: 'Skip surge pricing, no platform fees, priority assignment',
    audience: 'user',
    priceInPaise: 9900, // ₹99
    durationDays: 30,
    effects: {
      surgeCap: 1.0,         // No surge ever
      waivePlatformFee: true,
      priorityAssignment: true,
    },
    sortOrder: 1,
  },
  {
    code: 'WORKER_PRO',
    name: 'QuickFix Pro Partner',
    description: '5% lower commission, higher visibility in matching',
    audience: 'worker',
    priceInPaise: 19900, // ₹199
    durationDays: 30,
    effects: {
      commissionDelta: -0.05,  // 20% → 15%
      proBoost: 2.0,           // subtracted from match score
      visibilityMultiplier: 1.5,
    },
    sortOrder: 1,
  },
];

(async () => {
  await connectMongo();

  for (const p of PLANS) {
    await Plan.findOneAndUpdate({ code: p.code }, p, { upsert: true });
    console.log(`Plan upserted: ${p.code}  (₹${p.priceInPaise / 100}/mo)`);
  }

  // Initial pricing config (only if none exist)
  const existing = await PricingConfig.findOne({ isActive: true });
  if (!existing) {
    await PricingConfig.create({
      version: 1,
      baseFeePaise: 4000,
      perKmFeePaise: 1200,
      perMinFeePaise: 200,
      platformFeePaise: 1000,
      minFarePaise: 6000,
      surgeEnabled: true,
      surgeMaxCap: 2.5,
      commissionRate: 0.30,
      serviceOverrides: [
        { service: 'helper', multiplier: 0.9 },
        { service: 'plumbing', multiplier: 1.2 },
        { service: 'electrical', multiplier: 1.2 },
        { service: 'carpenter', multiplier: 1.3 },
        { service: 'ac_repair', multiplier: 1.5 },
        { service: 'cleaning', multiplier: 1.0 },
        { service: 'painting', multiplier: 1.4 },
      ],
      isActive: true,
      notes: 'Initial bootstrap config',
    });
    console.log('Pricing config v1 created');
  } else {
    console.log(`Pricing config v${existing.version} already active — skipping.`);
  }

  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
