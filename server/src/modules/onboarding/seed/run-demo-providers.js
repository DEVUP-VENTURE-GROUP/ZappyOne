/**
 * DEMO providers, so every live service is actually visible while testing.
 *
 * WHY THIS EXISTS. `liveCatalog` refuses to advertise a service nobody is
 * verified to do — a line can be flipped `live` before a single provider has
 * been onboarded, and showing it would send a customer down a booking flow
 * that dead-ends at "no providers". That rule is correct in production and it
 * is exactly why a fresh dev database shows only the one line that happens to
 * have real enrolments.
 *
 * So the fix for development is SUPPLY, not weakening the rule. This creates
 * one clearly-marked demo provider per live line and approves their
 * enrolment, which is the same path a real provider walks.
 *
 * Every record it writes is named `[DEMO]` and carries `isDemo: true`, so a
 * demo provider is never mistaken for a real one and can be removed in one
 * query. Refuses to run against production without an explicit flag.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/onboarding/seed/run-demo-providers.js
 *   NODE_ENV=development node src/modules/onboarding/seed/run-demo-providers.js --remove
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

const { ServiceLine, ProviderEnrolment } = require('../onboarding.model');
const Worker = require('../../worker/worker.model');
const Shop = require('../../shop/shop.model');

/** Hyderabad, near the areas the platform already seeds. */
const CENTRE = [78.3871, 17.4435];

/** A demo phone number per line — reserved 9999-prefixed, never a real one. */
const DEMO_PHONE_BASE = 9999900000;

async function seedDemoProviders() {
  const lines = await ServiceLine.find({
    status: 'live', isActive: true, customerPath: { $ne: '' },
  }).lean();

  let created = 0;
  let already = 0;

  for (const [i, line] of lines.entries()) {
    const phone = String(DEMO_PHONE_BASE + i);

    /*
     * A shop for lines a business fulfils, a worker for lines an individual
     * does. `providerKinds` on the line is the platform's own answer to that
     * question, so it is read rather than guessed.
     */
    const kinds = line.providerKinds || [];
    const asIndividual = kinds.length === 1 && kinds[0] === 'individual';

    let providerId;
    let providerKind;

    if (asIndividual) {
      providerKind = 'individual';
      const existing = await Worker.findOne({ phone }).lean();
      providerId = existing?._id || (await Worker.create({
        phone,
        name: `[DEMO] ${line.name} Helper`,
        skills: [line.code],
        kyc: { status: 'approved' },
        location: { type: 'Point', coordinates: CENTRE },
        isDemo: true,
      }))._id;
    } else {
      providerKind = 'shop';
      const existing = await Shop.findOne({ phone }).lean();
      providerId = existing?._id || (await Shop.create({
        businessName: `[DEMO] ${line.name} Provider`,
        ownerName: '[DEMO] Operator',
        phone,
        address: {
          text: '[DEMO] Gachibowli, Hyderabad',
          location: { type: 'Point', coordinates: CENTRE },
        },
        isDemo: true,
      }))._id;
    }

    const key = providerKind === 'shop' ? { shopId: providerId } : { workerId: providerId };
    const existingEnrolment = await ProviderEnrolment.findOne({
      ...key, lineCode: line.code,
    }).lean();

    if (existingEnrolment?.status === 'approved') { already++; continue; }

    await ProviderEnrolment.findOneAndUpdate(
      { ...key, lineCode: line.code },
      {
        $set: { status: 'approved' },
        $setOnInsert: {
          ...key,
          providerKind,
          domainCode: line.domainCode,
          lineCode: line.code,
        },
      },
      { upsert: true, new: true },
    );
    created++;
  }

  return { total: lines.length, created, already };
}

/** Undo — every demo record is findable by the flag it was written with. */
async function removeDemoProviders() {
  const shops = await Shop.find({ isDemo: true }).select('_id').lean();
  const workers = await Worker.find({ isDemo: true }).select('_id').lean();

  const removedEnrolments = await ProviderEnrolment.deleteMany({
    $or: [
      { shopId: { $in: shops.map((s) => s._id) } },
      { workerId: { $in: workers.map((w) => w._id) } },
    ],
  });
  await Shop.deleteMany({ isDemo: true });
  await Worker.deleteMany({ isDemo: true });

  return {
    shops: shops.length, workers: workers.length, enrolments: removedEnrolments.deletedCount,
  };
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = uri.split('/').pop().split('?')[0];

  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error(`[demo-providers] refusing to touch PRODUCTION database "${dbName}"`);
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[demo-providers] connected to database: ${dbName}`);

  if (process.argv.includes('--remove')) {
    const r = await removeDemoProviders();
    console.log(`[demo-providers] removed ${r.shops} shops, ${r.workers} workers, ${r.enrolments} enrolments`);
    await mongoose.disconnect();
    return;
  }

  const r = await seedDemoProviders();
  console.log(`[demo-providers] approved ${r.created} / ${r.total} live lines`
    + (r.already ? `  (${r.already} already had one)` : ''));

  const rows = [];
  for (const line of await ServiceLine.find({ status: 'live', customerPath: { $ne: '' } }).lean()) {
    rows.push({
      line: line.code,
      approvedProviders: await ProviderEnrolment.countDocuments({ lineCode: line.code, status: 'approved' }),
      visibleToCustomers: (await ProviderEnrolment.countDocuments({ lineCode: line.code, status: 'approved' })) > 0,
    });
  }
  console.table(rows);

  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[demo-providers] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main, seedDemoProviders, removeDemoProviders };
