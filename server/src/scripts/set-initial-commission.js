/**
 * Initial-stage pricing knobs (updates the EXISTING active PricingConfig, no new
 * routes/models). Keeps the platform take low so early workers earn well:
 *   - commissionRate  = 5%   (worker keeps 95% of the bill)
 *   - platformFeePaise = ₹20 (flat platform/surge line for now)
 *
 * Run: node src/scripts/set-initial-commission.js
 * Change these in the admin pricing panel any time — this is just a one-shot set.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const PricingConfig = require('../modules/pricing/pricing-config.model');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/hyperlocal';

const COMMISSION = 0.05;   // 5%
const PLATFORM_PAISE = 2000; // ₹20

async function run() {
  await mongoose.connect(MONGO_URI);
  let active = await PricingConfig.findOne({ isActive: true });

  if (active) {
    active.commissionRate  = COMMISSION;
    active.platformFeePaise = PLATFORM_PAISE;
    await active.save();
    console.log(`Updated active config v${active.version}: commission ${COMMISSION * 100}%, platform ₹${PLATFORM_PAISE / 100}`);
  } else {
    // No active config yet (server was on env defaults) — create one.
    active = await PricingConfig.create({
      version: 1,
      isActive: true,
      commissionRate: COMMISSION,
      platformFeePaise: PLATFORM_PAISE,
    });
    console.log(`Created active config v1: commission ${COMMISSION * 100}%, platform ₹${PLATFORM_PAISE / 100}`);
  }

  // Best-effort: clear the cached config so the change is instant (else it
  // refreshes on its own within ~60s via the cache TTL).
  try {
    const { redis } = require('../config/redis');
    await redis.del('config:pricing:active');
    console.log('Cleared pricing config cache');
  } catch { console.log('(cache not cleared — refreshes within ~60s automatically)'); }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
