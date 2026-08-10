/**
 * Seed the fixed "service price" (the actual job's market rate) per service, which
 * switches those services to the ADDITIVE pricing model:
 *   total = servicePrice + travel + platform, then surge x tier.
 *
 * These are STARTING market-rate estimates (₹) — review and adjust to your real
 * rates in the admin Service editor. A service left at 0 keeps the legacy model.
 * Idempotent (updates by code).
 *
 *   node src/scripts/seed-service-prices.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const ServiceCatalog = require('../modules/service/service-catalog.model');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/hyperlocal';

// code → fixed service price in RUPEES (the job itself, before travel/platform/surge).
const PRICES = {
  // ── Vehicle ──────────────────────────────────────────────
  puncture:            100,   // bike puncture
  car_puncture:        150,
  bike_chain_issue:    150,
  bike_brake_issue:    200,
  bike_battery_issue:  250,
  bike_wash:           150,
  bike_service:        400,
  bike_breakdown:      300,
  car_wash:            300,
  car_detailing:      1500,
  battery_jump_start:  200,
  car_breakdown:       350,
  fuel_delivery:       100,   // service fee; fuel billed separately
  car_service:         600,
  // ── Home / generic ───────────────────────────────────────
  electrical:          250,
  plumbing:            250,
  ac_repair:           500,
  carpenter:           300,
  cleaning:            600,
  painting:            400,
  helper:              400,
  // ── Pet ──────────────────────────────────────────────────
  pet_grooming:        500,
  pet_walking:         150,
  pet_transport:       300,
  pet_sitting:         250,
};

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Seeding fixed service prices (additive model)…');
  let updated = 0;
  for (const [code, rupees] of Object.entries(PRICES)) {
    const res = await ServiceCatalog.updateOne(
      { code },
      { $set: { servicePricePaise: Math.round(rupees * 100) } }
    );
    if (res.matchedCount) { updated += 1; console.log(`  ✓ ${code} → ₹${rupees}`); }
    else console.log(`  – ${code} not in catalog (skipped)`);
  }
  console.log(`✅ Set service price on ${updated} services. Adjust in admin as needed.`);
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
