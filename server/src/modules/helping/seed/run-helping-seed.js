/**
 * Seeds Helping Services pricing configuration.
 *
 * Insert-only, like every config seeder on this platform: an operator's edit
 * is a commercial decision and this never overwrites a row that already
 * exists. Re-running adds what is missing and leaves the rest alone.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/helping/seed/run-helping-seed.js
 *   NODE_ENV=production  node src/modules/helping/seed/run-helping-seed.js --yes-production
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

const { HelpingConfig } = require('../models/config.model');
const { CONFIGS } = require('./config.seed');

async function seedConfigs() {
  let created = 0;
  let skipped = 0;
  for (const cfg of CONFIGS) {
    const exists = await HelpingConfig.findOne({ serviceType: cfg.serviceType }).lean();
    if (exists) { skipped++; continue; }
    await HelpingConfig.create(cfg);
    created++;
  }
  return { total: CONFIGS.length, created, skipped };
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = uri.split('/').pop().split('?')[0];

  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error(`[helping-seed] refusing to seed PRODUCTION database "${dbName}" without --yes-production`);
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[helping-seed] connected to database: ${dbName}`);

  const result = await seedConfigs();
  console.log(`[helping-seed] config  created ${result.created} / ${result.total}`
    + (result.skipped ? `  (${result.skipped} already configured)` : ''));

  const final = await HelpingConfig.find({}).select('serviceType baseFeePaise commissionPct isActive').lean();
  console.table(final.map((c) => ({
    serviceType: c.serviceType, baseFee: `₹${c.baseFeePaise / 100}`, commission: `${c.commissionPct}%`, active: c.isActive,
  })));

  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[helping-seed] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main, seedConfigs };
