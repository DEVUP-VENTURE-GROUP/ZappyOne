/**
 * Idempotent seeder for device models and laptop families.
 *
 * Same discipline as the other seeders: `$setOnInsert` for anything an operator
 * might have edited, `$set` only for the structural links that must stay
 * correct (brand, family, vertical). Safe to re-run — it is how new models
 * reach an existing deployment.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/repair/seed/run-model-seed.js
 *   NODE_ENV=development node src/modules/repair/seed/run-model-seed.js --report
 *   NODE_ENV=production  node src/modules/repair/seed/run-model-seed.js --yes-production
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Env loaded the way src/config/index.js does — base .env then the overlay.
const projectRoot = path.resolve(__dirname, '../../../../');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const overlayPath = path.join(projectRoot, `.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlayPath)) {
  require('dotenv').config({ path: overlayPath, override: true });
}

const Brand = require('../../service/brand.model');
const DeviceModel = require('../../service/device-model.model');
const { ProductFamily } = require('../models/catalog.model');
const { MOBILE_MODELS, LAPTOP_MODELS, LAPTOP_FAMILIES, toCode } = require('./device-models.seed');

async function seedFamilies() {
  let created = 0;
  let orphaned = 0;

  for (const f of LAPTOP_FAMILIES) {
    const brand = await Brand.findOne({ code: f.brand, category: 'laptop' }).lean();
    if (!brand) { orphaned++; continue; }

    const res = await ProductFamily.updateOne(
      { vertical: 'laptop', brandCode: f.brand, code: f.code },
      {
        $set: { productTypeCode: f.type },
        $setOnInsert: {
          name: f.name,
          isPopular: !!f.popular,
          displayOrder: 0,
          isActive: true,
          isArchived: false,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }

  return { total: LAPTOP_FAMILIES.length, created, orphaned };
}

async function seedModels(rows, vertical) {
  let created = 0;
  let orphaned = 0;

  for (const m of rows) {
    const brand = await Brand.findOne({ code: m.brand, category: vertical }).lean();
    if (!brand) { orphaned++; continue; }

    const code = toCode(m.brand, m.name);
    const res = await DeviceModel.updateOne(
      { code },
      {
        // Structural links stay correct even if someone renamed the model.
        $set: {
          brandId: brand._id,
          brandCode: brand.code,
          vertical,
          ...(m.family ? { familyCode: m.family } : {}),
        },
        $setOnInsert: {
          name: m.name,
          seriesName: m.series || '',
          // Only set when we actually know it — the schema's default is the
          // current year, and a guessed year sorts the list wrongly.
          ...(m.year ? { launchYear: m.year } : {}),
          storageVariants: m.storage || [],
          ramVariants: m.ram || [],
          isActive: true,
          // Position in the curated list. Sorting is `sortOrder, launchYear desc`,
          // so leaving this at 0 for everything threw the whole list back on
          // launchYear — which these rows deliberately do not carry.
          sortOrder: m.sortOrder || 0,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }

  return { total: rows.length, created, orphaned };
}

async function report() {
  const [mobile, laptop, families] = await Promise.all([
    DeviceModel.countDocuments({ vertical: 'mobile', isActive: true }),
    DeviceModel.countDocuments({ vertical: 'laptop', isActive: true }),
    ProductFamily.countDocuments({ vertical: 'laptop', isActive: true }),
  ]);
  return [{ mobileModels: mobile, laptopModels: laptop, laptopFamilies: families }];
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = uri.split('/').pop().split('?')[0];

  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error(`[model-seed] refusing to seed PRODUCTION database "${dbName}" without --yes-production`);
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[model-seed] connected to database: ${dbName}`);

  if (process.argv.includes('--report')) {
    console.table(await report());
    await mongoose.disconnect();
    return;
  }

  const results = {
    laptopFamilies: await seedFamilies(),
    mobileModels: await seedModels(MOBILE_MODELS, 'mobile'),
    laptopModels: await seedModels(LAPTOP_MODELS, 'laptop'),
  };

  for (const [name, r] of Object.entries(results)) {
    console.log(`[model-seed] ${name.padEnd(15)} created ${String(r.created).padStart(3)} / ${r.total}`);
    if (r.orphaned) console.warn(`[model-seed]   ! ${r.orphaned} skipped — brand not in the catalog`);
  }

  console.log('\n[model-seed] final state:');
  console.table(await report());
  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[model-seed] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main, report, seedFamilies, seedModels };
