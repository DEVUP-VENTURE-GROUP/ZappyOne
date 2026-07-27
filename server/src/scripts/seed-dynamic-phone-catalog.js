/**
 * Production Seeder for Zappy Universal Service Commerce Engine.
 *
 * Populates & Isolates:
 * 1. Mobile Phone Services -> category: 'mobile'
 * 2. Laptop Repair Services -> category: 'laptop'
 * 3. Car Service & Maintenance -> category: 'car'
 * 4. Bike & Scooter Care -> category: 'bike'
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

const Brand           = require('../modules/service/brand.model');
const DeviceModel     = require('../modules/service/device-model.model');
const ServiceCatalog  = require('../modules/service/service-catalog.model');
const ServiceVariant  = require('../modules/service/service-variant.model');
const DiagnosticFlow  = require('../modules/service/diagnostic-flow.model');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/hyperlocal';

async function seed() {
  console.log('Connecting to MongoDB:', MONGO_URI);
  await mongoose.connect(MONGO_URI);

  // 1. Seed Brands
  console.log('Seeding Mobile, Laptop, Car & Bike Brands...');
  const brandsData = [
    // Phones
    { code: 'apple',    name: 'Apple',    logoUrl: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=120', category: 'mobile', sortOrder: 1 },
    { code: 'samsung',  name: 'Samsung',  logoUrl: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=120', category: 'mobile', sortOrder: 2 },
    { code: 'oneplus',  name: 'OnePlus',  logoUrl: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=120', category: 'mobile', sortOrder: 3 },
    { code: 'xiaomi',   name: 'Xiaomi',   logoUrl: 'https://images.unsplash.com/photo-1546054454-aa26e2b734c7?w=120', category: 'mobile', sortOrder: 4 },
    { code: 'vivo',     name: 'Vivo',     logoUrl: 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=120', category: 'mobile', sortOrder: 5 },
    { code: 'oppo',     name: 'Oppo',     logoUrl: 'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=120', category: 'mobile', sortOrder: 6 },
    { code: 'realme',   name: 'Realme',   logoUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=120', category: 'mobile', sortOrder: 7 },
    { code: 'google',   name: 'Google',   logoUrl: 'https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?w=120', category: 'mobile', sortOrder: 8 },
    { code: 'nothing',  name: 'Nothing',  logoUrl: 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=120', category: 'mobile', sortOrder: 9 },
    { code: 'motorola', name: 'Motorola', logoUrl: 'https://images.unsplash.com/photo-1585060544812-6b45742d762f?w=120', category: 'mobile', sortOrder: 10 },
    // Laptops
    { code: 'apple-mac', name: 'Apple Mac', logoUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=120', category: 'laptop', sortOrder: 11 },
    { code: 'dell',      name: 'Dell',      logoUrl: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=120', category: 'laptop', sortOrder: 12 },
    { code: 'hp',        name: 'HP',        logoUrl: 'https://images.unsplash.com/photo-1589561084283-930aa7b1ce50?w=120', category: 'laptop', sortOrder: 13 },
    { code: 'lenovo',    name: 'Lenovo',    logoUrl: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=120', category: 'laptop', sortOrder: 14 },
    { code: 'asus',      name: 'Asus',      logoUrl: 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=120', category: 'laptop', sortOrder: 15 },
    { code: 'acer',      name: 'Acer',      logoUrl: 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=120', category: 'laptop', sortOrder: 16 },
    // Cars
    { code: 'maruti',    name: 'Maruti Suzuki', logoUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=120', category: 'car', sortOrder: 17 },
    { code: 'hyundai',   name: 'Hyundai',       logoUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=120', category: 'car', sortOrder: 18 },
    { code: 'tata',      name: 'Tata Motors',   logoUrl: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=120', category: 'car', sortOrder: 19 },
    { code: 'mahindra',  name: 'Mahindra',      logoUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=120', category: 'car', sortOrder: 20 },
    { code: 'honda-car', name: 'Honda Cars',    logoUrl: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=120', category: 'car', sortOrder: 21 },
    { code: 'toyota',    name: 'Toyota',        logoUrl: 'https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=120', category: 'car', sortOrder: 22 },
    // Bikes
    { code: 'royalenfield', name: 'Royal Enfield', logoUrl: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=120', category: 'bike', sortOrder: 23 },
    { code: 'tvs',          name: 'TVS Bikes',     logoUrl: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=120', category: 'bike', sortOrder: 24 },
    { code: 'bajaj',        name: 'Bajaj Auto',    logoUrl: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=120', category: 'bike', sortOrder: 25 },
    { code: 'ktm',          name: 'KTM Racing',    logoUrl: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=120', category: 'bike', sortOrder: 26 },
  ];

  const brandDocs = {};
  for (const b of brandsData) {
    const doc = await Brand.findOneAndUpdate({ code: b.code }, b, { upsert: true, new: true });
    brandDocs[b.code] = doc;
  }

  // Deactivate generic legacy 'puncture'
  await ServiceCatalog.findOneAndUpdate({ code: 'puncture' }, { isActive: false });

  // 2. Seed Models
  console.log('Seeding Models...');
  const modelsData = [
    // Phones
    { brandCode: 'apple', seriesName: 'iPhone 15 Series', name: 'iPhone 15 Pro Max', code: 'apple-iphone-15-pro-max', launchYear: 2023 },
    { brandCode: 'apple', seriesName: 'iPhone 14 Series', name: 'iPhone 14', code: 'apple-iphone-14', launchYear: 2022 },
    // Laptops
    { brandCode: 'apple-mac', seriesName: 'MacBook Air', name: 'MacBook Air M2 13"', code: 'macbook-air-m2-13', launchYear: 2022 },
    // Cars
    { brandCode: 'maruti', seriesName: 'Hatchbacks', name: 'Maruti Swift VXi / ZXi', code: 'maruti-swift', launchYear: 2023 },
    { brandCode: 'hyundai', seriesName: 'SUVs', name: 'Hyundai Creta SX', code: 'hyundai-creta', launchYear: 2024 },
    // Bikes
    { brandCode: 'royalenfield', seriesName: 'Retro Cruisers', name: 'Royal Enfield Classic 350', code: 're-classic-350', launchYear: 2023 },
  ];

  const modelDocs = {};
  for (const m of modelsData) {
    const brandId = brandDocs[m.brandCode]._id;
    const doc = await DeviceModel.findOneAndUpdate({ code: m.code }, { ...m, brandId }, { upsert: true, new: true });
    modelDocs[m.code] = doc;
  }

  // 3. Seed Car & Bike Services Taxonomy (Distinct Car Puncture & Bike Puncture)
  console.log('Seeding Car & Bike Services Taxonomy...');
  
  const vehicleServicesData = [
    // Car Services (category: 'car')
    { code: 'car_puncture', name: 'Car Tubeless Puncture Repair & Stepney Change', category: 'car', subcategory: 'Tyre & Roadside', shortDescription: 'Doorstep tubeless tyre puncture repair, strip plug & stepney tire replacement.', priceRangeMinPaise: 24900, priceRangeMaxPaise: 59900, estimatedDurationMinutes: 30, requiredSkills: ['mechanic_repair'] },
    { code: 'periodic_car_service', name: 'Comprehensive Periodic Car Service', category: 'car', subcategory: 'Maintenance', shortDescription: 'Full Synthetic Engine Oil, Oil Filter, Air Filter, 40-Point Inspection & Car Wash.', priceRangeMinPaise: 249900, priceRangeMaxPaise: 899900, estimatedDurationMinutes: 180, requiredSkills: ['mechanic_repair'], imageUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=400' },
    { code: 'car_foam_wash_detailing', name: 'Full Car Foam Wash & Deep Detailing', category: 'car', subcategory: 'Washing & Polish', shortDescription: 'High-pressure foam wash, interior vacuuming, dashboard polish, underbody wash.', priceRangeMinPaise: 49900, priceRangeMaxPaise: 149900, estimatedDurationMinutes: 60, requiredSkills: ['car_wash'], imageUrl: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?w=400' },
    { code: 'car_ac_gas_refill', name: 'Car AC Gas Refill & Leak Check', category: 'car', subcategory: 'AC Service', shortDescription: 'R134a AC Gas Top-up, Condenser Cleaning, Vent Disinfection & Cooling Test.', priceRangeMinPaise: 129900, priceRangeMaxPaise: 249900, estimatedDurationMinutes: 45, requiredSkills: ['mechanic_repair'] },
    { code: 'car_battery_replacement', name: 'Car Battery Replacement & Doorstep Fitting', category: 'car', subcategory: 'Battery & Electrical', shortDescription: 'Brand New Amaron / Exide Battery with 55Mo Warranty + Free Doorstep Installation.', priceRangeMinPaise: 349900, priceRangeMaxPaise: 850000, estimatedDurationMinutes: 30, requiredSkills: ['mechanic_repair'] },

    // Bike Services (category: 'bike')
    { code: 'bike_puncture', name: 'Doorstep Bike & Scooter Puncture Repair', category: 'bike', subcategory: 'Tyre & Roadside', shortDescription: 'Tubeless puncture strip fix or tube vulcanizing with high-pressure air fill at doorstep.', priceRangeMinPaise: 14900, priceRangeMaxPaise: 34900, estimatedDurationMinutes: 20, requiredSkills: ['bike_mechanic'] },
    { code: 'bike_periodic_service', name: 'Full Bike Engine Service & Tuning', category: 'bike', subcategory: 'Bike Care', shortDescription: 'Engine Oil Change, Chain Lube & Tensioning, Brake Adjustments, Air Filter & Wash.', priceRangeMinPaise: 49900, priceRangeMaxPaise: 189900, estimatedDurationMinutes: 60, requiredSkills: ['bike_mechanic'], imageUrl: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=400' },
    { code: 'bike_foam_wash', name: 'Bike Pressure Foam Wash & Polish', category: 'bike', subcategory: 'Washing', shortDescription: 'Deep pressure foam wash, engine degreasing, chain lube & glossy polish.', priceRangeMinPaise: 19900, priceRangeMaxPaise: 49900, estimatedDurationMinutes: 30, requiredSkills: ['bike_wash'] },
  ];

  for (const s of vehicleServicesData) {
    await ServiceCatalog.findOneAndUpdate({ code: s.code }, { ...s, isActive: true }, { upsert: true, new: true });
  }

  console.log('✅ Distinct Car Puncture & Bike Puncture Seeder Completed Successfully!');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
