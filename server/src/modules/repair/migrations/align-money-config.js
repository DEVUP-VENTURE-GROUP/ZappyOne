/**
 * Bring every vertical's money config onto the agreed commercial model.
 *
 * Changing a schema DEFAULT only affects configs created afterwards, so the
 * verticals that already existed kept the old numbers and the four verticals
 * disagreed with each other about the same business:
 *
 *   commission   mobile 15%, laptop 15%, two-wheeler 10%, four-wheeler 10%
 *   tax          laptop 18%, everything else 0%
 *
 * The agreed model is one commission rate taken from the provider and one tax
 * rate — and while the same class of service is taxed 18% on one screen and 0%
 * on another, somebody is being charged the wrong amount whichever is right.
 *
 * DELIBERATELY NOT TOUCHED:
 *   platformFeePaise  — Faizan is setting this himself in admin.
 *   diagnosisFeePaise — an operator's price, not a number this script should
 *                       invent. It is REPORTED below when zero, because a
 *                       zero inspection fee means free callouts on every
 *                       diagnosis-required job.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/repair/migrations/align-money-config.js
 *   NODE_ENV=development node src/modules/repair/migrations/align-money-config.js --report
 *   NODE_ENV=production  node src/modules/repair/migrations/align-money-config.js --yes-production
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const projectRoot = path.resolve(__dirname, '../../../../');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const overlay = path.join(projectRoot, `.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });

const { RepairConfig } = require('../models/config.model');

/** The agreed deal: 10% from the provider, tax set by the operator. */
const TARGET = { commissionPct: 10, taxPct: 0 };

const rupees = (p) => '₹' + ((p || 0) / 100).toLocaleString('en-IN');

async function report() {
  const configs = await RepairConfig.find({ supersededAt: null }).sort({ vertical: 1 }).lean();
  const rows = configs.map((c) => ({
    vertical: c.vertical,
    'commission %': c.commissionPct,
    'tax %': c.taxPct,
    'platform fee': rupees(c.platformFeePaise),
    'inspection fee': rupees(c.diagnosisFeePaise),
  }));
  console.table(rows);

  const freeInspections = configs.filter((c) => !c.diagnosisFeePaise).map((c) => c.vertical);
  if (freeInspections.length) {
    console.warn(
      `\n  ! inspection fee is ZERO for: ${freeInspections.join(', ')}`
      + '\n    Every diagnosis-required job in those verticals is a free callout.'
      + '\n    Set it in Admin → Repair → Configuration (it is in rupees there).',
    );
  }
  const tinyFees = configs.filter((c) => c.platformFeePaise > 0 && c.platformFeePaise < 500);
  if (tinyFees.length) {
    console.warn(
      `\n  ! platform fee is under ₹5 for: ${tinyFees.map((c) => `${c.vertical} (${rupees(c.platformFeePaise)})`).join(', ')}`
      + '\n    Worth confirming — this field was in paise on the old admin screen.',
    );
  }
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = (uri.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'unknown';

  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error(`[align-money] refusing to touch PRODUCTION database "${dbName}" without --yes-production`);
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[align-money] connected to: ${dbName}\n`);

  if (process.argv.includes('--report')) {
    await report();
    await mongoose.disconnect();
    return;
  }

  console.log('before:');
  await report();

  for (const [field, value] of Object.entries(TARGET)) {
    const res = await RepairConfig.updateMany(
      { supersededAt: null, [field]: { $ne: value } },
      { $set: { [field]: value } },
    );
    if (res.modifiedCount) console.log(`\n[align-money] ${field} -> ${value} on ${res.modifiedCount} config(s)`);
  }

  console.log('\nafter:');
  await report();

  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[align-money] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main, report, TARGET };
