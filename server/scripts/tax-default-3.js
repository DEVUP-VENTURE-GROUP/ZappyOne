// Moves pricing settings still at 0% tax to the new 3% default (repair, pet and helping). A setting an admin set to any other number is left as it is.
//   node scripts/tax-default-3.js          (lists only)
//   node scripts/tax-default-3.js --apply  (writes)
require('dotenv').config();
const mongoose = require('mongoose');

const TAX = 3;
const COLLECTIONS = ['repairconfigs', 'petpricingrules', 'helpingconfigs'];

async function run({ apply = false, log = console.log } = {}) {
  const db = mongoose.connection.db;
  const names = new Set((await db.listCollections().toArray()).map((c) => c.name));
  let changed = 0;
  for (const name of COLLECTIONS) {
    if (!names.has(name)) { log(`${name}: none`); continue; }
    const filter = { $or: [{ taxPct: 0 }, { taxPct: { $exists: false } }], supersededAt: null };
    const rows = await db.collection(name).find(filter).project({ vertical: 1, categoryCode: 1, code: 1, taxPct: 1 }).toArray();
    for (const r of rows) log(`${name} ${r.vertical || r.categoryCode || r.code || r._id}: ${r.taxPct ?? 'unset'}% -> ${TAX}%${apply ? '' : ' (not written)'}`);
    if (apply && rows.length) changed += (await db.collection(name).updateMany({ _id: { $in: rows.map((r) => r._id) } }, { $set: { taxPct: TAX } })).modifiedCount;
  }
  log(apply ? `${changed} settings now at ${TAX}%` : 'Nothing written. Run again with --apply.');
  return changed;
}

if (require.main === module) {
  (async () => {
    await require('../src/config/mongo').connectMongo();
    await run({ apply: process.argv.includes('--apply') });
    await mongoose.disconnect();
    process.exit(0);
  })().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { run, TAX };
