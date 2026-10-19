// One-time launch: Bike Wash and Car Wash live and featured in Vehicles, vehicle repairs hidden, Vehicles first and Electronics last. Safe to run twice.
// Run after the seeds:  NODE_ENV=production node scripts/launch-vehicle-wash.js --yes-production
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const overlay = path.resolve(__dirname, `../.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });

const { ServiceDomain, ServiceLine } = require('../src/modules/onboarding/onboarding.model');

const WASH_LINES = [
  {
    code: 'bike_wash', name: 'Bike Wash', domainCode: 'vehicles', repairVertical: 'bike_wash', status: 'live', displayOrder: 1, icon: 'Bike',
    description: 'Quick, foam or foam + polish wash for scooters and bikes, at your parking', customerPath: '/repair/bike-wash',
    tagline: 'At your door, from ₹99', isPopular: true, isActive: true,
  },
  {
    code: 'car_wash', name: 'Car Wash', domainCode: 'vehicles', repairVertical: 'car_wash', status: 'live', displayOrder: 2, icon: 'Car',
    description: 'Exterior, foam + vacuum or full clean for hatchbacks, sedans and SUVs, at your parking', customerPath: '/repair/car-wash',
    tagline: 'At your door, from ₹299', isPopular: true, isActive: true,
  },
];
const HIDE = ['two_wheeler', 'three_wheeler', 'four_wheeler'];

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error('Refusing to change production without --yes-production');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  for (const line of WASH_LINES) {
    await ServiceLine.updateOne({ code: line.code }, { $set: line }, { upsert: true });
  }
  const hidden = await ServiceLine.updateMany({ code: { $in: HIDE } }, { $set: { isActive: false } });
  await ServiceDomain.updateOne({ code: 'vehicles' }, { $set: { displayOrder: 0 } });
  await ServiceDomain.updateOne({ code: 'electronics' }, { $set: { displayOrder: 99 } });
  console.log(`Wash lines live: ${WASH_LINES.map((l) => l.name).join(', ')}. Vehicle repairs hidden: ${hidden.modifiedCount}. Vehicles first, Electronics last.`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err.message); process.exit(1); });
