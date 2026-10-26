// One-time launch: Home Cleaning, Electrician, Plumber and AC Service live for partners and customers. Safe to run twice.
// Run after the seeds:  NODE_ENV=production node scripts/launch-home-services.js --yes-production
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const overlay = path.resolve(__dirname, `../.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });

const { ServiceDomain, ServiceLine } = require('../src/modules/onboarding/onboarding.model');
const { HOME_SERVICE_LINES } = require('../src/modules/onboarding/onboarding.seed');

async function launch() {
  for (const line of HOME_SERVICE_LINES) {
    await ServiceLine.updateOne({ code: line.code }, { $set: { ...line, providerKinds: ['shop', 'individual'], isActive: true, isArchived: false } }, { upsert: true });
  }
  await ServiceLine.updateOne({ code: 'water_tank_care' }, { $set: { displayOrder: 5 } });
  await ServiceDomain.updateOne({ code: 'home_services' }, { $set: { isActive: true, isArchived: false } });
  return HOME_SERVICE_LINES.map((l) => l.name);
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error('Refusing to change production without --yes-production');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  console.log(`Live for partners and customers: ${(await launch()).join(', ')}.`);
  await mongoose.disconnect();
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { launch };
