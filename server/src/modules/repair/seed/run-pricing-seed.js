/**
 * Seeds the Zappy reference bands and the platform's own fees.
 *
 * Insert-only for pricing: a band an operator has edited is a commercial
 * decision, and prices are versioned rather than overwritten (§69), so this
 * never touches a row that already exists. Re-running it adds what is new and
 * leaves the rest alone.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/repair/seed/run-pricing-seed.js
 *   NODE_ENV=development node src/modules/repair/seed/run-pricing-seed.js --report
 *   NODE_ENV=production  node src/modules/repair/seed/run-pricing-seed.js --yes-production
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const projectRoot = path.resolve(__dirname, '../../../../');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const overlayPath = path.join(projectRoot, `.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlayPath)) {
  require('dotenv').config({ path: overlayPath, override: true });
}

const { ZappyReferencePricing } = require('../models/pricing.model');
const { RepairConfig } = require('../models/config.model');
const { Repair } = require('../models/repair.model');
const {
  MOBILE_PRICING, LAPTOP_PRICING, CONFIG_DEFAULTS, WATER_TANK_CARE_PRICING,
} = require('./reference-pricing.seed');
const wtModels = require('./water-tank-care-models.seed');

async function seedBands(rows, vertical) {
  let created = 0;
  let skipped = 0;
  let orphaned = 0;

  for (const row of rows) {
    // A band for a repair that does not exist would never resolve, and would
    // quietly rot in the table.
    const repair = await Repair.findOne({ code: row.repair, vertical }).lean();
    if (!repair) { orphaned++; continue; }

    /*
     * Model-level scope, for verticals where the model tier genuinely moves
     * the price. A phone repair costs the same across a brand's range, so
     * those rows carry no model. Tank cleaning does not: capacity IS the
     * price, so water rows name one. `row.model` is given as
     * { brandCode, name } and the code is derived by the same function that
     * seeded the catalog, so a typo cannot silently orphan the band.
     */
    const modelCode = row.model
      ? wtModels.toCode(row.model.brandCode, row.model.name)
      : null;

    const filter = {
      vertical,
      repairCode: row.repair,
      brandCode: row.brand || null,
      modelCode,
      qualityCode: null,
      serviceMode: null,
      cityCode: null,
      supersededAt: null,
    };

    if (await ZappyReferencePricing.findOne(filter).lean()) { skipped++; continue; }

    await ZappyReferencePricing.create({
      ...filter,
      minPaise: row.min,
      recommendedPaise: row.typical,
      maxPaise: row.max,
      partCostPaise: row.part || 0,
      labourPaise: row.labour || 0,
      warrantyDays: row.warranty || 0,
      isActive: true,
    });
    created++;
  }

  return { total: rows.length, created, skipped, orphaned };
}

/** Platform fees, set only where an operator has not already chosen a figure. */
async function seedConfig() {
  let updated = 0;

  for (const [vertical, defaults] of Object.entries(CONFIG_DEFAULTS)) {
    const cfg = await RepairConfig.findOne({ vertical });
    if (!cfg) continue;

    let touched = false;
    for (const [key, value] of Object.entries(defaults)) {
      // Zero means "nobody has set this yet" for a fee; a deliberate zero fee
      // is expressed by editing it in admin afterwards.
      const unset = cfg[key] == null || cfg[key] === 0;
      if (typeof value === 'boolean') continue;
      if (unset) { cfg[key] = value; touched = true; }
    }

    if (touched) { await cfg.save(); updated++; }
  }

  return { total: Object.keys(CONFIG_DEFAULTS).length, created: updated };
}

async function report() {
  const [mobile, laptop, water, cfgs] = await Promise.all([
    ZappyReferencePricing.countDocuments({ vertical: 'mobile', supersededAt: null }),
    ZappyReferencePricing.countDocuments({ vertical: 'laptop', supersededAt: null }),
    ZappyReferencePricing.countDocuments({ vertical: 'water_tank_care', supersededAt: null }),
    RepairConfig.find({}).select('vertical diagnosisFeePaise').lean(),
  ]);

  return [{
    mobileBands: mobile,
    laptopBands: laptop,
    waterBands: water,
    inspectionFees: cfgs.map((c) => `${c.vertical}: ₹${(c.diagnosisFeePaise || 0) / 100}`).join(', '),
  }];
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = uri.split('/').pop().split('?')[0];

  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error(`[pricing-seed] refusing to seed PRODUCTION database "${dbName}" without --yes-production`);
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[pricing-seed] connected to database: ${dbName}`);

  if (process.argv.includes('--report')) {
    console.table(await report());
    await mongoose.disconnect();
    return;
  }

  const results = {
    mobileBands: await seedBands(MOBILE_PRICING, 'mobile'),
    laptopBands: await seedBands(LAPTOP_PRICING, 'laptop'),
    waterBands: await seedBands(WATER_TANK_CARE_PRICING, 'water_tank_care'),
    config: await seedConfig(),
  };

  for (const [name, r] of Object.entries(results)) {
    console.log(`[pricing-seed] ${name.padEnd(12)} created ${String(r.created).padStart(3)} / ${r.total}`
      + (r.skipped ? `  (${r.skipped} already priced)` : '')
      + (r.orphaned ? `  ! ${r.orphaned} unknown repair codes` : ''));
  }

  console.log('\n[pricing-seed] final state:');
  console.table(await report());
  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[pricing-seed] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main, report, seedBands, seedConfig };
