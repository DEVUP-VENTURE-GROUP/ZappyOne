require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const ServiceCatalog = require('../modules/service/service-catalog.model');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/hyperlocal';

async function clean() {
  await mongoose.connect(MONGO_URI);
  console.log('Cleaning up categories in DB...');
  
  await ServiceCatalog.updateMany(
    { $or: [{ code: { $regex: /bike/i } }, { name: { $regex: /bike/i } }] },
    { $set: { category: 'bike' } }
  );

  await ServiceCatalog.updateMany(
    { $or: [{ code: { $regex: /car/i } }, { name: { $regex: /car/i } }] },
    { $set: { category: 'car' } }
  );

  console.log('✅ Service categories in DB updated!');
  await mongoose.disconnect();
}

clean().catch(console.error);
