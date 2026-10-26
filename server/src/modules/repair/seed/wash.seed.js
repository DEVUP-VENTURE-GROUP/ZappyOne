// Fixed-price package services as data on the repair engine (washes, home services): the type fills the brand slot, one model per type (the flow skips it), each package is priced per type by admin reference price.
const D = 'doorstep';

const toCode = (brandCode, name) => `${brandCode}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const inr = (rupees) => Math.round(rupees * 100);

const WASH_QA = [
  { code: 'before_after_photos', label: 'Before and after photos taken', required: true },
  { code: 'no_marks_left', label: 'No soap marks or streaks left on paint or glass', required: true },
  { code: 'area_clean', label: 'Parking area left clean', required: true },
];

function packageVertical({ vertical, prefix, label, types, packages, skill = { name: 'Washer', description: 'Trained in waterless, foam and polish washes' }, qa = WASH_QA, group = 'washes', qaCode = 'wash' }) {
  const BRANDS = types.map((t, i) => ({ code: `${prefix}_${t.code}`, name: t.name, sortOrder: i + 1 }));
  const CATEGORY = `${prefix}_${group}`;
  const PROBLEM_CATEGORIES = [{ code: CATEGORY, name: `Choose your ${label.toLowerCase()}`, icon: 'sparkles', displayOrder: 1 }];
  const PROBLEMS = packages.map((p, i) => ({
    code: `${prefix}_${p.code}_req`, name: p.name, categoryCode: CATEGORY,
    candidateRepairCodes: [`${prefix}_${p.code}`], isPopular: true, displayOrder: i + 1,
  }));
  const REPAIRS = packages.map((p) => ({
    code: `${prefix}_${p.code}`, name: p.name, pricingMode: 'fixed', minSkillLevel: 1, modes: [D], durationMin: p.minutes, warrantyDays: 0,
  }));
  const SKILL_LEVELS = [{ level: 1, name: skill.name, description: skill.description, requiresVerification: false }];
  const QA_CHECKLISTS = [{
    code: `${prefix}_${qaCode}_standard`, name: `${label} QA`, stage: 'after', repairCodes: REPAIRS.map((r) => r.code),
    items: qa,
  }];
  const MODELS = BRANDS.map((b) => ({ brandCode: b.code, name: types.find((t) => `${prefix}_${t.code}` === b.code).name }));
  const PRICING = packages.flatMap((p) => types.map((t) => {
    const price = inr(p.prices[t.code]);
    return { repair: `${prefix}_${p.code}`, brand: `${prefix}_${t.code}`, model: null, min: price, typical: price, max: price, warranty: 0 };
  }));
  return {
    data: { VERTICAL: vertical, PRODUCT_TYPES: [], BRANDS, PROBLEM_CATEGORIES, PROBLEMS, REPAIRS, SKILL_LEVELS, QA_CHECKLISTS },
    models: { VERTICAL: vertical, MODELS, toCode },
    PRICING,
  };
}

// Prices checked 2026-10-19: about ₹300 a basic foam car wash, ₹499 a doorstep foam wash with interior (DriveU), ₹299 a basic doorstep bike wash. Admin can change any of them.
const washVertical = packageVertical;

const BIKE = washVertical({
  vertical: 'bike_wash', prefix: 'bw', label: 'Bike wash',
  types: [{ code: 'scooter', name: 'Scooter' }, { code: 'bike', name: 'Bike' }, { code: 'big_bike', name: 'Big bike (350cc+)' }],
  packages: [
    { code: 'quick', name: 'Quick wash (waterless wipe)', minutes: 20, prices: { scooter: 99, bike: 129, big_bike: 159 } },
    { code: 'foam', name: 'Foam wash', minutes: 40, prices: { scooter: 199, bike: 229, big_bike: 279 } },
    { code: 'foam_polish', name: 'Foam wash + polish', minutes: 60, prices: { scooter: 349, bike: 399, big_bike: 449 } },
  ],
});

const CAR = washVertical({
  vertical: 'car_wash', prefix: 'cw', label: 'Car wash',
  types: [{ code: 'hatchback', name: 'Hatchback' }, { code: 'sedan', name: 'Sedan' }, { code: 'suv', name: 'SUV' }],
  packages: [
    { code: 'exterior', name: 'Exterior wash (waterless)', minutes: 40, prices: { hatchback: 299, sedan: 349, suv: 399 } },
    { code: 'foam_vacuum', name: 'Foam wash + inside vacuum', minutes: 75, prices: { hatchback: 499, sedan: 599, suv: 699 } },
    { code: 'full_clean', name: 'Full clean (foam, interior, dashboard, mats, glass, tyre shine)', minutes: 120, prices: { hatchback: 799, sedan: 899, suv: 999 } },
  ],
});

module.exports = { BIKE, CAR, toCode, packageVertical };
