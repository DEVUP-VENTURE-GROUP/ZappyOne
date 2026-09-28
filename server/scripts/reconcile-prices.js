/**
 * Reconcile service prices so the home/services "From ₹X" === checkout floor.
 *
 *   Run: node scripts/reconcile-prices.js
 *
 * For every service below it:
 *   1. Sets ServiceCatalog.priceRangeMin/MaxPaise   (what the storefront shows)
 *   2. Sets PricingConfig.serviceOverrides.minFarePaise (the real checkout floor)
 *   3. Busts the pricing cache so changes take effect immediately.
 *
 * Values are in RUPEES. Edit the table, re-run any time — it's idempotent.
 * `max: null` services are quote-based; we leave their catalog max untouched.
 */
require('dotenv').config();
const { connectMongo } = require('../src/config/mongo');
const ServiceCatalog = require('../src/modules/service/service-catalog.model');
const PricingConfig = require('../src/modules/pricing/pricing-config.model');
const { redis } = require('../src/config/redis');

const CACHE_KEY = 'config:pricing:active';

// code, from (display + checkout floor, ₹), max (catalog top, ₹ or null = quote)
const PRICES = [
  // Mobile
  ['screen_replacement', 999, 12000], ['battery_replacement', 799, 2500],
  ['charging_issue', 499, 1500], ['speaker_mic_issue', 499, 1500],
  ['microphone_issue', 499, 1500], ['software_issue', 399, 999],
  ['water_damage', 599, 2500], ['camera_issue', 699, 3000],
  ['data_recovery', 999, 5000], ['device_not_turning_on', 499, 3000],
  // Laptop
  ['laptop_slow', 499, 1500], ['laptop_ssd_upgrade', 599, 4000],
  ['laptop_ram_upgrade', 499, 3000], ['laptop_keyboard_issue', 599, 2500],
  ['laptop_motherboard_issue', 1499, 8000], ['laptop_charging_issue', 499, 2000],
  ['laptop_screen_issue', 1499, 6000], ['laptop_virus_removal', 499, 999],
  ['laptop_data_recovery', 999, 6000],
  // Smart devices
  ['smart_tv_install', 599, 2000], ['smart_tv_repair', 999, 5000],
  ['router_setup', 399, 1000], ['router_troubleshoot', 399, 1000],
  ['cctv_install', 1499, 8000], ['cctv_repair', 799, 3000],
  ['smart_lock_install', 1499, 6000], ['home_automation_setup', 2499, 15000],
  // Vehicle
  ['puncture', 149, 299], ['car_puncture', 199, 349],
  ['bike_chain_issue', 199, 599], ['bike_brake_issue', 249, 799],
  ['bike_battery_issue', 399, 1500], ['bike_wash', 199, 349],
  ['bike_breakdown', 299, 999], ['bike_service', 399, 799],
  ['car_wash', 299, 599], ['car_detailing', 1499, 4000],
  ['battery_jump_start', 299, 499], ['car_breakdown', 499, 1500],
  ['fuel_delivery', 99, 500], ['car_service', 1499, 5000],
  ['auto_repair', 499, 3000], ['van_repair', 599, 3500],
  ['commercial_emergency', 999, 3000], ['commercial_scheduled_maintenance', 999, 5000],
  ['fleet_support', 1499, null],
  // Family & Elder / Helper
  ['medicine_pickup', 49, 500], ['grocery_assistance', 49, 500],
  ['bill_payment_assist', 49, 300], ['document_submission', 149, 1000],
  ['hospital_companion', 499, 2000], ['home_visit_check', 399, 1500],
  ['elder_doctor_visit', 599, 2000], ['elder_companion', 499, 2000],
  ['elder_home_visit', 399, 1500], ['elder_transport', 499, 2000],
  // Event crew
  ['event_decorator', 1499, null], ['event_setup_crew', 999, null],
  ['event_cleaning_crew', 799, null], ['event_helper', 599, null],
  ['event_sound_crew', 1499, null], ['event_lighting_crew', 1499, null],
];

(async () => {
  await connectMongo();
  let catalogUpdated = 0, catalogMissing = [], overridesSet = 0;

  // 1) Catalog price ranges (storefront display)
  for (const [code, from, max] of PRICES) {
    const set = { priceRangeMinPaise: from * 100 };
    if (max != null) set.priceRangeMaxPaise = max * 100;
    const r = await ServiceCatalog.updateOne({ code }, { $set: set });
    if (r.matchedCount > 0) catalogUpdated++;
    else catalogMissing.push(code);
  }

  // 2) Pricing config floors (real checkout floor) — keep existing multipliers
  const cfg = await PricingConfig.findOne({ isActive: true });
  if (cfg) {
    const overrides = cfg.serviceOverrides || [];
    const byCode = new Map(overrides.map((o) => [o.service, o]));
    for (const [code, from] of PRICES) {
      const existing = byCode.get(code);
      if (existing) existing.minFarePaise = from * 100;
      else overrides.push({ service: code, multiplier: 1.0, minFarePaise: from * 100 });
      overridesSet++;
    }
    cfg.serviceOverrides = overrides;
    cfg.markModified('serviceOverrides');
    await cfg.save();
    await redis.del(CACHE_KEY).catch(() => {});
  }

  console.log(`\nCatalog updated:   ${catalogUpdated}/${PRICES.length}`);
  if (catalogMissing.length) console.log(`  (no catalog row for: ${catalogMissing.join(', ')})`);
  console.log(`Pricing floors set: ${cfg ? overridesSet : 'SKIPPED — no active PricingConfig doc (defaults in code are already aligned)'}`);
  console.log('Pricing cache busted.\n');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
