/**
 * Seeds the whole Pet Services vertical: breeds, catalog, pricing, demo
 * providers, service areas.
 *
 * Insert-only, same discipline as every other seeder on this platform: a row
 * an operator has edited is a business decision and is never overwritten.
 * Re-running adds what is new and leaves the rest alone.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/pet/seed/run-pet-seed.js
 *   NODE_ENV=development node src/modules/pet/seed/run-pet-seed.js --report
 *   NODE_ENV=production  node src/modules/pet/seed/run-pet-seed.js --yes-production
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

const {
  Breed, PetServiceCategory, PetServiceVariant, PetServiceCompatibility,
  PetServiceAddon, PetServicePackage, PetServiceArea,
} = require('../models/catalog.model');
const { PetPricingRule, PetProviderCapability, PetCancellationPolicy } = require('../models/config.model');
const Worker = require('../../worker/worker.model');
const Shop = require('../../shop/shop.model');
const { ProviderEnrolment } = require('../../onboarding/onboarding.model');

const { ALL_BREEDS } = require('./breeds.seed');
const { CATEGORIES, VARIANTS, COMPATIBILITY } = require('./catalog.seed');
const { PRICING_RULES, ADDONS, PACKAGES, CANCELLATION_POLICIES } = require('./pricing.seed');
const { SERVICE_AREAS, DEMO_PROVIDERS } = require('./providers.seed');

async function upsertMany(Model, rows, keyFields) {
  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    const filter = Object.fromEntries(keyFields.map((f) => [f, row[f]]));
    const exists = await Model.findOne(filter).lean();
    if (exists) { skipped++; continue; }
    await Model.create(row);
    created++;
  }
  return { total: rows.length, created, skipped };
}

async function seedBreeds() {
  return upsertMany(Breed, ALL_BREEDS, ['code']);
}

async function seedCategories() {
  return upsertMany(PetServiceCategory, CATEGORIES, ['code']);
}

async function seedVariants() {
  return upsertMany(PetServiceVariant, VARIANTS, ['code']);
}

async function seedCompatibility() {
  let created = 0;
  let skipped = 0;
  for (const row of COMPATIBILITY) {
    const filter = { species: row.species, categoryCode: row.categoryCode, variantCode: row.variantCode ?? null };
    const exists = await PetServiceCompatibility.findOne(filter).lean();
    if (exists) { skipped++; continue; }
    await PetServiceCompatibility.create(row);
    created++;
  }
  return { total: COMPATIBILITY.length, created, skipped };
}

async function seedPricing() {
  let created = 0;
  let skipped = 0;
  let orphaned = 0;
  const variantCodes = new Set((await PetServiceVariant.find({}).select('code').lean()).map((v) => v.code));

  for (const rule of PRICING_RULES) {
    if (rule.variantCode && !variantCodes.has(rule.variantCode)) { orphaned++; continue; }
    const filter = {
      categoryCode: rule.categoryCode,
      variantCode: rule.variantCode ?? null,
      species: rule.species ?? null,
      cityCode: rule.cityCode ?? null,
    };
    const exists = await PetPricingRule.findOne(filter).lean();
    if (exists) { skipped++; continue; }
    await PetPricingRule.create(rule);
    created++;
  }
  return { total: PRICING_RULES.length, created, skipped, orphaned };
}

async function seedAddons() {
  return upsertMany(PetServiceAddon, ADDONS, ['code']);
}

async function seedPackages() {
  return upsertMany(PetServicePackage, PACKAGES, ['code']);
}

async function seedCancellationPolicies() {
  return upsertMany(PetCancellationPolicy, CANCELLATION_POLICIES, ['code']);
}

async function seedServiceAreas() {
  const rows = SERVICE_AREAS.map((a) => ({
    code: a.code, name: a.name, cityCode: 'hyderabad',
    centre: { type: 'Point', coordinates: a.coords }, radiusKm: 6,
  }));
  return upsertMany(PetServiceArea, rows, ['code']);
}

/** One demo provider per capability profile, plus its approved capability row. */
async function seedDemoProviders() {
  let created = 0;
  let skipped = 0;

  for (const def of DEMO_PROVIDERS) {
    const isIndividual = ['dog_walker', 'pet_sitter', 'vet_assistant'].includes(def.providerType);

    let providerId;
    if (isIndividual) {
      const existing = await Worker.findOne({ phone: def.phone }).lean();
      providerId = existing?._id || (await Worker.create({
        phone: def.phone, name: def.name, skills: ['pet_services'],
        kyc: { status: 'approved' },
        location: { type: 'Point', coordinates: def.capability.baseLocation },
        isDemo: true,
      }))._id;
    } else {
      const existing = await Shop.findOne({ phone: def.phone }).lean();
      providerId = existing?._id || (await Shop.create({
        businessName: def.name, ownerName: '[DEMO] Operator', phone: def.phone,
        address: { text: '[DEMO] Hyderabad', location: { type: 'Point', coordinates: def.capability.baseLocation } },
        isDemo: true,
      }))._id;
    }

    const key = isIndividual ? { workerId: providerId } : { shopId: providerId };
    const exists = await PetProviderCapability.findOne(key).lean();
    if (exists) { skipped++; continue; }

    /*
     * The same visibility gate every other vertical uses — but per category,
     * not one umbrella line. A provider who only grooms must not make
     * "Pet Boarding" appear live; each category card is real only when a
     * provider actually covers it.
     */
    for (const categoryCode of def.capability.categoryCodes) {
      await ProviderEnrolment.findOneAndUpdate(
        { ...key, lineCode: categoryCode },
        {
          $set: { status: 'approved' },
          $setOnInsert: { ...key, providerKind: isIndividual ? 'individual' : 'shop', domainCode: 'pet_services', lineCode: categoryCode },
        },
        { upsert: true },
      );
    }

    await PetProviderCapability.create({
      ...key,
      providerType: def.providerType,
      species: def.capability.species,
      sizes: def.capability.sizes,
      categoryCodes: def.capability.categoryCodes,
      modes: def.capability.modes,
      handlesAggressive: !!def.capability.handlesAggressive,
      handlesSpecialNeeds: !!def.capability.handlesSpecialNeeds,
      optInVariantCodes: def.capability.optInVariantCodes || [],
      boardingCapacity: def.capability.boardingCapacity || 0,
      daycareCapacity: def.capability.daycareCapacity || 0,
      serviceAreaCodes: def.capability.serviceAreaCodes,
      baseLocation: { type: 'Point', coordinates: def.capability.baseLocation },
      serviceRadiusKm: def.capability.serviceRadiusKm,
      qualifications: def.capability.qualifications || [],
      equipment: def.capability.equipment || [],
      experienceYears: def.capability.experienceYears || 0,
      verificationStatus: 'verified',
      isDemo: true,
    });
    created++;
  }

  return { total: DEMO_PROVIDERS.length, created, skipped };
}

async function report() {
  return [{
    breeds: await Breed.countDocuments({}),
    categories: await PetServiceCategory.countDocuments({}),
    variants: await PetServiceVariant.countDocuments({}),
    compatibilityRules: await PetServiceCompatibility.countDocuments({}),
    pricingRules: await PetPricingRule.countDocuments({}),
    addons: await PetServiceAddon.countDocuments({}),
    packages: await PetServicePackage.countDocuments({}),
    cancellationPolicies: await PetCancellationPolicy.countDocuments({}),
    serviceAreas: await PetServiceArea.countDocuments({}),
    demoProviders: await PetProviderCapability.countDocuments({ isDemo: true }),
  }];
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = uri.split('/').pop().split('?')[0];

  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error(`[pet-seed] refusing to seed PRODUCTION database "${dbName}" without --yes-production`);
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[pet-seed] connected to database: ${dbName}`);

  if (process.argv.includes('--report')) {
    console.table(await report());
    await mongoose.disconnect();
    return;
  }

  const results = {
    breeds: await seedBreeds(),
    categories: await seedCategories(),
    variants: await seedVariants(),
    compatibility: await seedCompatibility(),
    pricing: await seedPricing(),
    addons: await seedAddons(),
    packages: await seedPackages(),
    cancellationPolicies: await seedCancellationPolicies(),
    serviceAreas: await seedServiceAreas(),
    demoProviders: await seedDemoProviders(),
  };

  for (const [name, r] of Object.entries(results)) {
    console.log(`[pet-seed] ${name.padEnd(20)} created ${String(r.created).padStart(3)} / ${r.total}`
      + (r.skipped ? `  (${r.skipped} already existed)` : '')
      + (r.orphaned ? `  ! ${r.orphaned} orphaned` : ''));
  }

  console.log('\n[pet-seed] final state:');
  console.table(await report());
  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[pet-seed] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main, report };
