/**
 * One-time fixup for the service catalog:
 *   1. Short, clear display NAMES ("Bike Puncture" instead of
 *      "Doorstep Bike & Scooter Puncture Repair"). The old long text is kept as the
 *      shortDescription so nothing is lost.
 *   2. A fixed SERVICE PRICE (the job's market rate) → switches the service to the
 *      additive pricing model (servicePrice + travel + platform, then surge x tier).
 *
 * Prices are starting estimates in ₹ — tune each in the admin Service editor.
 * Idempotent (updates by code); a code not in the catalog is skipped.
 *
 *   node src/scripts/seed-service-prices.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const ServiceCatalog = require('../modules/service/service-catalog.model');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/hyperlocal';

// code → { name: short display name, price: fixed service price in ₹ (0 = don't set) }
const SERVICES = {
  // ── Bike ──────────────────────────────────────────────
  bike_puncture:            { name: 'Bike Puncture',        price: 120 },
  bike_foam_wash:           { name: 'Bike Wash',            price: 150 },
  bike_periodic_service:    { name: 'Bike Service',         price: 400 },
  bike_towing:              { name: 'Bike Towing',          price: 0   }, // towing priced by distance
  bike_chain_issue:         { name: 'Bike Chain Repair',    price: 150 },
  bike_brake_issue:         { name: 'Bike Brake Repair',    price: 200 },
  bike_battery_issue:       { name: 'Bike Battery',         price: 250 },
  bike_breakdown:           { name: 'Bike Breakdown Help',  price: 300 },
  // ── Car ───────────────────────────────────────────────
  car_puncture:             { name: 'Car Puncture',         price: 150 },
  car_foam_wash_detailing:  { name: 'Car Wash',             price: 500 },
  periodic_car_service:     { name: 'Car Service',          price: 800 },
  car_ac_gas_refill:        { name: 'Car AC Service',       price: 600 },
  car_battery_replacement:  { name: 'Car Battery',          price: 300 },
  battery_jump_start:       { name: 'Jump Start',           price: 200 },
  fuel_delivery:            { name: 'Fuel Delivery',        price: 100 },
  car_breakdown:            { name: 'Car Breakdown Help',   price: 350 },
  // ── Home ──────────────────────────────────────────────
  fan_installation:         { name: 'Fan Installation',     price: 250 },
  mcb_switch_repair:        { name: 'Switch / MCB Repair',  price: 250 },
  tap_repair:               { name: 'Tap Repair',           price: 200 },
  geyser_install:           { name: 'Geyser Service',       price: 400 },
  door_lock_install:        { name: 'Door Lock Repair',     price: 300 },
  washing_machine_repair:   { name: 'Washing Machine Repair', price: 350 },
  refrigerator_repair:      { name: 'Fridge Repair',        price: 400 },
  // ── Pet ───────────────────────────────────────────────
  pet_grooming:             { name: 'Pet Grooming',         price: 500 },
  pet_walking:              { name: 'Pet Walking',          price: 150 },

  // ── Fixed market price for the remaining SIMPLE single-rate services ──────
  // (grounded in the pricing engine's serviceOverrides.minFarePaise). Phone &
  // laptop repairs are intentionally EXCLUDED — they price by brand/model/tier
  // (depth). Towing is distance-priced. Both keep their own engines.
  // Price only; names are already clean so they're left untouched.
  // ── Smart home / appliances ──
  smart_tv_install:         { price: 800  },
  smart_tv_repair:          { price: 1000 },
  cctv_install:             { price: 1200 },
  cctv_repair:              { price: 800  },
  router_setup:             { price: 500  },
  router_troubleshoot:      { price: 450  },
  home_automation_setup:    { price: 2000 },
  smart_lock_install:       { price: 1000 },
  // ── Events ──
  event_decorator:          { price: 1000 },
  event_setup_crew:         { price: 800  },
  event_helper:             { price: 500  },
  event_sound_crew:         { price: 1000 },
  event_lighting_crew:      { price: 1000 },
  event_security_crew:      { price: 800  },
  event_birthday_setup:     { price: 1000 },
  event_wedding_setup:      { price: 3000 },
  event_photography_assist: { price: 800  },
  event_catering_assist:    { price: 800  },
  event_cleaning_crew:      { price: 600  },
  // ── Commercial & auto ──
  commercial_emergency:              { price: 800  },
  commercial_scheduled_maintenance:  { price: 600  },
  fleet_support:                     { price: 1000 },
  auto_repair:                       { price: 400  },
  van_repair:                        { price: 500  },
  minor_roadside_repair:             { price: 200  },
  // ── Family & elder assist ──
  medicine_pickup:          { price: 50  },
  hospital_companion:       { price: 500 },
  grocery_assistance:       { price: 30  },
  bill_payment_assist:      { price: 20  },
  document_submission:      { price: 100 },
  home_visit_check:         { price: 300 },
  elder_doctor_visit:       { price: 600 },
  elder_companion:          { price: 400 },
  elder_home_visit:         { price: 350 },
  elder_transport:          { price: 450 },
  // ── Tank & water cleaning ──
  water_tank_cleaning:      { price: 600 },
  overhead_tank_cleaning:   { price: 500 },
  underground_sump_cleaning:{ price: 800 },
  sintex_tank_cleaning:     { price: 400 },
  // ── Pet ──
  pet_vet_assist:           { price: 500 },
  pet_training_assist:      { price: 600 },
};

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Fixing service names + prices…\n');
  let renamed = 0, priced = 0;
  for (const [code, { name, price }] of Object.entries(SERVICES)) {
    const svc = await ServiceCatalog.findOne({ code }).lean();
    if (!svc) { console.log(`  – ${code} (not in catalog)`); continue; }

    const set = {};
    if (name && svc.name !== name) {
      // Preserve the old descriptive name as the subtitle if none is set.
      if (!svc.shortDescription) set.shortDescription = svc.name;
      set.name = name;
    }
    if (price > 0) set.servicePricePaise = Math.round(price * 100);

    if (Object.keys(set).length) {
      await ServiceCatalog.updateOne({ code }, { $set: set });
      if (set.name) renamed += 1;
      if (set.servicePricePaise) priced += 1;
      console.log(`  ✓ ${code} → "${name}"${price > 0 ? `  ₹${price}` : ''}`);
    }
  }
  console.log(`\n✅ Renamed ${renamed}, priced ${priced}. Adjust anything in the admin Service editor.`);
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
