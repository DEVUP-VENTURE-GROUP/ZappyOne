// One price per service, no ranges: every live band's low and high become its recommended price. Safe to run twice.
// Run:  NODE_ENV=production node scripts/single-prices.js --yes-production
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const overlay = path.resolve(__dirname, `../.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });

const { ZappyReferencePricing } = require('../src/modules/repair/models/pricing.model');

const LIVE = ['water_tank_care', 'bike_wash', 'car_wash'];

async function singlePrices() {
  const r = await ZappyReferencePricing.updateMany(
    { vertical: { $in: LIVE }, supersededAt: null, $expr: { $or: [{ $ne: ['$minPaise', '$recommendedPaise'] }, { $ne: ['$maxPaise', '$recommendedPaise'] }] } },
    [{ $set: { minPaise: '$recommendedPaise', maxPaise: '$recommendedPaise' } }],
  );
  return r.modifiedCount || 0;
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error('Refusing to change production without --yes-production');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  console.log(`Single prices set on ${await singlePrices()} bands (${LIVE.join(', ')}).`);
  await mongoose.disconnect();
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { singlePrices, LIVE };
