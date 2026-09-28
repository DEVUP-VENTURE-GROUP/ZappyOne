/**
 * Seeds default subscription plans if none exist.
 * Called once at server startup after MongoDB connects.
 */

const Plan = require('./plan.model');
const logger = require('../../core/logger');

const DEFAULT_PLANS = [
  // User plans
  {
    code: 'ZAPPY_BASIC',
    name: 'Zappy Basic',
    description: 'Enjoy zero platform fees on every booking.',
    audience: 'user',
    priceInPaise: 4900,       // ₹49
    durationDays: 30,
    trialDays: 0,
    sortOrder: 1,
    effects: {
      waivePlatformFee: true,
    },
  },
  {
    code: 'ZAPPY_PREMIUM',
    name: 'Zappy Premium',
    description: 'The best of Zappy — zero surge, zero platform fees, and priority workers.',
    audience: 'user',
    priceInPaise: 14900,      // ₹149
    durationDays: 30,
    trialDays: 7,
    sortOrder: 2,
    effects: {
      surgeCap: 1.0,            // no surge ever
      waivePlatformFee: true,
      priorityAssignment: true,
    },
  },

  // Worker plans
  {
    code: 'PARTNER_STARTER',
    name: 'Partner Starter',
    description: 'Lower commission and a visibility boost to get more jobs.',
    audience: 'worker',
    priceInPaise: 9900,       // ₹99
    durationDays: 30,
    trialDays: 0,
    sortOrder: 1,
    effects: {
      commissionDelta: -0.03,   // 3pp lower commission
      proBoost: 5,              // +5 priority score in dispatch
    },
  },
  {
    code: 'PARTNER_PRO',
    name: 'Partner Pro',
    description: 'Maximum earnings — lowest commission, 1.5× job offers, and Pro badge.',
    audience: 'worker',
    priceInPaise: 19900,      // ₹199
    durationDays: 30,
    trialDays: 3,
    sortOrder: 2,
    effects: {
      commissionDelta: -0.07,   // 7pp lower commission
      proBoost: 12,
      visibilityMultiplier: 1.5,
    },
  },
];

async function seedPlans() {
  const count = await Plan.countDocuments();
  if (count > 0) return; // already seeded

  await Plan.insertMany(DEFAULT_PLANS);
  logger.info({ count: DEFAULT_PLANS.length }, '[SEED] Default subscription plans inserted');
}

module.exports = { seedPlans };
