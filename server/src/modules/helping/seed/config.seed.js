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
  commissionPct: 10,
  platformFeePaise: inr(10),
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
  commissionPct: 10,
  platformFeePaise: inr(10),
  taxPct: 0,
  allowedPaymentModels: ['worker_advance'],
  maxWorkerAdvancePaise: 0,
  maxItemBudgetPaise: 0,
  priceTolerancePct: 0,
  maxItems: 10,
  defaultDurationMinutes: 30,
  restrictedItemCategories: SHOPPING_CONFIG.restrictedItemCategories,
  disclaimer: 'ZappyOne verifies only what is visible on pickup and handover - condition claims beyond that are not made.',
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
  commissionPct: 10,
  platformFeePaise: inr(10),
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

// Family Assist, done by ZappyOne staff. Prices set 2026-10-19: base fee is the listed price, free up to 5 km.
const NEAR = [
  { fromKm: 0, toKm: 5, feePaise: inr(0) },
  { fromKm: 5, toKm: 10, feePaise: inr(40) },
  { fromKm: 10, toKm: null, feePaise: 0, requiresQuote: true },
];
const SAFE = ['alcohol', 'tobacco', 'weapon', 'firearm', 'controlled substance'];

const assist = ({ serviceType, rupees, minutes, extraPer30, disclaimer, buys = null }) => ({
  serviceType,
  baseFeePaise: inr(rupees),
  distanceSlabs: NEAR,
  matchRadiusKm: 10,
  freeWaitingMinutes: 15,
  waitingPerMinutePaise: inr(2),
  includedStops: 1,
  additionalStopFeePaise: inr(30),
  maxStops: 3,
  timeExtensionBlockMinutes: 30,
  timeExtensionFeePaise: inr(extraPer30),
  specialHandlingFeePaise: 0,
  // Done by salaried staff: the whole fee is ZappyOne's, staff keep only tips.
  commissionPct: 100,
  platformFeePaise: inr(10),
  taxPct: 0,
  allowedPaymentModels: buys ? ['worker_advance', 'prepaid_wallet'] : ['worker_advance'],
  maxWorkerAdvancePaise: buys ? inr(buys.advance) : 0,
  maxItemBudgetPaise: buys ? inr(buys.max) : 0,
  priceTolerancePct: 0,
  maxItems: buys ? 30 : 1,
  defaultDurationMinutes: minutes,
  restrictedItemCategories: buys?.restricted || SAFE,
  disclaimer,
});

const FAMILY_ASSIST_CONFIGS = [
  assist({
    serviceType: 'grocery_run', rupees: 149, minutes: 60, extraPer30: 49,
    buys: { advance: 2000, max: 10000, restricted: [...SAFE, 'prescription medicine'] },
    disclaimer: 'Bought from your list at the price you approve, delivered and unpacked. The bill is paid at actual cost.',
  }),
  assist({
    serviceType: 'medicine', rupees: 99, minutes: 45, extraPer30: 39,
    buys: { advance: 1500, max: 5000 },
    disclaimer: 'Prescription medicines are bought only against your valid prescription. Your helper never advises on medicines.',
  }),
  assist({
    serviceType: 'parcel_drop', rupees: 99, minutes: 45, extraPer30: 39,
    disclaimer: 'Your helper drops the parcel and brings back the receipt. Delivery and refunds are the courier or merchant’s responsibility.',
  }),
  assist({
    serviceType: 'doctor_escort', rupees: 399, minutes: 120, extraPer30: 99,
    disclaimer: 'Your helper goes along, waits and brings them back. They are not medical staff and cannot make medical decisions.',
  }),
  assist({
    serviceType: 'queue_errand', rupees: 199, minutes: 60, extraPer30: 49,
    disclaimer: 'Your helper stands in line and submits the papers you give. Approval is the office’s decision.',
  }),
  assist({
    serviceType: 'elder_checkin', rupees: 149, minutes: 30, extraPer30: 99,
    disclaimer: 'A visit, medicine reminders and small chores, with an update to you. Not nursing or medical care.',
  }),
  assist({
    serviceType: 'party_helper', rupees: 599, minutes: 180, extraPer30: 99,
    disclaimer: 'Serving, clearing and cleaning during your function. No cooking and no serving alcohol.',
  }),
  assist({
    serviceType: 'puja_help', rupees: 399, minutes: 120, extraPer30: 99,
    disclaimer: 'Set-up, flowers and clean-up. Puja items are yours; your helper does not perform the puja.',
  }),
];

const CONFIGS = [SHOPPING_CONFIG, PICKUP_CONFIG, RETURN_CONFIG, EXCHANGE_CONFIG, ...FAMILY_ASSIST_CONFIGS];

module.exports = { CONFIGS };
