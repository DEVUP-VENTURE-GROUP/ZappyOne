/**
 * Launch rule for ZappyOne's earnings, on every service line:
 *   ₹10 platform fee on the customer's bill, 10% commission from the provider.
 *
 * Fills in lines whose fee or commission was never set (₹0 / missing) and
 * replaces the placeholder values earlier seeds wrote (₹5, 15%). Anything an
 * operator chose is left alone. After this, Admin → Economics
 * is where the numbers change; nothing is fixed in code.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/repair/migrations/004-platform-fee-defaults.js --report
 *   NODE_ENV=development node src/modules/repair/migrations/004-platform-fee-defaults.js
 *   NODE_ENV=production  node src/modules/repair/migrations/004-platform-fee-defaults.js --yes-production
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const projectRoot = path.resolve(__dirname, '../../../../');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const overlay = path.join(projectRoot, `.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });

const fees = require('../../admin-portal/fees.service');

const rupees = (p) => `₹${(p || 0) / 100}`;

async function report() {
  console.table((await fees.list()).map((r) => ({
    line: r.line, service: r.label, 'platform fee': rupees(r.platformFeePaise), 'commission %': r.commissionPct,
    saved: r.configured ? 'yes' : 'not yet (defaults apply)',
  })));
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = (uri.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'unknown';
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error(`[fees] refusing to touch PRODUCTION database "${dbName}" without --yes-production`);
    process.exit(1);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[fees] connected to: ${dbName}\n`);
  const dryRun = process.argv.includes('--report');
  const changes = await fees.applyLaunchDefaults({ dryRun });
  console.log(`[fees] ${dryRun ? 'would change' : 'changed'} ${changes.length} line(s)`);
  for (const c of changes) {
    const parts = [];
    if (c.to.platformFeePaise !== undefined) parts.push(`fee ${rupees(c.from.fee)} → ${rupees(c.to.platformFeePaise)}`);
    if (c.to.commissionPct !== undefined) parts.push(`commission ${c.from.commission}% → ${c.to.commissionPct}%`);
    console.log(`  ${c.line}/${c.key}: ${parts.join(', ')}`);
  }
  console.log('');
  await report();
  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[fees] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main };
