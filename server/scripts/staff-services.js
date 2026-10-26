// ZappyOne staff do washes and tank care too: marks those lines staffDoes and approves every staff member for them (and every staff-only line). Safe to run twice.
// Run:  NODE_ENV=production node scripts/staff-services.js --yes-production
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const overlay = path.resolve(__dirname, `../.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });

const { ServiceLine } = require('../src/modules/onboarding/onboarding.model');
const { syncAllStaff } = require('../src/modules/onboarding/staff-lines');

const STAFF_DOES = ['bike_wash', 'car_wash', 'water_tank_care'];

async function apply() {
  const marked = await ServiceLine.updateMany({ code: { $in: STAFF_DOES } }, { $set: { staffDoes: true } });
  return { marked: marked.modifiedCount || 0, ...(await syncAllStaff()) };
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error('Refusing to change production without --yes-production');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const r = await apply();
  console.log(`Staff services: ${r.marked} lines marked, ${r.staff} staff, ${r.approved} approvals added or refreshed.`);
  await mongoose.disconnect();
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { apply, STAFF_DOES };
