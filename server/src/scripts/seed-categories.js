/**
 * Seed the Category collection with the 13 built-in verticals, matching the
 * previously-hardcoded serviceCatalogGroups.js exactly, so grouping behaviour is
 * unchanged until an admin edits/adds a category. Idempotent (upsert by key).
 *
 *   node src/scripts/seed-categories.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Category = require('../modules/service/category.model');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/hyperlocal';

const T = {
  blue:   { accent: '#2563EB', deep: '#1E3A8A', tint: '#EFF6FF', soft: '#DBEAFE', glow: 'rgba(37,99,235,0.20)' },
  teal:   { accent: '#0E9488', deep: '#134E4A', tint: '#F0FDFA', soft: '#CCFBF1', glow: 'rgba(14,148,136,0.20)' },
  violet: { accent: '#6D4DF6', deep: '#3B1E8F', tint: '#F5F3FF', soft: '#EDE9FE', glow: 'rgba(109,77,246,0.20)' },
  amber:  { accent: '#D97706', deep: '#7C2D12', tint: '#FFFBEB', soft: '#FEF3C7', glow: 'rgba(217,119,6,0.20)' },
  green:  { accent: '#16A34A', deep: '#14532D', tint: '#F0FDF4', soft: '#DCFCE7', glow: 'rgba(22,163,74,0.20)' },
  rose:   { accent: '#E11D48', deep: '#881337', tint: '#FFF1F2', soft: '#FFE4E6', glow: 'rgba(225,29,72,0.20)' },
  cyan:   { accent: '#0891B2', deep: '#164E63', tint: '#ECFEFF', soft: '#CFFAFE', glow: 'rgba(8,145,178,0.20)' },
  slate:  { accent: '#334155', deep: '#0F172A', tint: '#F8FAFC', soft: '#E2E8F0', glow: 'rgba(51,65,85,0.20)' },
};

const CAR_BRANDS  = ['Maruti Suzuki', 'Hyundai', 'Tata', 'Mahindra', 'Honda', 'Toyota', 'Kia', 'Volkswagen'];
const BIKE_BRANDS = ['Hero', 'Honda', 'TVS', 'Bajaj', 'Royal Enfield', 'Yamaha', 'KTM'];

const CATEGORIES = [
  { key: 'mobile',     customerLabel: 'Phone Repair',          icon: 'Smartphone', theme: T.violet, matchCategories: ['mobile'],     brands: ['Apple','Samsung','OnePlus','Xiaomi','Vivo','Oppo','Realme','Google','Motorola','Nothing'], brandCategory: 'mobile' },
  { key: 'laptop',     customerLabel: 'Laptop Repair',         icon: 'Laptop',     theme: T.slate,  matchCategories: ['laptop'],     codePrefixes: ['laptop_'], brands: ['Apple','Dell','HP','Lenovo','Asus','Acer','MSI'], brandCategory: 'laptop' },
  { key: 'car',        customerLabel: 'Car Services',          icon: 'Car',        theme: T.blue,   matchCategories: ['car'],        codePrefixes: ['car_'], brands: CAR_BRANDS,  brandCategory: 'car' },
  { key: 'bike',       customerLabel: 'Bike Services',         icon: 'Bike',       theme: T.cyan,   matchCategories: ['bike'],       codePrefixes: ['bike_'], brands: BIKE_BRANDS, brandCategory: 'bike' },
  { key: 'event',      customerLabel: 'Event Crew',            icon: 'Sparkles',   theme: T.violet, matchCategories: ['event'],      codePrefixes: ['event_'] },
  { key: 'pet',        customerLabel: 'Pet Care',              icon: 'PawPrint',   theme: T.green,  matchCategories: ['pet'],        codePrefixes: ['pet_'] },
  { key: 'family',     customerLabel: 'Family & Elder Assist', icon: 'Users',      theme: T.rose,   matchCategories: ['helper'] },
  { key: 'smart',      customerLabel: 'Smart Home Devices',    icon: 'Wifi',       theme: T.teal,   matchCategories: ['other'] },
  { key: 'appliance',  customerLabel: 'Appliances & Devices',  icon: 'Plug',       theme: T.amber,  matchCategories: ['appliance'] },
  { key: 'electrical', customerLabel: 'Electrical',            icon: 'Bolt',       theme: T.amber,  matchCategories: ['electrical'] },
  { key: 'plumbing',   customerLabel: 'Plumbing',              icon: 'Droplets',   theme: T.blue,   matchCategories: ['plumbing'] },
  { key: 'carpentry',  customerLabel: 'Carpentry & Locks',     icon: 'Hammer',     theme: T.amber,  matchCategories: ['carpentry'] },
  { key: 'cleaning',   customerLabel: 'Cleaning & Tank Care',  icon: 'Sparkles',   theme: T.teal,   matchCategories: ['cleaning'] },
  { key: 'commercial', customerLabel: 'Commercial & Fleet',    icon: 'Truck',      theme: T.slate,  matchCategories: ['vehicle'], brandCategory: 'car' },
];

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Seeding service categories…');
  let i = 0;
  for (const c of CATEGORIES) {
    await Category.findOneAndUpdate(
      { key: c.key },
      { $set: { ...c, sortOrder: i, isActive: true, showInCustomer: true } },
      { upsert: true, new: true }
    );
    i += 1;
    console.log(`  ✓ ${c.key} (${c.customerLabel})`);
  }
  console.log(`✅ Seeded ${CATEGORIES.length} categories.`);
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
