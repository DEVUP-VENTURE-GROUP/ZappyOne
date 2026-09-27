/**
 * Launch scope for vehicles: roadside basics only.
 *
 * These categories need workshop-grade skills and tools, which would put an
 * unreasonable burden on the first providers we onboard. They are unpublished,
 * not deleted — Admin → Repair → <vertical> → Categories → Active re-publishes
 * one, and its problems and repairs return with it.
 *
 * The seeders only write on insert, so databases seeded earlier need this.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/repair/migrations/002-unpublish-heavy-vehicle-categories.js
 *   NODE_ENV=development node src/modules/repair/migrations/002-unpublish-heavy-vehicle-categories.js --report
 *   NODE_ENV=production  node src/modules/repair/migrations/002-unpublish-heavy-vehicle-categories.js --yes-production
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const projectRoot = path.resolve(__dirname, '../../../../');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const overlay = path.join(projectRoot, `.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });

const { ProblemCategory } = require('../models/problem.model');

const HIDE = {
  two_wheeler: ['tw_lights_controls', 'tw_cvt', 'tw_suspension_steering', 'tw_fuel', 'tw_body'],
  four_wheeler: ['fw_suspension', 'fw_adas'],
};
const scope = { $or: Object.entries(HIDE).map(([vertical, codes]) => ({ vertical, code: { $in: codes } })) };

async function report() {
  const rows = await ProblemCategory.find(scope).select('vertical code name isActive').sort({ vertical: 1, code: 1 }).lean();
  console.table(rows.map(({ vertical, code, name, isActive }) => ({ vertical, code, name, published: isActive })));
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = (uri.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'unknown';

  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error(`[unpublish-vehicle] refusing to touch PRODUCTION database "${dbName}" without --yes-production`);
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[unpublish-vehicle] connected to: ${dbName}\n`);

  if (!process.argv.includes('--report')) {
    const res = await ProblemCategory.updateMany({ ...scope, isActive: true }, { $set: { isActive: false } });
    console.log(`[unpublish-vehicle] unpublished ${res.modifiedCount} categor${res.modifiedCount === 1 ? 'y' : 'ies'}\n`);
  }
  await report();
  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[unpublish-vehicle] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main, HIDE };
