// One-time launch: the 8 Family Assist services live for ZappyOne staff only, priced, every staff member approved, Family Assist 3rd on home. Safe to run twice.
// Run:  NODE_ENV=production node scripts/launch-family-assist.js --yes-production
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const overlay = path.resolve(__dirname, `../.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });

const { ServiceDomain, ServiceLine } = require('../src/modules/onboarding/onboarding.model');
const { FAMILY_ASSIST_LINES } = require('../src/modules/onboarding/onboarding.seed');
const { HelpingConfig, FAMILY_ASSIST_TYPES } = require('../src/modules/helping/models/config.model');
const { CONFIGS } = require('../src/modules/helping/seed/config.seed');
const { syncAllStaff } = require('../src/modules/onboarding/staff-lines');

const HIDE = ['elder_care', 'child_care', 'house_help'];

async function launch() {
  let priced = 0;
  for (const cfg of CONFIGS.filter((c) => FAMILY_ASSIST_TYPES.includes(c.serviceType))) {
    // Insert-only: a price admin already changed is kept.
    const { commissionPct, ...rest } = cfg;
    const r = await HelpingConfig.updateOne({ serviceType: cfg.serviceType }, { $setOnInsert: rest, $set: { commissionPct } }, { upsert: true });
    priced += r.upsertedCount || 0;
  }
  for (const line of FAMILY_ASSIST_LINES) {
    await ServiceLine.updateOne({ code: line.code }, { $set: { ...line, isActive: true, isArchived: false } }, { upsert: true });
  }
  const hidden = await ServiceLine.updateMany({ code: { $in: HIDE } }, { $set: { isActive: false } });
  await ServiceDomain.updateOne({ code: 'family_assist' }, { $set: { displayOrder: 3, isActive: true, isArchived: false, description: 'Errands, elders and home help by ZappyOne staff' } });
  await ServiceDomain.updateOne({ code: 'home_services' }, { $set: { displayOrder: 2 } });
  const staff = await syncAllStaff();
  return { priced, lines: FAMILY_ASSIST_LINES.length, hidden: hidden.modifiedCount, staff };
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error('Refusing to change production without --yes-production');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const r = await launch();
  console.log(`Family Assist live: ${r.lines} services, ${r.priced} new prices, ${r.hidden} coming-soon lines hidden. Staff ${r.staff.staff} approved for ${r.staff.lines} services. Family Assist 3rd on home.`);
  await mongoose.disconnect();
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { launch };
