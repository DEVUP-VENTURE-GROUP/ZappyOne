/**
 * Migration 001 — scope catalog code uniqueness to the vertical.
 *
 * WHY
 * The repair catalog originally carried globally-unique `code` fields, which
 * was invisible while only the mobile vertical existed. Adding laptops exposed
 * it immediately: "display" is a legitimate problem category for both phones
 * and laptops, and the platform-wide constraint made the second vertical fail
 * to seed with a duplicate-key error.
 *
 * WHAT
 * Drops the single-field unique indexes and lets the models rebuild the correct
 * compound ones on `(vertical, code)`.
 *
 * SAFETY
 * Index-only; no documents are read or written. Before dropping, it verifies
 * there is no existing cross-vertical duplication that the looser constraint
 * would let through — if there were, dropping the index would permit real
 * corruption, so the migration refuses rather than proceeding.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/repair/migrations/001-vertical-scoped-codes.js
 *   NODE_ENV=production  node src/modules/repair/migrations/001-vertical-scoped-codes.js --yes-production
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

/** Collections whose `code` must become unique per vertical rather than globally. */
const TARGETS = [
  { collection: 'problemcategories', oldIndex: 'code_1' },
  { collection: 'problems', oldIndex: 'code_1' },
  { collection: 'repairs', oldIndex: 'code_1' },
  // A skill LEVEL is also vertical-scoped: laptop L2 and mobile L2 describe
  // different competencies and must coexist.
  { collection: 'skilllevels', oldIndex: 'level_1', codeField: 'level' },
  { collection: 'qachecklists', oldIndex: 'code_1' },
];

/**
 * Would the looser constraint allow a genuine duplicate?
 *
 * Checks for two documents sharing BOTH vertical and code — the thing the new
 * compound index forbids. Any hit means the data is already inconsistent and
 * the new index would fail to build, so it is reported instead of dropped into.
 */
async function findConflicts(db, collection, codeField = 'code') {
  return db.collection(collection).aggregate([
    { $group: { _id: { vertical: '$vertical', code: `$${codeField}` }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 10 },
  ]).toArray();
}

async function up() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = (uri.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'unknown';

  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error(`[migrate-001] refusing to alter PRODUCTION "${dbName}" without --yes-production`);
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;
  console.log(`[migrate-001] database: ${dbName}`);

  let dropped = 0;
  let alreadyDone = 0;

  for (const { collection, oldIndex, codeField = 'code' } of TARGETS) {
    const exists = (await db.listCollections({ name: collection }).toArray()).length > 0;
    if (!exists) {
      console.log(`[migrate-001] ${collection.padEnd(20)} collection absent — nothing to do`);
      continue;
    }

    const conflicts = await findConflicts(db, collection, codeField);
    if (conflicts.length) {
      console.error(`[migrate-001] ! ${collection} has ${conflicts.length} (vertical, code) duplicate(s):`);
      conflicts.forEach((c) => console.error(`[migrate-001]     ${c._id.vertical} / ${c._id.code} ×${c.n}`));
      throw new Error(`${collection} must be de-duplicated before the compound index can be built`);
    }

    const indexes = await db.collection(collection).indexes();
    const hasOld = indexes.some((i) => i.name === oldIndex);
    if (!hasOld) {
      alreadyDone++;
      console.log(`[migrate-001] ${collection.padEnd(20)} already migrated`);
      continue;
    }

    await db.collection(collection).dropIndex(oldIndex);
    dropped++;
    console.log(`[migrate-001] ${collection.padEnd(20)} dropped ${oldIndex}`);
  }

  // Rebuild through the models so the compound definitions are the source of
  // truth, rather than hand-writing index specs that could drift from them.
  require('../models/problem.model');
  require('../models/repair.model');
  require('../models/capability.model');
  require('../models/config.model');
  await Promise.all(mongoose.modelNames()
    .filter((n) => ['ProblemCategory', 'Problem', 'Repair', 'SkillLevel', 'QAChecklist'].includes(n))
    .map((n) => mongoose.model(n).syncIndexes()));

  console.log(`\n[migrate-001] done — ${dropped} dropped, ${alreadyDone} already migrated, compound indexes rebuilt`);
  await mongoose.disconnect();
  return { dropped, alreadyDone };
}

if (require.main === module) {
  up().then(() => process.exit(0)).catch((err) => {
    console.error('[migrate-001] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { up };
