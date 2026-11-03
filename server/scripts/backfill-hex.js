// Give every existing shop and service area its hexagon (core/geo/hex), once, after deploying the hexagon index. Only adds the cell; touches nothing else. Safe to run again.
//   node scripts/backfill-hex.js          (writes)
//   node scripts/backfill-hex.js --dry    (counts only)
require('dotenv').config();
const mongoose = require('mongoose');
const { connectMongo } = require('../src/config/mongo');
const { cellOf } = require('../src/core/geo/hex');

const DRY = process.argv.includes('--dry');

async function fill(collection, pointPath, field) {
  const col = mongoose.connection.db.collection(collection);
  const rows = await col.find({ [`${pointPath}.coordinates.1`]: { $exists: true } }).project({ [pointPath]: 1, [field]: 1 }).toArray();
  const ops = [];
  for (const r of rows) {
    const point = pointPath.split('.').reduce((o, k) => o?.[k], r);
    const cell = cellOf(point?.coordinates);
    if (cell && r[field] !== cell) ops.push({ updateOne: { filter: { _id: r._id }, update: { $set: { [field]: cell } } } });
  }
  if (!DRY && ops.length) await col.bulkWrite(ops, { ordered: false });
  console.log(`${collection}: ${rows.length} with a pin, ${ops.length} ${DRY ? 'would get' : 'given'} a hexagon`);
}

async function run() {
  await fill('shops', 'address.location', 'addressHex');
  await fill('providerserviceareas', 'center', 'centerHex');
}

if (require.main === module) {
  (async () => {
    await connectMongo();
    await run();
    await mongoose.disconnect();
    process.exit(0);
  })().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { run };
