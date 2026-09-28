/**
 * Starting launch areas in Hyderabad. Outlines are approximate rectangles —
 * refine them on the admin Zones map; this script never overwrites a zone that
 * already exists with the same name.
 *
 * Creating an ACTIVE zone switches on zone enforcement: from then on only
 * points inside an active zone are bookable.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/zone/seed/hyderabad-launch-zones.js [--status coming_soon]
 *   NODE_ENV=production  node src/modules/zone/seed/hyderabad-launch-zones.js --yes-production
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const projectRoot = path.resolve(__dirname, '../../../../');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const overlay = path.join(projectRoot, `.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });

const Zone = require('../zone.model');

const rect = (south, west, north, east) => ({
  type: 'Polygon',
  coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
});

const LAUNCH_ZONES = [
  { name: 'Gachibowli', polygon: rect(17.420, 78.330, 17.445, 78.372) },
  { name: 'HITEC City', polygon: rect(17.440, 78.370, 17.455, 78.388) },
  { name: 'Madhapur', polygon: rect(17.435, 78.385, 17.458, 78.405) },
  { name: 'Kondapur', polygon: rect(17.455, 78.345, 17.480, 78.372) },
];

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = (uri.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'unknown';
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error(`[launch-zones] refusing to touch PRODUCTION database "${dbName}" without --yes-production`);
    process.exit(1);
  }
  const statusArg = process.argv[process.argv.indexOf('--status') + 1];
  const status = process.argv.includes('--status') && Zone.STATUSES.includes(statusArg) ? statusArg : 'active';

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[launch-zones] connected to: ${dbName}`);
  for (const z of LAUNCH_ZONES) {
    const res = await Zone.updateOne(
      { name: z.name, city: 'Hyderabad' },
      { $setOnInsert: { ...z, city: 'Hyderabad', status, description: 'Launch area (approximate outline)', createdBy: 'seed' } },
      { upsert: true },
    );
    console.log(`  ${z.name}: ${res.upsertedCount ? `created (${status})` : 'already exists, left as is'}`);
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[launch-zones] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { LAUNCH_ZONES };
