/**
 * Legacy pricing migration tests.
 *
 * The production database holds 147 mobile ServiceVariant rows of real,
 * hand-tuned prices. This migration is the only thing standing between those
 * and being lost when the old catalog is retired, so its behaviour is pinned
 * here rather than trusted to a one-off dry run.
 */

const { startMongo, stopMongo } = require('./helpers');
const ServiceVariant = require('../src/modules/service/service-variant.model');
const { ZappyReferencePricing } = require('../src/modules/repair/models/pricing.model');
const { Repair } = require('../src/modules/repair/models/repair.model');
const { SERVICE_TO_REPAIR, TIER_TO_QUALITY } = require('../src/modules/repair/seed/migrate-legacy-pricing');
const seed = require('../src/modules/repair/seed/catalog.seed');
const mongoose = require('mongoose');

jest.setTimeout(60000);

/**
 * The migration script owns its own DB connection, so the logic is re-run here
 * against the in-memory database rather than shelling out to the CLI.
 */
async function migrate({ dryRun = false } = {}) {
  const variants = await ServiceVariant.find({}).lean();
  const repairCodes = new Set((await Repair.find({}).select('code').lean()).map((r) => r.code));
  const stats = { migrated: 0, skippedExisting: 0, mappable: 0, blockedOnCatalog: 0, invalid: 0, unmapped: [] };

  for (const v of variants) {
    const repairCode = SERVICE_TO_REPAIR[v.serviceCode];
    if (!repairCode) { stats.unmapped.push(v.serviceCode); continue; }
    stats.mappable++;
    if (!repairCodes.has(repairCode)) { stats.blockedOnCatalog++; continue; }

    const qualityCode = TIER_TO_QUALITY[v.qualityTier] || 'standard';
    const recommended = v.totalPricePaise;
    if (!recommended || recommended <= 0) { stats.invalid++; continue; }

    const scope = {
      repairCode, brandCode: v.brandCode || null, modelCode: v.modelCode || null,
      qualityCode, serviceMode: null, cityCode: null,
    };
    if (await ZappyReferencePricing.findOne({ ...scope, supersededAt: null }).lean()) {
      stats.skippedExisting++; continue;
    }
    if (!dryRun) {
      await ZappyReferencePricing.create({
        vertical: 'mobile', ...scope,
        minPaise: Math.round(recommended * 0.9),
        recommendedPaise: recommended,
        maxPaise: Math.round(recommended * 1.15),
        partCostPaise: v.partPricePaise || 0,
        labourPaise: v.laborPricePaise || 0,
        warrantyDays: v.warrantyDays || 0,
        note: `Migrated from ServiceVariant ${v._id}`,
      });
    }
    stats.migrated++;
  }
  return stats;
}

beforeAll(async () => {
  await startMongo();

  await Repair.insertMany(
    seed.REPAIRS.map((r) => ({
      code: r.code, name: r.name, vertical: 'mobile',
      pricingMode: r.pricingMode, minSkillLevel: r.minSkillLevel,
      allowedServiceModes: r.modes, warrantyDays: r.warrantyDays,
    })),
  );

  await ServiceVariant.insertMany([
    // Mobile rows that should migrate.
    {
      serviceCode: 'screen_replacement', brandCode: 'samsung',
      modelId: new mongoose.Types.ObjectId(), modelCode: 'samsung-s23-ultra',
      qualityTier: 'Premium', partName: 'OLED Assembly',
      partPricePaise: 1500000, laborPricePaise: 500000, totalPricePaise: 2000000,
      warrantyDays: 180, estimatedMin: 60,
    },
    {
      serviceCode: 'battery_replacement', brandCode: 'apple',
      modelId: new mongoose.Types.ObjectId(), modelCode: 'apple-iphone-14',
      qualityTier: 'OEM', partPricePaise: 400000, laborPricePaise: 100000,
      totalPricePaise: 500000, warrantyDays: 365,
    },
    {
      // "Budget" must collapse into `standard` — the old tiers were inconsistent.
      serviceCode: 'charging_issue', brandCode: 'xiaomi',
      modelId: new mongoose.Types.ObjectId(), modelCode: 'xiaomi-note-12',
      qualityTier: 'Budget', partPricePaise: 80000, laborPricePaise: 60000,
      totalPricePaise: 140000, warrantyDays: 30,
    },
    {
      // A symptom code that must resolve to the repair actually performed.
      serviceCode: 'green_line_diagnosis', brandCode: 'samsung',
      modelId: new mongoose.Types.ObjectId(), modelCode: 'samsung-s21',
      qualityTier: 'Compatible', partPricePaise: 900000, laborPricePaise: 300000,
      totalPricePaise: 1200000, warrantyDays: 90,
    },
    // Another vertical — must be skipped, not mangled into the mobile catalog.
    {
      serviceCode: 'laptop_screen_replacement', brandCode: 'dell',
      modelId: new mongoose.Types.ObjectId(), modelCode: 'dell-xps-13',
      qualityTier: 'Premium', partPricePaise: 900000, laborPricePaise: 200000,
      totalPricePaise: 1100000, warrantyDays: 90,
    },
  ]);
});

afterAll(async () => { await stopMongo(); });

describe('legacy pricing migration', () => {
  it('migrates only mobile rows and leaves other verticals alone', async () => {
    const stats = await migrate();
    expect(stats.mappable).toBe(4);
    expect(stats.migrated).toBe(4);
    expect(stats.unmapped).toEqual(['laptop_screen_replacement']);

    const total = await ZappyReferencePricing.countDocuments({});
    expect(total).toBe(4);
  });

  it('turns a single legacy price into a band around it', async () => {
    const row = await ZappyReferencePricing.findOne({ modelCode: 'samsung-s23-ultra' }).lean();
    expect(row.recommendedPaise).toBe(2000000);   // the legacy figure, unchanged
    expect(row.minPaise).toBe(1800000);
    expect(row.maxPaise).toBe(2300000);
    expect(row.minPaise).toBeLessThan(row.recommendedPaise);
    expect(row.maxPaise).toBeGreaterThan(row.recommendedPaise);
  });

  it('preserves the part/labour split and warranty', async () => {
    const row = await ZappyReferencePricing.findOne({ modelCode: 'apple-iphone-14' }).lean();
    expect(row.partCostPaise).toBe(400000);
    expect(row.labourPaise).toBe(100000);
    expect(row.warrantyDays).toBe(365);
    expect(row.qualityCode).toBe('oem');
  });

  it('maps a symptom code onto the repair actually performed', async () => {
    const row = await ZappyReferencePricing.findOne({ modelCode: 'samsung-s21' }).lean();
    // green_line_diagnosis described what the customer saw; the work is a panel swap.
    expect(row.repairCode).toBe('display_assembly_replacement');
  });

  it('collapses Budget and Compatible into the standard grade', async () => {
    const budget = await ZappyReferencePricing.findOne({ modelCode: 'xiaomi-note-12' }).lean();
    const compatible = await ZappyReferencePricing.findOne({ modelCode: 'samsung-s21' }).lean();
    expect(budget.qualityCode).toBe('standard');
    expect(compatible.qualityCode).toBe('standard');
  });

  it('is idempotent — a second run writes nothing new', async () => {
    const before = await ZappyReferencePricing.countDocuments({});
    const stats = await migrate();
    const after = await ZappyReferencePricing.countDocuments({});

    expect(stats.migrated).toBe(0);
    expect(stats.skippedExisting).toBe(4);
    expect(after).toBe(before);
  });

  it('refuses to create prices for repairs that do not exist yet', async () => {
    await Repair.deleteMany({ code: 'display_assembly_replacement' });
    await ZappyReferencePricing.deleteMany({ repairCode: 'display_assembly_replacement' });

    const stats = await migrate();
    expect(stats.blockedOnCatalog).toBeGreaterThan(0);
    // No orphan price pointing at a repair nobody can book.
    const orphans = await ZappyReferencePricing.countDocuments({ repairCode: 'display_assembly_replacement' });
    expect(orphans).toBe(0);
  });
});
