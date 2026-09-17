/**
 * Wire problems that reached no repair, and refresh the reverse link.
 *
 * The seeders write `candidateRepairCodes` with `$setOnInsert` so an operator's
 * edits survive a re-run. That is right, but it means a seed-file FIX never
 * reaches rows that already exist — 29 laptop problems shipped pointing at no
 * repair at all, and re-running the seeder left them exactly as they were.
 *
 * This fills only the gaps: a problem whose list is still empty is given the
 * seed's list, and a problem an operator has already wired is left alone. It
 * then rebuilds `Repair.problemCodes`, the reverse index the customer's
 * "repairs for this problem" lookup reads, so the two directions agree.
 *
 * Safe to re-run. Reports what it changed and, when nothing is left to do,
 * says so rather than claiming success.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/repair/seed/backfill-problem-repairs.js
 *   NODE_ENV=development node src/modules/repair/seed/backfill-problem-repairs.js --report
 *   NODE_ENV=production  node src/modules/repair/seed/backfill-problem-repairs.js --yes-production
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

const { Problem } = require('../models/problem.model');
const { Repair } = require('../models/repair.model');

const SOURCES = [
  { vertical: 'mobile', seed: require('./catalog.seed') },
  { vertical: 'laptop', seed: require('./laptop.seed') },
];

/** Fill only the problems still pointing nowhere. */
async function wireProblems(vertical, seed) {
  const live = await Repair.find({ vertical, isActive: true }).select('code').lean();
  const known = new Set(live.map((r) => r.code));

  let filled = 0;
  let skippedUnknown = 0;

  for (const p of seed.PROBLEMS) {
    // Never point a problem at a repair that does not exist — the diagnostic
    // engine would recommend it and the booking would then fail to resolve.
    const codes = (p.candidateRepairCodes || []).filter((c) => {
      if (known.has(c)) return true;
      skippedUnknown += 1;
      return false;
    });
    if (!codes.length) continue;

    const res = await Problem.updateOne(
      {
        vertical,
        code: p.code,
        // The gap condition. An operator-wired problem is untouched.
        $or: [{ candidateRepairCodes: { $size: 0 } }, { candidateRepairCodes: { $exists: false } }],
      },
      { $set: { candidateRepairCodes: codes } },
    );
    filled += res.modifiedCount;
  }

  return { filled, skippedUnknown };
}

/** Rebuild Repair.problemCodes from whatever the problems now say. */
async function refreshReverseLink(vertical) {
  const problems = await Problem.find({ vertical, isActive: true })
    .select('code candidateRepairCodes').lean();

  const byRepair = new Map();
  for (const p of problems) {
    for (const code of p.candidateRepairCodes || []) {
      if (!byRepair.has(code)) byRepair.set(code, []);
      byRepair.get(code).push(p.code);
    }
  }

  const repairs = await Repair.find({ vertical }).select('code problemCodes').lean();
  let updated = 0;

  for (const r of repairs) {
    const want = (byRepair.get(r.code) || []).sort();
    const have = [...(r.problemCodes || [])].sort();
    if (want.join('|') === have.join('|')) continue;
    await Repair.updateOne({ _id: r._id }, { $set: { problemCodes: want } });
    updated += 1;
  }

  return updated;
}

async function report() {
  const rows = [];
  for (const { vertical } of SOURCES) {
    const [total, unwired, repairs, unreachable] = await Promise.all([
      Problem.countDocuments({ vertical, isActive: true }),
      Problem.countDocuments({
        vertical,
        isActive: true,
        $or: [{ candidateRepairCodes: { $size: 0 } }, { candidateRepairCodes: { $exists: false } }],
      }),
      Repair.countDocuments({ vertical, isActive: true }),
      Repair.countDocuments({
        vertical,
        isActive: true,
        $or: [{ problemCodes: { $size: 0 } }, { problemCodes: { $exists: false } }],
      }),
    ]);
    rows.push({
      vertical, problems: total, problemsWithNoRepair: unwired, repairs, repairsNoProblemReaches: unreachable,
    });
  }
  return rows;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = uri.split('/').pop().split('?')[0];

  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error(`[backfill] refusing to touch PRODUCTION database "${dbName}" without --yes-production`);
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[backfill] connected to database: ${dbName}`);

  if (process.argv.includes('--report')) {
    console.table(await report());
    await mongoose.disconnect();
    return;
  }

  for (const { vertical, seed } of SOURCES) {
    const { filled, skippedUnknown } = await wireProblems(vertical, seed);
    const refreshed = await refreshReverseLink(vertical);
    console.log(
      `[backfill] ${vertical.padEnd(7)} wired ${String(filled).padStart(3)} problems`
      + `, refreshed ${String(refreshed).padStart(3)} repair reverse-links`,
    );
    if (skippedUnknown) {
      console.warn(`[backfill]   ! ${skippedUnknown} seed reference(s) skipped — no such repair in this vertical`);
    }
  }

  console.log('\n[backfill] final state:');
  console.table(await report());
  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[backfill] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main, report, wireProblems, refreshReverseLink };
