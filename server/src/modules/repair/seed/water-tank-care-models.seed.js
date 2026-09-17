/**
 * Water & Tank Care "model" catalog — CAPACITY, scoped per tank type.
 *
 * The model tier is repurposed for capacity rather than a device model,
 * because capacity is the second thing every customer identifies about their
 * tank ("it's an overhead tank, about 1,000 litres") — exactly the depth the
 * model tier already captures for every other vertical. Provider pricing is
 * scoped by brandCode (tank type) + modelCode (capacity), so "cleaning an
 * overhead tank under 500 L" and "cleaning a 5,000 L apartment tank" are
 * correctly two different priced jobs, with zero new pricing mechanism.
 *
 * §5 requires "I don't know" to be a real path, not an edge case bolted on
 * later — so `unknown_capacity` is seeded on every tank type, not just left
 * for the client to handle specially.
 *
 * §21's research figures are reference numbers, not seeded here (see the
 * note in water-tank-care.seed.js) — this file only defines WHICH capacities
 * exist per tank type; a provider prices each one themselves.
 */

const VERTICAL = 'water_tank_care';

const OVERHEAD = 'overhead', SINTEX = 'sintex_plastic', RCC = 'rcc_concrete',
  SUMP = 'underground_sump', APARTMENT = 'apartment_common', OTHER_TANK = 'other_tank';

/** `M(tankType, name)` — the code is derived, never hand-written. */
const M = (brandCode, name) => ({ brandCode, name });

/** Overhead / Sintex / RCC share the same domestic capacity ladder (§21). */
const DOMESTIC_CAPACITIES = [
  'Up to 500 L', '500 – 1,000 L', '1,000 – 2,000 L', '2,000 – 5,000 L', 'Above 5,000 L',
];

/** Sumps and society tanks run larger (§21). */
const LARGE_CAPACITIES = [
  'Up to 2,000 L', '2,000 – 5,000 L', '5,000 – 10,000 L', 'Above 10,000 L',
];

const MODELS = [
  ...DOMESTIC_CAPACITIES.map((c) => M(OVERHEAD, c)),
  ...DOMESTIC_CAPACITIES.map((c) => M(SINTEX, c)),
  ...DOMESTIC_CAPACITIES.map((c) => M(RCC, c)),
  ...LARGE_CAPACITIES.map((c) => M(SUMP, c)),
  ...LARGE_CAPACITIES.map((c) => M(APARTMENT, c)),
  // "Other / Not sure" tank type only ever pairs with unknown capacity below —
  // there is no ladder to offer someone who does not know their tank type.
];

// Every tank type, including "Other", gets an escape hatch — §5's mandated
// "I don't know" path, and the entry point for §6 Step 3 (upload a photo /
// request an inspection instead of guessing).
for (const type of [OVERHEAD, SINTEX, RCC, SUMP, APARTMENT, OTHER_TANK]) {
  MODELS.push(M(type, 'Not sure / Unknown capacity'));
}

/** `overhead` + `Up to 500 L` → `overhead-up-to-500-l`. Stable and readable. */
function toCode(brandCode, name) {
  return `${brandCode}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { VERTICAL, MODELS, toCode };
