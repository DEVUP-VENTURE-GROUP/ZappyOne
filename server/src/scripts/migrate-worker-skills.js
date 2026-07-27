/**
 * Migrate existing workers from the legacy COARSE skill vocabulary to the live
 * per-service dispatch codes.
 *
 * Background: dispatch matches a worker to an order by exact `order.service` code
 * equality against `worker.skills`. The worker portal used to offer ~30 coarse,
 * hand-maintained skill ids (e.g. `puncture`, `helper`) that drifted out of sync
 * with the catalog — most no longer equal any live service code, so those workers
 * silently stopped matching. This rewrites each worker's `skills` to real codes.
 *
 * Strategy (conservative — never invents a code, never guesses beyond intent):
 *   1. Any skill that IS already a live service code is kept as-is.
 *   2. A curated LEGACY_MAP fans each coarse skill out to the specific live codes
 *      that clearly share its intent (narrow: a car-wash worker gets wash/detailing
 *      codes, NOT engine repair). Category-wide expansions are used only where the
 *      coarse skill genuinely meant "the whole vertical" (electrical, plumbing…).
 *   3. Candidates are intersected with the live catalog, so only real codes land.
 *   4. Coarse skills with no live equivalent are dropped; if that empties a worker,
 *      they're reported as "needs re-pick" (safe — no wrong dispatch, they simply
 *      re-select in the redesigned portal).
 *
 * Usage:
 *   node src/scripts/migrate-worker-skills.js           # dry run (report only)
 *   node src/scripts/migrate-worker-skills.js --apply    # write changes + resync Redis
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const ServiceCatalog = require('../modules/service/service-catalog.model');
const Worker = require('../modules/worker/worker.model');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/hyperlocal';
const APPLY = process.argv.includes('--apply');

// Category matchers mirror client/src/lib/serviceCatalogGroups.js so migration and
// the portal agree on what "the whole vertical" means. First match wins.
const GROUP_MATCH = [
  ['mobile',     (s) => s.category === 'mobile'],
  ['laptop',     (s) => s.category === 'laptop' || s.code?.startsWith('laptop_')],
  ['car',        (s) => s.category === 'car' || s.code?.startsWith('car_') || s.code === 'periodic_car_service'],
  ['bike',       (s) => s.category === 'bike' || s.code?.startsWith('bike_')],
  ['event',      (s) => s.code?.startsWith('event_')],
  ['pet',        (s) => s.category === 'pet' || s.code?.startsWith('pet_')],
  ['family',     (s) => s.category === 'helper'],
  ['smart',      (s) => s.category === 'other'],
  ['appliance',  (s) => s.category === 'appliance'],
  ['electrical', (s) => s.category === 'electrical'],
  ['plumbing',   (s) => s.category === 'plumbing'],
  ['carpentry',  (s) => s.category === 'carpentry'],
  ['cleaning',   (s) => s.category === 'cleaning'],
  ['commercial', (s) => s.category === 'vehicle'],
];

function groupKey(svc) {
  const g = GROUP_MATCH.find(([, m]) => m(svc));
  return g ? g[0] : 'other_services';
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log(`\n[migrate-worker-skills] ${APPLY ? 'APPLY' : 'DRY RUN'} — connected to Mongo\n`);

  const catalog = await ServiceCatalog.find({ isActive: true }).select('code category').lean();
  const liveCodes = new Set(catalog.map((s) => s.code));
  const codesByGroup = {};
  for (const s of catalog) (codesByGroup[groupKey(s)] ||= []).push(s.code);

  const pick = (...codes) => codes.filter((c) => liveCodes.has(c));
  const grp  = (key) => codesByGroup[key] || [];

  // Legacy coarse skill -> live service codes. `() =>` so category expansions read
  // the live catalog. Anything not listed and not itself a live code is dropped.
  const LEGACY_MAP = {
    // Vehicle — narrow intent
    puncture:              () => pick('bike_puncture', 'car_puncture', 'puncture'),
    minor_roadside_repair: () => pick('minor_roadside_repair', 'bike_breakdown', 'car_breakdown'),
    car_wash:              () => pick('car_wash', 'car_foam_wash_detailing', 'car_detailing'),
    bike_wash:             () => pick('bike_wash', 'bike_foam_wash'),
    // battery_jump_start / fuel_delivery / car_towing / bike_towing are already live codes (kept in step 1)

    // Phone repair — map each coarse fault to its live variants
    screen_replacement:    () => pick('screen_replacement', 'glass_replacement', 'back_glass_replacement', 'touch_digitizer_repair'),
    battery_replacement:   () => pick('battery_replacement'),
    charging_issue:        () => pick('charging_issue', 'wireless_charging_repair'),
    speaker_mic_issue:     () => pick('speaker_mic_issue', 'mic_repair', 'microphone_issue'),
    software_issue:        () => pick('software_issue', 'data_recovery'),
    water_damage_check:    () => pick('water_damage', 'water_damage_check'),

    // Home & other verticals — genuine whole-category coverage
    electrical:            () => grp('electrical'),
    plumbing:              () => grp('plumbing'),
    carpenter:             () => grp('carpentry'),
    appliance:             () => grp('appliance'),
    cleaning:              () => grp('cleaning'),
    tank_cleaning:         () => pick('water_tank_cleaning', 'overhead_tank_cleaning', 'underground_sump_cleaning', 'sintex_tank_cleaning'),
    internet:              () => pick('router_setup', 'router_troubleshoot'),
    helper:                () => grp('family'),
    // Dropped (no live equivalent): ac_repair, painting, beauty, laundry,
    // gardening, security, mason, delivery.
  };

  const workers = await Worker.find({ skills: { $exists: true, $ne: [] } })
    .select('skills skillPrimary name').lean();

  let changed = 0, emptied = 0, unchanged = 0;
  const geoService = APPLY ? require('../modules/worker/geo.service') : null;

  for (const w of workers) {
    const old = w.skills || [];
    const next = new Set();
    for (const s of old) {
      if (liveCodes.has(s)) next.add(s);                 // 1. already a live code
      else if (LEGACY_MAP[s]) LEGACY_MAP[s]().forEach((c) => next.add(c)); // 2. mapped
      // else: dropped
    }
    const newSkills = [...next];

    // Remap primary: keep if still valid, else first mapped code, else null.
    let newPrimary = w.skillPrimary && next.has(w.skillPrimary) ? w.skillPrimary : null;
    if (!newPrimary && w.skillPrimary && LEGACY_MAP[w.skillPrimary]) {
      newPrimary = LEGACY_MAP[w.skillPrimary]()[0] || null;
    }

    const same = newSkills.length === old.length && old.every((s) => next.has(s));
    if (same && (newPrimary === (w.skillPrimary ?? null))) { unchanged++; continue; }

    if (newSkills.length === 0) emptied++;
    changed++;

    console.log(`• ${w.name || w._id}`);
    console.log(`    old (${old.length}): ${old.join(', ')}`);
    console.log(`    new (${newSkills.length}): ${newSkills.join(', ') || '⚠️  EMPTY — worker must re-pick in portal'}`);
    if (newPrimary !== (w.skillPrimary ?? null)) console.log(`    primary: ${w.skillPrimary ?? '—'} -> ${newPrimary ?? '—'}`);

    if (APPLY) {
      await Worker.updateOne({ _id: w._id }, { $set: { skills: newSkills, skillPrimary: newPrimary } });
      await geoService.syncSkills(w._id, old, newSkills).catch(() => {});
    }
  }

  console.log(`\n[migrate-worker-skills] ${APPLY ? 'Applied' : 'Would change'}: ${changed} worker(s) ` +
    `(${emptied} emptied → need re-pick), ${unchanged} unchanged.`);
  if (!APPLY) console.log('Re-run with --apply to write these changes.\n');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
