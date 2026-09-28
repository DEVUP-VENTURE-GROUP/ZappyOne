/**
 * Idempotent seeder for ANY repair vertical.
 *
 * There was one of these per vertical — three hundred near-identical lines
 * copied for laptop, about to be copied again for two-wheelers. The upsert
 * discipline is not vertical-specific, so it lives here once and the vertical
 * arrives as an argument. Adding a fourth vertical is now a seed data file and
 * nothing else (§91).
 *
 * The discipline itself: `$setOnInsert` for anything an admin might reasonably
 * have edited (names, ordering, warranty defaults) so a re-run never overwrites
 * a human decision; `$set` only for structural links that must stay correct.
 * Re-running against a live database is safe and expected — it is how a new
 * problem or repair reaches an existing deployment.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/repair/seed/run-vertical-seed.js two_wheeler
 *   NODE_ENV=development node src/modules/repair/seed/run-vertical-seed.js laptop --report
 *   NODE_ENV=production  node src/modules/repair/seed/run-vertical-seed.js two_wheeler --yes-production
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Env is loaded the way src/config/index.js does — base .env then the
// .env.<NODE_ENV> overlay. Plain dotenv would read only the base file, whose
// MONGO_URI points at live `zappy`, and seed production without saying so.
const projectRoot = path.resolve(__dirname, '../../../../');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const overlayPath = path.join(projectRoot, `.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlayPath)) {
  require('dotenv').config({ path: overlayPath, override: true });
}

const { ProblemCategory, Problem } = require('../models/problem.model');
const { Repair } = require('../models/repair.model');
const { SkillLevel } = require('../models/capability.model');
const { QAChecklist, RepairConfig } = require('../models/config.model');
const { ProductType } = require('../models/catalog.model');
const Brand = require('../../service/brand.model');
const DeviceModel = require('../../service/device-model.model');
const DiagnosticFlow = require('../../service/diagnostic-flow.model');
const { VERTICALS } = require('../vertical');

/**
 * Where each vertical's content lives.
 *
 * Mobile is absent on purpose: it predates this structure and has its own
 * runner (`run-seed.js`) with legacy migration steps that do not generalise.
 */
const SEEDS = {
  laptop: { data: './laptop.seed', flows: './laptop-diagnostics.seed', models: null },
  two_wheeler: { data: './two-wheeler.seed', flows: './two-wheeler-diagnostics.seed', models: './two-wheeler-models.seed' },
  four_wheeler: { data: './four-wheeler.seed', flows: './four-wheeler-diagnostics.seed', models: './four-wheeler-models.seed' },
  water_tank_care: { data: './water-tank-care.seed', flows: './water-tank-care-diagnostics.seed', models: './water-tank-care-models.seed' },
};

function loadSeed(vertical) {
  const entry = SEEDS[vertical];
  if (!entry) {
    const known = Object.keys(SEEDS).join(', ');
    throw new Error(`No seed data for vertical "${vertical}". Known: ${known}`);
  }
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const data = require(entry.data);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const FLOWS = entry.flows ? require(entry.flows).FLOWS : [];
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const models = entry.models ? require(entry.models) : null;
  return { data, FLOWS, models };
}

/* Steps */

async function seedBrands(V, seed) {
  let created = 0;
  for (const b of seed.BRANDS) {
    const res = await Brand.updateOne(
      { code: b.code },
      {
        $set: { category: V },
        $setOnInsert: { name: b.name, sortOrder: b.sortOrder, isActive: true, logoUrl: '' },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.BRANDS.length, created };
}

async function seedProductTypes(V, seed) {
  let created = 0;
  for (const t of seed.PRODUCT_TYPES) {
    const res = await ProductType.updateOne(
      { vertical: V, code: t.code },
      {
        $setOnInsert: {
          name: t.name, displayOrder: t.displayOrder,
          isPopular: !!t.isPopular, isActive: true,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.PRODUCT_TYPES.length, created };
}

async function seedProblemCategories(V, seed) {
  let created = 0;
  for (const c of seed.PROBLEM_CATEGORIES) {
    const res = await ProblemCategory.updateOne(
      { vertical: V, code: c.code },
      { $setOnInsert: { name: c.name, icon: c.icon, displayOrder: c.displayOrder, isActive: c.isActive !== false } },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.PROBLEM_CATEGORIES.length, created };
}

async function seedProblems(V, seed) {
  const cats = await ProblemCategory.find({ vertical: V }).lean();
  const byCode = new Map(cats.map((c) => [c.code, c._id]));

  let created = 0;
  let orphaned = 0;
  for (const p of seed.PROBLEMS) {
    const categoryId = byCode.get(p.categoryCode);
    if (!categoryId) { orphaned++; continue; }

    const res = await Problem.updateOne(
      { vertical: V, code: p.code },
      {
        // Category linkage is structural — it must stay correct on re-run.
        $set: { categoryId, categoryCode: p.categoryCode },
        $setOnInsert: {
          name: p.name,
          candidateRepairCodes: p.candidateRepairCodes || [],
          requiresDiagnosis: !!p.requiresDiagnosis,
          severity: p.severity || 'normal',
          // Which vehicle/product types this symptom applies to. Empty = all.
          appliesToProductTypeCodes: p.appliesToProductTypeCodes || [],
          // And which fuels/powertrains. Independent of the body type: a Swift
          // is petrol or CNG, a Nexon petrol, diesel or electric.
          appliesToFuelTypes: p.appliesToFuelTypes || [],
          isPopular: !!p.isPopular,
          isActive: true,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.PROBLEMS.length, created, orphaned };
}

async function seedRepairs(V, seed) {
  // The vertical's catch-all checklist — the one with no repairCodes of its
  // own — so every repair has QA even before a specific list is written.
  const standard = (seed.QA_CHECKLISTS.find((c) => !c.repairCodes?.length) || {}).code;

  let created = 0;
  for (const r of seed.REPAIRS) {
    // Which problems list this repair as a candidate — derived rather than
    // duplicated, so the two halves of the seed cannot drift apart.
    const problemCodes = seed.PROBLEMS
      .filter((p) => (p.candidateRepairCodes || []).includes(r.code))
      .map((p) => p.code);

    const res = await Repair.updateOne(
      { vertical: V, code: r.code },
      {
        $set: { problemCodes },
        $setOnInsert: {
          name: r.name,
          pricingMode: r.pricingMode,
          requiresDiagnosis: r.pricingMode === 'diagnosis_required',
          minSkillLevel: r.minSkillLevel,
          allowedServiceModes: r.modes,
          estimatedDurationMin: r.durationMin,
          warrantyDays: r.warrantyDays,
          qaChecklistCodes: standard ? [standard] : [],
          partRequirements: r.component
            ? [{ componentCode: r.component, required: true, quantity: 1 }]
            : [],
          isActive: true,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.REPAIRS.length, created };
}

async function seedSkillLevels(V, seed) {
  let created = 0;
  for (const l of seed.SKILL_LEVELS) {
    const res = await SkillLevel.updateOne(
      { vertical: V, level: l.level },
      {
        $setOnInsert: {
          name: l.name, description: l.description,
          requiresVerification: l.requiresVerification, isActive: true,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.SKILL_LEVELS.length, created };
}

async function seedQAChecklists(V, seed) {
  let created = 0;
  for (const c of seed.QA_CHECKLISTS) {
    const res = await QAChecklist.updateOne(
      { code: c.code },
      {
        $set: { vertical: V },
        $setOnInsert: {
          name: c.name, stage: c.stage,
          repairCodes: c.repairCodes, items: c.items, isActive: true,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.QA_CHECKLISTS.length, created };
}

async function seedDiagnosticFlows(V, FLOWS) {
  let created = 0;
  let linked = 0;

  for (const f of FLOWS) {
    const res = await DiagnosticFlow.updateOne(
      { code: f.code },
      {
        $set: { category: f.category },
        $setOnInsert: {
          title: f.title, description: f.description || '',
          questions: f.questions, isActive: true,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;

    // The problem → flow link is authoritative: a problem pointing at a flow
    // that does not exist is a broken booking path, not a cosmetic difference.
    if (f.problemCodes.length) {
      const r = await Problem.updateMany(
        { code: { $in: f.problemCodes }, vertical: V },
        { $set: { diagnosticFlowCode: f.code } },
      );
      linked += r.modifiedCount || 0;
    }
  }
  return { total: FLOWS.length, created, linked };
}

/**
 * The model catalog, where a vertical ships one.
 *
 * `productTypeCode` is set on every re-run because it decides which symptoms a
 * customer is offered — a scooter mis-tagged as a motorcycle would be asked
 * about its chain. Names and ordering stay on `$setOnInsert` so an admin's
 * edits survive.
 */
async function seedModels(V, models) {
  if (!models) return { total: 0, created: 0 };

  const brands = await Brand.find({ category: V }).lean();
  const brandIdByCode = new Map(brands.map((b) => [b.code, b._id]));

  let created = 0;
  let orphaned = 0;
  for (const m of models.MODELS) {
    const brandId = brandIdByCode.get(m.brandCode);
    if (!brandId) { orphaned++; continue; }

    const code = models.toCode(m.brandCode, m.name);
    const res = await DeviceModel.updateOne(
      { code },
      {
        $set: {
          vertical: V,
          brandId,
          brandCode: m.brandCode,
          productTypeCode: m.productTypeCode,
          // Structural, like the body type: it decides which questions the
          // owner is asked, so it must stay correct on every re-run.
          fuelTypes: m.fuelTypes || [],
        },
        $setOnInsert: { name: m.name, isActive: true },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: models.MODELS.length, created, orphaned };
}

/** Config defaults only — never overwrite thresholds an admin has tuned. */
async function seedConfig(V) {
  const existing = await RepairConfig.findOne({ vertical: V, supersededAt: null });
  if (existing) return { total: 1, created: 0 };
  await RepairConfig.create({ vertical: V });
  return { total: 1, created: 1 };
}

async function report(V) {
  const [brands, deviceModels, types, cats, problems, wired, repairs, levels, checklists, flows, cfg] = await Promise.all([
    Brand.countDocuments({ category: V }),
    DeviceModel.countDocuments({ vertical: V }),
    ProductType.countDocuments({ vertical: V }),
    ProblemCategory.countDocuments({ vertical: V }),
    Problem.countDocuments({ vertical: V }),
    Problem.countDocuments({ vertical: V, diagnosticFlowCode: { $ne: null } }),
    Repair.countDocuments({ vertical: V }),
    SkillLevel.countDocuments({ vertical: V }),
    QAChecklist.countDocuments({ vertical: V }),
    DiagnosticFlow.countDocuments({ category: V }),
    RepairConfig.countDocuments({ vertical: V, supersededAt: null }),
  ]);
  return {
    brands, deviceModels, productTypes: types, problemCategories: cats,
    problems, problemsWithFlow: wired, repairs,
    skillLevels: levels, qaChecklists: checklists,
    diagnosticFlows: flows, config: cfg,
  };
}

/* Runner */

async function run(vertical, { reportOnly = false, allowProduction = false } = {}) {
  if (!VERTICALS.includes(vertical)) {
    throw new Error(`"${vertical}" is not a registered vertical. Add it to repair/vertical.js first.`);
  }

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');

  const dbName = (uri.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'unknown';
  const tag = `[${vertical}-seed]`;

  // Seeding the live database is a deliberate act, never an accident of a
  // missing environment variable.
  if (process.env.NODE_ENV === 'production' && !allowProduction) {
    console.error(`${tag} refusing to seed PRODUCTION database "${dbName}" without --yes-production`);
    process.exit(1);
  }

  const { data: seed, FLOWS, models } = loadSeed(vertical);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`${tag} connected to database: ${dbName}`);

  if (reportOnly) {
    console.table(await report(vertical));
    await mongoose.disconnect();
    return;
  }

  const results = {
    brands: await seedBrands(vertical, seed),
    productTypes: await seedProductTypes(vertical, seed),
    models: await seedModels(vertical, models),
    problemCategories: await seedProblemCategories(vertical, seed),
    problems: await seedProblems(vertical, seed),
    repairs: await seedRepairs(vertical, seed),
    skillLevels: await seedSkillLevels(vertical, seed),
    qaChecklists: await seedQAChecklists(vertical, seed),
    diagnosticFlows: await seedDiagnosticFlows(vertical, FLOWS),
    config: await seedConfig(vertical),
  };

  for (const [name, r] of Object.entries(results)) {
    console.log(`${tag} ${name.padEnd(18)} created ${String(r.created).padStart(3)} / ${r.total}`);
    if (r.orphaned) console.warn(`${tag}   ! ${r.orphaned} skipped — unknown category`);
    if (r.linked != null) console.log(`${tag}   ${r.linked} problems linked to a diagnostic flow`);
  }

  console.log(`\n${tag} final state:`);
  console.table(await report(vertical));

  await mongoose.disconnect();
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const vertical = args.find((a) => !a.startsWith('--'));
  if (!vertical) {
    console.error(`usage: node run-vertical-seed.js <${Object.keys(SEEDS).join('|')}> [--report] [--yes-production]`);
    process.exit(1);
  }
  run(vertical, {
    reportOnly: args.includes('--report'),
    allowProduction: args.includes('--yes-production'),
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`[${vertical}-seed] failed:`, err.message);
      process.exit(1);
    });
}

module.exports = { run, report, SEEDS };
