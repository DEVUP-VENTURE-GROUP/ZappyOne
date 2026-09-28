/**
 * Helping Services — starting configuration (§21, §33).
 *
 * THESE ARE STARTING VALUES, NOT MARKET PRICES. Every field here is edited
 * from admin without a deploy — this file only decides what exists on day
 * one for an operator to tune against real completed tasks, exactly as §21
 * asks for. Reasoned from the same kind of local errand/task pricing used
 * elsewhere on the platform (a short local trip runs a base fee in the
 * ₹60–100 range with a per-km add-on), not measured against a specific
 * competitor.
 */

const inr = (rupees) => Math.round(rupees * 100);

const SHOPPING_CONFIG = {
  serviceType: 'shopping',
  baseFeePaise: inr(60),
  distanceSlabs: [
    { fromKm: 0, toKm: 2, feePaise: inr(0) },
    { fromKm: 2, toKm: 5, feePaise: inr(25) },
    { fromKm: 5, toKm: 10, feePaise: inr(50) },
    // Past 10 km this is a quote, not an auto-price — see distanceFeeFor.
    { fromKm: 10, toKm: null, feePaise: 0, requiresQuote: true },
  ],
  freeWaitingMinutes: 10,
  waitingPerMinutePaise: inr(2),
  includedStops: 1,
  additionalStopFeePaise: inr(20),
  maxStops: 3,
  timeExtensionBlockMinutes: 30,
  timeExtensionFeePaise: inr(25),
  specialHandlingFeePaise: inr(30),
  commissionPct: 15,
  platformFeePaise: inr(5),
  taxPct: 0,
  allowedPaymentModels: ['worker_advance', 'prepaid_wallet'],
  maxWorkerAdvancePaise: inr(1000),
  maxItemBudgetPaise: inr(10000),
  priceTolerancePct: 0,
  maxItems: 20,
  defaultDurationMinutes: 45,
  restrictedItemCategories: ['alcohol', 'tobacco', 'weapon', 'firearm', 'prescription medicine', 'controlled substance'],
  disclaimer: "ZappyOne's helper buys only what you approve, at the price you approved. Anything different is confirmed with you first.",
};

const PICKUP_CONFIG = {
  serviceType: 'pickup',
  baseFeePaise: inr(50),
  distanceSlabs: SHOPPING_CONFIG.distanceSlabs,
  freeWaitingMinutes: 10,
  waitingPerMinutePaise: inr(2),
  includedStops: 1,
  additionalStopFeePaise: inr(20),
  maxStops: 3,
  timeExtensionBlockMinutes: 30,
  timeExtensionFeePaise: inr(20),
  specialHandlingFeePaise: inr(30),
  commissionPct: 15,
  platformFeePaise: inr(5),
  taxPct: 0,
  allowedPaymentModels: ['worker_advance'],
  maxWorkerAdvancePaise: 0,
  maxItemBudgetPaise: 0,
  priceTolerancePct: 0,
  maxItems: 10,
  defaultDurationMinutes: 30,
  restrictedItemCategories: SHOPPING_CONFIG.restrictedItemCategories,
  disclaimer: 'ZappyOne verifies only what is visible on pickup and handover — condition claims beyond that are not made.',
};

const RETURN_CONFIG = {
  serviceType: 'return',
  baseFeePaise: inr(70),
  distanceSlabs: SHOPPING_CONFIG.distanceSlabs,
  freeWaitingMinutes: 10,
  waitingPerMinutePaise: inr(2),
  includedStops: 1,
  additionalStopFeePaise: inr(25),
  maxStops: 3,
  timeExtensionBlockMinutes: 30,
  timeExtensionFeePaise: inr(25),
  specialHandlingFeePaise: inr(30),
  commissionPct: 15,
  platformFeePaise: inr(5),
  taxPct: 0,
  allowedPaymentModels: ['worker_advance'],
  maxWorkerAdvancePaise: 0,
  maxItemBudgetPaise: 0,
  priceTolerancePct: 0,
  maxItems: 10,
  defaultDurationMinutes: 40,
  restrictedItemCategories: SHOPPING_CONFIG.restrictedItemCategories,
  disclaimer: "ZappyOne will assist with the physical return/exchange task. Final acceptance, refund and exchange approval remain subject to the merchant's applicable policy.",
};

const EXCHANGE_CONFIG = {
  ...RETURN_CONFIG,
  serviceType: 'exchange',
  baseFeePaise: inr(90),
  defaultDurationMinutes: 60,
};

const CONFIGS = [SHOPPING_CONFIG, PICKUP_CONFIG, RETURN_CONFIG, EXCHANGE_CONFIG];

module.exports = { CONFIGS };
