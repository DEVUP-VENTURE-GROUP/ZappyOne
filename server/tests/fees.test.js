/**
 * Fees & commission: one admin view over every line's customer fee and
 * provider commission. Edits land where each pricing engine reads them
 * (repair versioned, pet across a category's rules, helping, events), the
 * launch rule fills only unset or placeholder values, and events charge the
 * fee to the customer without the partner paying commission on it.
 */
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let fees; let RepairConfig; let PetPricingRule; let HelpingConfig; let EventConfig; let money;

beforeAll(async () => {
  await startMongo();
  fees = require('../src/modules/admin-portal/fees.service');
  money = require('../src/modules/events/event-money');
  ({ RepairConfig } = require('../src/modules/repair/models/config.model'));
  ({ PetPricingRule } = require('../src/modules/pet/models/config.model'));
  ({ HelpingConfig } = require('../src/modules/helping/models/config.model'));
  EventConfig = require('../src/modules/events/event-config.model');
});
afterAll(stopMongo);

const find = (lines, line, key) => lines.find((r) => r.line === line && r.key === key);

test('lists every line; a saved config shows what pricing really charges', async () => {
  await RepairConfig.collection.insertOne({ vertical: 'mobile', commissionPct: 10, supersededAt: null, isActive: true, version: 1 });
  await PetPricingRule.collection.insertMany([
    { categoryCode: 'pet_grooming', variantCode: null, species: null, cityCode: null, isActive: true, commissionPct: 15, platformFeePaise: 500 },
    { categoryCode: 'pet_grooming', variantCode: 'full', species: 'dog', cityCode: null, isActive: true, commissionPct: 15, platformFeePaise: 500 },
  ]);
  await HelpingConfig.collection.insertOne({ serviceType: 'shopping', isActive: true, commissionPct: 12, platformFeePaise: 0 });

  const lines = await fees.list();
  expect(find(lines, 'repair', 'mobile')).toMatchObject({ platformFeePaise: 0, commissionPct: 10, configured: true });
  expect(find(lines, 'repair', 'laptop')).toMatchObject({ platformFeePaise: 1000, commissionPct: 10, configured: false });
  expect(find(lines, 'pet', 'pet_grooming')).toMatchObject({ platformFeePaise: 500, commissionPct: 15 });
  expect(find(lines, 'helping', 'shopping')).toMatchObject({ platformFeePaise: 0, commissionPct: 12 });
  expect(find(lines, 'event', 'event')).toMatchObject({ platformFeePaise: 1000, commissionPct: 10, maxCommissionPct: 50 });
});

test('launch rule fills unset and placeholder values, keeps an operator choice', async () => {
  const preview = await fees.applyLaunchDefaults({ dryRun: true });
  expect(preview.map((c) => `${c.line}/${c.key}`).sort()).toEqual(['helping/shopping', 'pet/pet_grooming', 'repair/mobile']);
  await fees.applyLaunchDefaults();

  const lines = await fees.list();
  expect(find(lines, 'repair', 'mobile')).toMatchObject({ platformFeePaise: 1000, commissionPct: 10 });
  expect(find(lines, 'pet', 'pet_grooming')).toMatchObject({ platformFeePaise: 1000, commissionPct: 10 });
  // 12% was a choice; only the missing fee is filled.
  expect(find(lines, 'helping', 'shopping')).toMatchObject({ platformFeePaise: 1000, commissionPct: 12 });
  // Every rule of the category moves together, so no variant keeps the old deal.
  const rules = await PetPricingRule.find({ categoryCode: 'pet_grooming' }).lean();
  expect(rules.every((r) => r.platformFeePaise === 1000 && r.commissionPct === 10)).toBe(true);
  // Running it again changes nothing.
  expect(await fees.applyLaunchDefaults({ dryRun: true })).toEqual([]);
});

test('a repair edit makes a new version and keeps the old one for past bookings', async () => {
  await fees.update({ line: 'repair', key: 'mobile', platformFeePaise: 1500, adminId: null });
  const all = await RepairConfig.find({ vertical: 'mobile' }).sort({ version: 1 }).lean();
  expect(all.at(-1)).toMatchObject({ platformFeePaise: 1500, commissionPct: 10, supersededAt: null });
  expect(all.at(-2).supersededAt).toBeTruthy();
});

test('events: fee and commission saved on the single config; commission is capped', async () => {
  await fees.update({ line: 'event', key: 'event', platformFeePaise: 2000, commissionPct: 8, adminId: null });
  expect(await EventConfig.findOne({ isActive: true }).lean()).toMatchObject({ platformFeePaise: 2000, platformCommissionPct: 8 });
  await expect(fees.update({ line: 'event', key: 'event', commissionPct: 60 })).rejects.toMatchObject({ code: 'COMMISSION_TOO_HIGH' });
  await expect(fees.update({ line: 'pet', key: 'pet_unknown', platformFeePaise: 100 })).rejects.toMatchObject({ status: 404 });
});

test('event booking money: fee on top, collected with the advance, never commissioned', () => {
  const p = money.priceBooking({ startingPricePaise: 100000 }, { platformFeePaise: 1000, platformCommissionPct: 10, advancePaymentPct: 20 });
  expect(p).toMatchObject({ themePricePaise: 100000, platformFeePaise: 1000, totalPaise: 101000, advancePaise: 21000, remainingPaise: 80000 });
  expect(money.partnerNetOf(p)).toBe(90000);
  expect(money.platformTakeOf(p)).toBe(11000);
  // A booking made before the fee existed keeps its original math.
  expect(money.partnerNetOf({ totalPaise: 100000, platformCommissionPct: 12 })).toBe(88000);
});

test('tax is set per line from admin, never defaulted, and refused where a line has none', async () => {
  await fees.update({ line: 'helping', key: 'shopping', taxPct: 18, adminId: null });
  expect(find(await fees.list(), 'helping', 'shopping')).toMatchObject({ taxPct: 18 });
  expect(find(await fees.list(), 'event', 'event').taxPct).toBeNull();
  await expect(fees.update({ line: 'event', key: 'event', taxPct: 5 })).rejects.toMatchObject({ code: 'NO_TAX_ON_LINE' });
});
