/**
 * Migration 002 — a provider's price is unique per brand, not across brands.
 *
 * WHY
 * The unique index on provider prices left out `brandCode`. A shop that set a
 * brand-wide price for a job on Samsung could then never price the same job
 * for Apple or any other brand: the second save hit a duplicate-key error and
 * came back as a 500. Shops reported it as "I can't set my prices".
 *
 * WHAT
 * Drops the two old indexes and lets the model rebuild them with `brandCode`.
 *
 * SAFETY
 * Index-only; no documents are read or written. Adding a field to a unique key
 * only loosens it, so every existing row already satisfies the new index.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/repair/migrations/002-brand-scoped-provider-prices.js
 *   NODE_ENV=production  node src/modules/repair/migrations/002-brand-scoped-provider-prices.js --yes-production
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

const COLLECTION = 'providerpricings';
const OLD_INDEXES = [
  'shopId_1_repairCode_1_modelCode_1_qualityCode_1_serviceMode_1_cityCode_1',
  'workerId_1_repairCode_1_modelCode_1_qualityCode_1_serviceMode_1_cityCode_1',
];

async function up() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = (uri.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'unknown';

  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error(`[migrate-002] refusing to alter PRODUCTION "${dbName}" without --yes-production`);
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;
  console.log(`[migrate-002] database: ${dbName}`);

  const exists = (await db.listCollections({ name: COLLECTION }).toArray()).length > 0;
  let dropped = 0;
  if (exists) {
    const names = (await db.collection(COLLECTION).indexes()).map((i) => i.name);
    for (const name of OLD_INDEXES) {
      if (!names.includes(name)) continue;
      await db.collection(COLLECTION).dropIndex(name);
      dropped++;
      console.log(`[migrate-002] dropped ${name}`);
    }
  }

  // The model's definitions are the source of truth for the new indexes.
  const { ProviderPricing } = require('../models/pricing.model');
  await ProviderPricing.syncIndexes();

  console.log(`[migrate-002] done — ${dropped} dropped, brand-scoped indexes built`);
  await mongoose.disconnect();
  return { dropped };
}

if (require.main === module) {
  up().then(() => process.exit(0)).catch((err) => {
    console.error('[migrate-002] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { up };
