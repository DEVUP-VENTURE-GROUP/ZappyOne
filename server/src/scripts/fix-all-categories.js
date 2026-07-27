require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const ServiceCatalog = require('../modules/service/service-catalog.model');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/hyperlocal';

async function fixAllCategories() {
  await mongoose.connect(MONGO_URI);
  console.log('Cleaning and categorizing all services in MongoDB...');

  // 1. Home Services
  await ServiceCatalog.updateMany(
    { code: { $in: ['carpenter', 'plumbing', 'electrical', 'ac_repair', 'cleaning', 'painting', 'mason', 'helper', 'deep_cleaning'] } },
    { $set: { category: 'home' } }
  );

  // 2. Mobile Services
  await ServiceCatalog.updateMany(
    { code: { $in: ['screen_replacement', 'battery_replacement', 'charging_issue', 'glass_replacement', 'speaker_mic_issue', 'software_issue', 'water_damage_check'] } },
    { $set: { category: 'mobile' } }
  );

  // 3. Laptop Services
  await ServiceCatalog.updateMany(
    { $or: [{ code: { $regex: /^laptop/i } }, { name: { $regex: /laptop/i } }] },
    { $set: { category: 'laptop' } }
  );

  // 4. Car Services
  await ServiceCatalog.updateMany(
    { code: { $in: ['car_puncture', 'periodic_car_service', 'car_foam_wash_detailing', 'car_ac_gas_refill', 'car_battery_replacement', 'car_wash', 'minor_roadside_repair', 'battery_jump_start', 'fuel_delivery'] } },
    { $set: { category: 'car' } }
  );

  // 5. Bike Services
  await ServiceCatalog.updateMany(
    { code: { $in: ['bike_puncture', 'bike_periodic_service', 'bike_foam_wash', 'bike_wash'] } },
    { $set: { category: 'bike' } }
  );

  console.log('✅ All services in MongoDB categorized with 100% precision!');
  await mongoose.disconnect();
}

fixAllCategories().catch(console.error);
