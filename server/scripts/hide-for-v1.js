// This version shows only the services with their own photos and staff ready; these are hidden (isActive false), not deleted, and switch back on from Admin > Catalog. Safe to run twice.
// Run:  NODE_ENV=production node scripts/hide-for-v1.js --yes-production
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const overlay = path.resolve(__dirname, `../.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });

const { ServiceLine } = require('../src/modules/onboarding/onboarding.model');

const HIDE = ['cleaning', 'electrical', 'plumbing', 'appliance', 'fa_medicine_pickup', 'fa_parcel_drop', 'fa_queue_errand', 'returns_exchange'];

async function hide() {
  const r = await ServiceLine.updateMany({ code: { $in: HIDE } }, { $set: { isActive: false } });
  return r.modifiedCount || 0;
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error('Refusing to change production without --yes-production');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  console.log(`Hidden for this version: ${await hide()} services (${HIDE.join(', ')}).`);
  await mongoose.disconnect();
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { hide, HIDE };
