require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const ServiceCatalog = require('../modules/service/service-catalog.model');
const ServiceVariant = require('../modules/service/service-variant.model');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/hyperlocal';

async function deleteGenericPuncture() {
  await mongoose.connect(MONGO_URI);
  console.log('Permanently removing generic Puncture Repair service from MongoDB...');

  // Delete generic 'puncture' document from ServiceCatalog
  const res = await ServiceCatalog.deleteMany({ code: 'puncture' });
  console.log(`Deleted ${res.deletedCount} generic puncture service(s) from ServiceCatalog.`);

  // Also clean up any ServiceVariants for code 'puncture'
  const vRes = await ServiceVariant.deleteMany({ serviceCode: 'puncture' });
  console.log(`Deleted ${vRes.deletedCount} generic puncture service variant(s).`);

  console.log('✅ Generic Puncture service permanently deleted! Only Car Puncture & Bike Puncture remain.');
  await mongoose.disconnect();
}

deleteGenericPuncture().catch(console.error);
