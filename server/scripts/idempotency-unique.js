// Pet bookings and errands get one booking per idempotency key, like repairs: lists any keys already used twice, builds the unique index and drops the old non-unique one. Data is never changed.
//   node scripts/idempotency-unique.js          (lists only)
//   node scripts/idempotency-unique.js --apply  (builds the unique index, drops the old one; needs --yes-production on production)
require('dotenv').config();
const mongoose = require('mongoose');

const TARGETS = [['petbookings', 'PetBooking'], ['helpingtasks', 'HelpingTask']];

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const apply = process.argv.includes('--apply');
  if (apply && process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error('[idempotency] refusing to change PRODUCTION indexes without --yes-production');
    process.exit(1);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  for (const [collection, model] of TARGETS) {
    const col = mongoose.connection.db.collection(collection);
    const dupes = await col.aggregate([
      { $match: { idempotencyKey: { $type: 'string' } } },
      { $group: { _id: '$idempotencyKey', n: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 50 },
    ]).toArray();
    const indexes = (await col.indexes()).map((i) => i.name);
    console.log(`[idempotency] ${model}: ${dupes.length} key(s) used more than once; indexes: ${indexes.join(', ')}`);
    for (const d of dupes) console.log(`   key ${d._id}: ${d.n} records ${d.ids.join(', ')}`);
    if (!apply) continue;
    if (dupes.length) { console.log(`   skipped: resolve the duplicates above first (the unique index cannot be built over them)`); continue; }
    if (!indexes.includes('idempotencyKey_unique')) {
      await col.createIndex({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } }, name: 'idempotencyKey_unique' });
      console.log('   built idempotencyKey_unique');
    }
    if (indexes.includes('idempotencyKey_1')) { await col.dropIndex('idempotencyKey_1'); console.log('   dropped the old non-unique idempotencyKey_1'); }
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
