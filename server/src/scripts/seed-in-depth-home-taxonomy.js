/**
 * Production In-Depth Service Taxonomy Seeder & Category Isolator
 *
 * Categorizes & populates all services into clean, isolated vertical buckets:
 * - electrical (Electrical & AC Repair)
 * - plumbing (Plumbing & Sanitary)
 * - carpentry (Carpentry & Woodwork)
 * - cleaning (Home Cleaning & Disinfection)
 * - appliance (Home Appliance Repair)
 * - helper (Family & Elder Assist)
 * - pet (Pet Care Services)
 * - mobile (Smartphone Repair)
 * - laptop (Laptop & Computer Repair)
 * - car (Car Maintenance & Towing)
 * - bike (Bike & Scooter Care)
 * - construction (Masonry & Civil Works)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const ServiceCatalog = require('../modules/service/service-catalog.model');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/hyperlocal';

async function seedInDepthTaxonomy() {
  console.log('Connecting to MongoDB:', MONGO_URI);
  await mongoose.connect(MONGO_URI);

  console.log('Auditing & re-categorizing all existing services in MongoDB...');

  // 1. Electrical & AC
  await ServiceCatalog.updateMany(
    { $or: [{ code: { $in: ['electrical', 'ac_repair', 'fan_installation', 'mcb_switch_repair', 'inverter_repair', 'light_fitting'] } }, { name: { $regex: /electrical|ac |fan |inverter|light /i } }] },
    { $set: { category: 'electrical' } }
  );

  // 2. Plumbing
  await ServiceCatalog.updateMany(
    { $or: [{ code: { $in: ['plumbing', 'tap_repair', 'pipe_leakage', 'geyser_install', 'drain_unclogging', 'water_tank_cleaning'] } }, { name: { $regex: /plumb|tap|sink|geyser|pipe|drain/i } }] },
    { $set: { category: 'plumbing' } }
  );

  // 3. Carpentry
  await ServiceCatalog.updateMany(
    { $or: [{ code: { $in: ['carpenter', 'carpentry', 'door_lock_install', 'furniture_assembly', 'cupboard_repair'] } }, { name: { $regex: /carpent|door|wood|lock|furniture|cupboard/i } }] },
    { $set: { category: 'carpentry' } }
  );

  // 4. Cleaning
  await ServiceCatalog.updateMany(
    { $or: [{ code: { $in: ['cleaning', 'deep_cleaning', 'sofa_shampooing', 'bathroom_disinfection', 'kitchen_deep_clean', 'pest_control'] } }, { name: { $regex: /clean|sofa|disinfec|pest/i } }] },
    { $set: { category: 'cleaning' } }
  );

  // 5. Appliance
  await ServiceCatalog.updateMany(
    { $or: [{ code: { $in: ['washing_machine_repair', 'refrigerator_repair', 'microwave_repair', 'ro_water_purifier', 'tv_mounting'] } }, { name: { $regex: /washing|fridge|refrigerat|microwave|purifier|ro |tv /i } }] },
    { $set: { category: 'appliance' } }
  );

  // 6. Family & Elder Assist
  await ServiceCatalog.updateMany(
    { $or: [{ code: { $in: ['helper', 'medicine_pickup', 'hospital_companion', 'grocery_assistance', 'bill_payment_assist', 'home_visit_check', 'elder_doctor_visit'] } }, { name: { $regex: /elder|companion|medicine|hospital|grocery|bill /i } }] },
    { $set: { category: 'helper' } }
  );

  // 7. Pet Care
  await ServiceCatalog.updateMany(
    { $or: [{ code: { $in: ['pet_grooming', 'pet_walking', 'pet_transport', 'pet_sitting', 'pet_vet_assist'] } }, { name: { $regex: /pet /i } }] },
    { $set: { category: 'pet' } }
  );

  // 8. Mobile Phone
  await ServiceCatalog.updateMany(
    { code: { $in: ['screen_replacement', 'battery_replacement', 'charging_issue', 'glass_replacement', 'speaker_mic_issue', 'software_issue', 'water_damage_check'] } },
    { $set: { category: 'mobile' } }
  );

  // 9. Laptop Repair
  await ServiceCatalog.updateMany(
    { $or: [{ code: { $regex: /^laptop/i } }, { name: { $regex: /laptop/i } }] },
    { $set: { category: 'laptop' } }
  );

  // 10. Car Services
  await ServiceCatalog.updateMany(
    { code: { $in: ['car_puncture', 'periodic_car_service', 'car_foam_wash_detailing', 'car_ac_gas_refill', 'car_battery_replacement', 'car_wash', 'minor_roadside_repair', 'battery_jump_start', 'fuel_delivery', 'car_breakdown', 'car_towing'] } },
    { $set: { category: 'car' } }
  );

  // 11. Bike Services
  await ServiceCatalog.updateMany(
    { code: { $in: ['bike_puncture', 'bike_periodic_service', 'bike_foam_wash', 'bike_wash', 'bike_chain_issue', 'bike_brake_issue', 'bike_battery_issue', 'bike_breakdown', 'bike_towing'] } },
    { $set: { category: 'bike' } }
  );

  // 12. New In-Depth Home Services
  const newServices = [
    // Electrical
    { code: 'fan_installation', name: 'Ceiling & Exhaust Fan Installation', category: 'electrical', subcategory: 'Fitting', shortDescription: 'Safe fan assembly, hook mounting, regulator connection & speed test.', priceRangeMinPaise: 19900, priceRangeMaxPaise: 49900, estimatedDurationMinutes: 30, requiredSkills: ['electrical'] },
    { code: 'mcb_switch_repair', name: 'MCB & Circuit Breaker Overhaul', category: 'electrical', subcategory: 'Safety', shortDescription: 'Fix frequent short circuits, tripping MCBs, main switch replacement.', priceRangeMinPaise: 29900, priceRangeMaxPaise: 89900, estimatedDurationMinutes: 45, requiredSkills: ['electrical'] },

    // Plumbing
    { code: 'tap_repair', name: 'Tap & Water Mixer Leakage Repair', category: 'plumbing', subcategory: 'Fittings', shortDescription: 'Fix dripping taps, spindle replacement, wall mixer installation.', priceRangeMinPaise: 14900, priceRangeMaxPaise: 39900, estimatedDurationMinutes: 30, requiredSkills: ['plumbing'] },
    { code: 'geyser_install', name: 'Water Heater / Geyser Service & Fitting', category: 'plumbing', subcategory: 'Appliances', shortDescription: 'Geyser wall mounting, inlet-outlet flex pipe connection, thermostat check.', priceRangeMinPaise: 39900, priceRangeMaxPaise: 89900, estimatedDurationMinutes: 45, requiredSkills: ['plumbing'] },

    // Carpentry
    { code: 'door_lock_install', name: 'Door Lock & Latch Repair / Installation', category: 'carpentry', subcategory: 'Locks', shortDescription: 'Fitting cylindrical locks, deadbolts, handle locks, latch adjustments.', priceRangeMinPaise: 24900, priceRangeMaxPaise: 59900, estimatedDurationMinutes: 45, requiredSkills: ['carpenter'] },

    // Appliances
    { code: 'washing_machine_repair', name: 'Washing Machine Service & Repair', category: 'appliance', subcategory: 'Laundry', shortDescription: 'Fix drum noise, water drain issues, PCB board failure, motor repair.', priceRangeMinPaise: 29900, priceRangeMaxPaise: 129900, estimatedDurationMinutes: 60, requiredSkills: ['appliance_repair'] },
    { code: 'refrigerator_repair', name: 'Refrigerator / Fridge Gas Refill & Repair', category: 'appliance', subcategory: 'Cooling', shortDescription: 'Fix insufficient cooling, compressor start relay, gas top-up, thermostat.', priceRangeMinPaise: 39900, priceRangeMaxPaise: 189900, estimatedDurationMinutes: 60, requiredSkills: ['appliance_repair'] },
  ];

  for (const s of newServices) {
    await ServiceCatalog.findOneAndUpdate({ code: s.code }, { ...s, isActive: true }, { upsert: true, new: true });
  }

  console.log('✅ In-Depth Taxonomy Migration Completed! All home services cleanly separated.');
  await mongoose.disconnect();
}

seedInDepthTaxonomy().catch(console.error);
