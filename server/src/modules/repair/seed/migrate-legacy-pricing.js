/**
 * Migrate legacy ServiceVariant rows into ZappyReferencePricing.
 *
 * The old `servicevariants` collection holds real, hand-tuned prices — 147 rows
 * of model-specific part and labour costs that took work to gather. Deleting
 * the old mobile catalog without carrying these across would throw that away,
 * so this runs BEFORE any cleanup.
 *
 * Two shape differences have to be reconciled:
 *
 *   SERVICE → REPAIR. Old codes conflated symptom and repair (`screen_
 *   replacement`, `green_line_diagnosis`). SERVICE_TO_REPAIR maps each onto the
 *   new repair catalog; anything unmapped is REPORTED, never silently dropped.
 *
 *   PRICE → BAND. The old model stored one number; the new one stores
 *   min/recommended/max because admin needs something to judge a provider quote
 *   against. The legacy figure becomes `recommended`, with a band derived around
 *   it — a starting point an admin can tighten, not an invented precision.
 *
 * Idempotent: rows already migrated are skipped, so it is safe to re-run.
 *
 * Usage:
 *   node src/modules/repair/seed/migrate-legacy-pricing.js --dry-run
 *   node src/modules/repair/seed/migrate-legacy-pricing.js
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const projectRoot = path.resolve(__dirname, '../../../../');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const overlayPath = path.join(projectRoot, `.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlayPath)) require('dotenv').config({ path: overlayPath, override: true });

const ServiceVariant = require('../../service/service-variant.model');
const { ZappyReferencePricing } = require('../models/pricing.model');
const { Repair } = require('../models/repair.model');

/**
 * Old service code → new repair code.
 *
 * Several old codes were symptoms rather than repairs; they map onto the repair
 * a technician would actually perform. `green_line_diagnosis` is the clearest
 * case — it described what the customer sees, and the work is a panel swap.
 */
const SERVICE_TO_REPAIR = {
  screen_replacement: 'display_assembly_replacement',
  glass_replacement: 'glass_replacement',
  touch_digitizer_repair: 'touch_digitizer_repair',
  green_line_diagnosis: 'display_assembly_replacement',
  battery_replacement: 'battery_replacement',
  charging_issue: 'charging_port_repair',
  wireless_charging_repair: 'wireless_charging_repair',
  speaker_mic_issue: 'speaker_replacement',
  microphone_issue: 'microphone_repair',
  mic_repair: 'microphone_repair',
  camera_issue: 'camera_replacement',
  camera_replacement: 'camera_replacement',
  back_glass_replacement: 'back_glass_replacement',
  button_flex_repair: 'button_flex_repair',
  power_ic_repair: 'power_ic_repair',
  motherboard_repair: 'motherboard_repair',
  software_issue: 'software_flash',
  data_recovery: 'data_recovery',
  water_damage: 'liquid_damage_treatment',
  water_damage_check: 'liquid_damage_treatment',
  device_not_turning_on: 'power_ic_repair',
  port_cleaning: 'port_cleaning',
};

/**
 * Old quality tier → new quality code.
 *
 * "Compatible" and "Budget" both collapse to `standard`: the old tiers were not
 * consistently applied, and claiming a finer distinction than the data supports
 * would be inventing precision.
 */
const TIER_TO_QUALITY = {
  OEM: 'oem',
  Premium: 'premium',
  Compatible: 'standard',
  Budget: 'standard',
};

/** Band width around the legacy figure. Deliberately wide — admin narrows it. */
const BAND_BELOW = 0.9;
const BAND_ABOVE = 1.15;

async function run({ dryRun = false } = {}) {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = (uri.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'unknown';

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[migrate] database: ${dbName}${dryRun ? '  (DRY RUN — nothing will be written)' : ''}`);

  const variants = await ServiceVariant.find({}).lean();
  console.log(`[migrate] legacy servicevariants found: ${variants.length}`);

  // Only map onto repairs that actually exist, so a typo cannot create a
  // reference price for a repair nobody can book.
  const repairCodes = new Set((await Repair.find({}).select('code').lean()).map((r) => r.code));

  const stats = {
    migrated: 0, skippedExisting: 0, invalid: 0,
    mappable: 0, blockedOnCatalog: 0,
    unmappedService: [], missingRepair: [],
  };

  for (const v of variants) {
    const repairCode = SERVICE_TO_REPAIR[v.serviceCode];
    if (!repairCode) {
      // Almost always another vertical (laptop/car/bike) — not an error here.
      if (!stats.unmappedService.includes(v.serviceCode)) stats.unmappedService.push(v.serviceCode);
      continue;
    }
    stats.mappable++;

    if (!repairCodes.has(repairCode)) {
      // The repair catalog has not been seeded in this database yet. Refuse to
      // create a price pointing at a repair nobody can book.
      stats.blockedOnCatalog++;
      if (!stats.missingRepair.includes(repairCode)) stats.missingRepair.push(repairCode);
      continue;
    }

    const qualityCode = TIER_TO_QUALITY[v.qualityTier] || 'standard';
    const recommended = v.totalPricePaise;
    if (!recommended || recommended <= 0) { stats.invalid++; continue; }

    const scope = {
      repairCode,
      brandCode: v.brandCode || null,
      modelCode: v.modelCode || null,
      qualityCode,
      serviceMode: null,
      cityCode: null,
    };

    const exists = await ZappyReferencePricing.findOne({ ...scope, supersededAt: null }).lean();
    if (exists) { stats.skippedExisting++; continue; }

    if (!dryRun) {
      await ZappyReferencePricing.create({
        vertical: 'mobile',
        ...scope,
        minPaise: Math.round(recommended * BAND_BELOW),
        recommendedPaise: recommended,
        maxPaise: Math.round(recommended * BAND_ABOVE),
        partCostPaise: v.partPricePaise || 0,
        labourPaise: v.laborPricePaise || 0,
        warrantyDays: v.warrantyDays || 0,
        note: `Migrated from ServiceVariant ${v._id} (${v.serviceCode}/${v.qualityTier})`,
      });
    }
    stats.migrated++;
  }

  console.log('');
  console.log(`[migrate] mobile rows mappable: ${stats.mappable} of ${variants.length}`);
  console.log(`[migrate] migrated:             ${stats.migrated}`);
  console.log(`[migrate] skipped (exists):     ${stats.skippedExisting}`);
  console.log(`[migrate] blocked (no catalog): ${stats.blockedOnCatalog}`);
  console.log(`[migrate] invalid price:        ${stats.invalid}`);

  if (stats.unmappedService.length) {
    console.log(`\n[migrate] not mobile — skipped by design (${stats.unmappedService.length} codes):`);
    stats.unmappedService.forEach((c) => console.log(`[migrate]     ${c}`));
  }
  if (stats.missingRepair.length) {
    console.warn(`\n[migrate] ! repair catalog missing in this database — run the seed first:`);
    console.warn(`[migrate]   NODE_ENV=<env> node src/modules/repair/seed/run-seed.js`);
    stats.missingRepair.forEach((c) => console.warn(`[migrate]     needs: ${c}`));
  }

  const total = await ZappyReferencePricing.countDocuments({ supersededAt: null });
  console.log(`\n[migrate] active reference prices now: ${total}`);

  await mongoose.disconnect();
  return stats;
}

if (require.main === module) {
  run({ dryRun: process.argv.includes('--dry-run') })
    .then(() => process.exit(0))
    .catch((err) => { console.error('[migrate] failed:', err.message); process.exit(1); });
}

module.exports = { run, SERVICE_TO_REPAIR, TIER_TO_QUALITY };
