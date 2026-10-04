/**
 * Fuel delivery is on hold for launch.
 *
 * Carrying fuel to a stranded vehicle needs approved containers and a
 * process we do not run yet, so "Out of fuel" is taken off Roadside
 * Emergency for two- and four-wheelers. It is unpublished, not deleted:
 * Admin → Repair → <vertical> → Problems → Active brings it back, and the
 * fuel-delivery repair stays in the catalog for that day.
 *
 * The seeders only write on insert, so databases seeded earlier need this.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/repair/migrations/003-hold-fuel-delivery.js
 *   NODE_ENV=development node src/modules/repair/migrations/003-hold-fuel-delivery.js --report
 *   NODE_ENV=production  node src/modules/repair/migrations/003-hold-fuel-delivery.js --yes-production
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const projectRoot = path.resolve(__dirname, '../../../../');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const overlay = path.join(projectRoot, `.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });

const { Problem } = require('../models/problem.model');

const HOLD = { two_wheeler: ['tw_out_of_fuel'], four_wheeler: ['fw_out_of_fuel'] };
const scope = { $or: Object.entries(HOLD).map(([vertical, codes]) => ({ vertical, code: { $in: codes } })) };

async function report() {
  const rows = await Problem.find(scope).select('vertical code name isActive').sort({ vertical: 1 }).lean();
  console.table(rows.map(({ vertical, code, name, isActive }) => ({ vertical, code, name, published: isActive })));
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = (uri.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'unknown';
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error(`[hold-fuel] refusing to touch PRODUCTION database "${dbName}" without --yes-production`);
    process.exit(1);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[hold-fuel] connected to: ${dbName}\n`);
  if (!process.argv.includes('--report')) {
    const res = await Problem.updateMany({ ...scope, isActive: true }, { $set: { isActive: false, isPopular: false } });
    console.log(`[hold-fuel] put ${res.modifiedCount} problem(s) on hold\n`);
  }
  await report();
  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[hold-fuel] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main, HOLD };
