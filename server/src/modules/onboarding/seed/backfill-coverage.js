/**
 * Backfill coverage for providers approved BEFORE auto-provisioning existed.
 *
 * `auto-provision.service` now writes a default service area / pet capability
 * at approval (shops) or first go-online (individuals). Providers approved
 * before that shipped have neither, which means they are verified, priced,
 * and invisible to every customer regardless of distance. This gives them
 * the same default the new path would have.
 *
 * Shops use their registered address. Individuals are only backfilled if they
 * have a real last-known position — an individual who has never gone online
 * has no usable location, and inventing one would put their service circle
 * somewhere meaningless. Those are reported, not guessed at; they get
 * provisioned the moment they next go online.
 *
 * Safe to re-run: provisionCoverage never overwrites an existing row.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/onboarding/seed/backfill-coverage.js
 *   NODE_ENV=development node src/modules/onboarding/seed/backfill-coverage.js --report
 *   NODE_ENV=production  node src/modules/onboarding/seed/backfill-coverage.js --yes-production
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const projectRoot = path.resolve(__dirname, '../../../../');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const overlayPath = path.join(projectRoot, `.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlayPath)) {
  require('dotenv').config({ path: overlayPath, override: true });
}

const { ProviderEnrolment } = require('../onboarding.model');
const Shop = require('../../shop/shop.model');
const Worker = require('../../worker/worker.model');
const { ProviderServiceArea } = require('../../repair/models/config.model');
const { PetProviderCapability } = require('../../pet/models/config.model');
const { provisionCoverage } = require('../auto-provision.service');

/** A [0,0] default is "never reported", not a location in the Gulf of Guinea. */
function usable(coords) {
  return Array.isArray(coords) && coords.length === 2
    && !(coords[0] === 0 && coords[1] === 0)
    && Number.isFinite(coords[0]) && Number.isFinite(coords[1]);
}

async function backfill() {
  const approved = await ProviderEnrolment.find({ status: 'approved' }).lean();

  const shopIds = [...new Set(approved.filter((e) => e.shopId).map((e) => String(e.shopId)))];
  const workerIds = [...new Set(approved.filter((e) => e.workerId).map((e) => String(e.workerId)))];

  const result = {
    shopsProvisioned: 0, workersProvisioned: 0, workersSkippedNoLocation: 0, missingProvider: 0,
  };

  for (const id of shopIds) {
    const shop = await Shop.findById(id).select('address.location').lean();
    const coords = shop?.address?.location?.coordinates;
    if (!shop) { result.missingProvider++; continue; }
    if (!usable(coords)) { result.missingProvider++; continue; }
    await provisionCoverage({ shopId: shop._id, coordinates: coords });
    result.shopsProvisioned++;
  }

  for (const id of workerIds) {
    const worker = await Worker.findById(id).select('currentLocation').lean();
    if (!worker) { result.missingProvider++; continue; }
    const coords = worker.currentLocation?.coordinates;
    if (!usable(coords)) {
      // Provisioned automatically the next time they go online.
      result.workersSkippedNoLocation++;
      continue;
    }
    await provisionCoverage({ workerId: worker._id, coordinates: coords });
    result.workersProvisioned++;
  }

  return result;
}

async function report() {
  const approved = await ProviderEnrolment.countDocuments({ status: 'approved' });
  const shopsWithArea = await ProviderServiceArea.countDocuments({ shopId: { $ne: null } });
  const workersWithArea = await ProviderServiceArea.countDocuments({ workerId: { $ne: null } });
  const petCaps = await PetProviderCapability.countDocuments({});
  return [{
    approvedEnrolments: approved,
    repairServiceAreas: shopsWithArea + workersWithArea,
    petCapabilities: petCaps,
  }];
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = uri.split('/').pop().split('?')[0];

  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error(`[backfill-coverage] refusing to touch PRODUCTION database "${dbName}" without --yes-production`);
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[backfill-coverage] connected to database: ${dbName}`);

  if (process.argv.includes('--report')) {
    console.table(await report());
    await mongoose.disconnect();
    return;
  }

  console.log('\n[backfill-coverage] before:');
  console.table(await report());

  const r = await backfill();
  console.log(`[backfill-coverage] shops provisioned:   ${r.shopsProvisioned}`);
  console.log(`[backfill-coverage] workers provisioned: ${r.workersProvisioned}`);
  if (r.workersSkippedNoLocation) {
    console.log(`[backfill-coverage] workers with no location yet: ${r.workersSkippedNoLocation}`
      + '  (auto-provisioned when they next go online)');
  }
  if (r.missingProvider) {
    console.log(`[backfill-coverage] enrolments whose provider is missing or has no address: ${r.missingProvider}`);
  }

  console.log('\n[backfill-coverage] after:');
  console.table(await report());
  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[backfill-coverage] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main, backfill, report };
