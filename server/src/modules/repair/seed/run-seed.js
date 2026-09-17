/**
 * Idempotent seeder for the mobile repair catalog.
 *
 * Uses `$setOnInsert` for everything an admin might reasonably edit (names,
 * ordering, warranty defaults) so re-running never overwrites a human decision,
 * and `$set` only for the structural links that must stay correct (category
 * ids, vertical). Running this twice on a live database is safe and is expected
 * — it is how a new repair or problem gets added to an existing deployment.
 *
 * Usage:
 *   node src/modules/repair/seed/run-seed.js            # seed configured DB
 *   node src/modules/repair/seed/run-seed.js --report   # show what exists, write nothing
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

/**
 * Load env EXACTLY the way src/config/index.js does — base `.env`, then the
 * `.env.<NODE_ENV>` overlay with override. Using plain `dotenv.config()` here
 * would read only the base file, whose MONGO_URI points at the live `zappy`
 * database — so a developer running this locally would seed production without
 * being told. Environment must select the data store here too.
 */
const projectRoot = path.resolve(__dirname, '../../../../');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const overlayPath = path.join(projectRoot, `.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlayPath)) {
  require('dotenv').config({ path: overlayPath, override: true });
}

const { ProblemCategory, Problem } = require('../models/problem.model');
const { Repair } = require('../models/repair.model');
const { PartQuality } = require('../models/part.model');
const { SkillLevel } = require('../models/capability.model');
const { QAChecklist, RepairConfig } = require('../models/config.model');
const Brand = require('../../service/brand.model');
const DiagnosticFlow = require('../../service/diagnostic-flow.model');

const seed = require('./catalog.seed');
const { FLOWS } = require('./diagnostics.seed');

async function seedBrands() {
  let created = 0;
  for (const b of seed.BRANDS) {
    const res = await Brand.updateOne(
      { code: b.code },
      {
        $set: { category: seed.VERTICAL },
        $setOnInsert: { name: b.name, sortOrder: b.displayOrder, isActive: true, logoUrl: '' },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.BRANDS.length, created };
}

async function seedProblemCategories() {
  let created = 0;
  for (const c of seed.PROBLEM_CATEGORIES) {
    const res = await ProblemCategory.updateOne(
      { code: c.code },
      {
        $set: { vertical: seed.VERTICAL },
        $setOnInsert: { name: c.name, displayOrder: c.displayOrder, icon: c.icon || '', isActive: true },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.PROBLEM_CATEGORIES.length, created };
}

async function seedProblems() {
  const cats = await ProblemCategory.find({ vertical: seed.VERTICAL }).select('_id code').lean();
  const catByCode = new Map(cats.map((c) => [c.code, c._id]));

  let created = 0;
  const missingCategory = [];
  for (const p of seed.PROBLEMS) {
    const categoryId = catByCode.get(p.categoryCode);
    if (!categoryId) {
      missingCategory.push(p.code);
      continue;
    }
    const res = await Problem.updateOne(
      { code: p.code },
      {
        // Structural links stay authoritative; presentation fields do not.
        $set: { categoryId, categoryCode: p.categoryCode, vertical: seed.VERTICAL },
        $setOnInsert: {
          name: p.name,
          description: p.description || '',
          candidateRepairCodes: p.candidateRepairCodes || [],
          requiresDiagnosis: !!p.requiresDiagnosis,
          severity: p.severity || 'normal',
          isPopular: !!p.isPopular,
          displayOrder: 0,
          isActive: true,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.PROBLEMS.length, created, missingCategory };
}

async function seedRepairs() {
  let created = 0;
  for (const r of seed.REPAIRS) {
    // Reverse-index the problems that name this repair as a candidate, so the
    // mapping stays consistent with the problem list rather than duplicated.
    const problemCodes = seed.PROBLEMS
      .filter((p) => (p.candidateRepairCodes || []).includes(r.code))
      .map((p) => p.code);

    const partRequirements = r.componentCode
      ? [{ componentCode: r.componentCode, required: true, quantity: 1 }]
      : [];

    const res = await Repair.updateOne(
      { code: r.code },
      {
        $set: { vertical: seed.VERTICAL, problemCodes },
        $setOnInsert: {
          name: r.name,
          description: '',
          partRequirements,
          minSkillLevel: r.minSkillLevel,
          allowedServiceModes: r.modes,
          estimatedDurationMin: r.durationMin,
          requiresDiagnosis: r.pricingMode === 'diagnosis_required',
          pricingMode: r.pricingMode,
          warrantyDays: r.warrantyDays,
          qaChecklistCodes: ['mobile_standard'],
          isActive: true,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.REPAIRS.length, created };
}

async function seedPartQualities() {
  let created = 0;
  for (const q of seed.PART_QUALITIES) {
    const res = await PartQuality.updateOne(
      { code: q.code },
      {
        $setOnInsert: {
          name: q.name,
          description: q.description,
          isGenuine: q.isGenuine,
          rank: q.rank,
          defaultWarrantyDays: q.defaultWarrantyDays,
          displayOrder: q.rank,
          isActive: true,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.PART_QUALITIES.length, created };
}

async function seedSkillLevels() {
  let created = 0;
  for (const s of seed.SKILL_LEVELS) {
    const res = await SkillLevel.updateOne(
      { level: s.level },
      {
        $set: { vertical: seed.VERTICAL },
        $setOnInsert: {
          name: s.name,
          description: s.description,
          requiresVerification: s.requiresVerification,
          isActive: true,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.SKILL_LEVELS.length, created };
}

async function seedQAChecklists() {
  let created = 0;
  for (const c of seed.QA_CHECKLISTS) {
    const res = await QAChecklist.updateOne(
      { code: c.code },
      {
        $set: { vertical: seed.VERTICAL },
        $setOnInsert: {
          name: c.name,
          stage: c.stage,
          repairCodes: c.repairCodes,
          items: c.items,
          isActive: true,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.QA_CHECKLISTS.length, created };
}

/**
 * Diagnostic flows, plus the Problem → flow wiring.
 *
 * The link is written with `$set` (unlike most seed fields) because a problem
 * pointing at a flow that no longer exists is a broken booking path, not a
 * cosmetic difference — the mapping must stay authoritative.
 */
async function seedDiagnosticFlows() {
  let created = 0;
  let linked = 0;

  for (const f of FLOWS) {
    const res = await DiagnosticFlow.updateOne(
      { code: f.code },
      {
        $set: { category: f.category },
        $setOnInsert: {
          title: f.title,
          description: f.description || '',
          questions: f.questions,
          isActive: true,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;

    const r = await Problem.updateMany(
      { code: { $in: f.problemCodes }, vertical: seed.VERTICAL },
      { $set: { diagnosticFlowCode: f.code } },
    );
    linked += r.modifiedCount || 0;
  }

  return { total: FLOWS.length, created, linked };
}

/** Config defaults only — never overwrite thresholds an admin has tuned. */
async function seedConfig() {
  const existing = await RepairConfig.findOne({ vertical: seed.VERTICAL, supersededAt: null }).lean();
  if (existing) return { created: 0, existed: true };
  await RepairConfig.create({ vertical: seed.VERTICAL });
  return { created: 1, existed: false };
}

async function report() {
  const [cats, problems, repairs, qualities, levels, checklists, brands, cfg, flows, wired] = await Promise.all([
    ProblemCategory.countDocuments({ vertical: seed.VERTICAL }),
    Problem.countDocuments({ vertical: seed.VERTICAL }),
    Repair.countDocuments({ vertical: seed.VERTICAL }),
    PartQuality.countDocuments({}),
    SkillLevel.countDocuments({ vertical: seed.VERTICAL }),
    QAChecklist.countDocuments({ vertical: seed.VERTICAL }),
    Brand.countDocuments({ category: seed.VERTICAL }),
    RepairConfig.countDocuments({ vertical: seed.VERTICAL, supersededAt: null }),
    DiagnosticFlow.countDocuments({ category: seed.VERTICAL }),
    Problem.countDocuments({ vertical: seed.VERTICAL, diagnosticFlowCode: { $ne: null } }),
  ]);
  return {
    brands,
    problemCategories: cats,
    problems,
    problemsWithFlow: wired,
    repairs,
    partQualities: qualities,
    skillLevels: levels,
    qaChecklists: checklists,
    diagnosticFlows: flows,
    config: cfg,
  };
}

async function run({ reportOnly = false } = {}) {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');

  const dbName = (uri.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'unknown';

  /**
   * Writing catalog data to the live database is legitimate (§65) but must be
   * deliberate. A seed script in this repo has previously written test records
   * into production; requiring an explicit flag makes that impossible to do by
   * accident from a dev shell.
   */
  const isProdDb = !/_dev$|_test$|localhost|127\.0\.0\.1/.test(dbName) && !/_dev$/.test(uri);
  if (isProdDb && !process.argv.includes('--yes-production')) {
    throw new Error(
      `Refusing to seed "${dbName}" — this looks like a production database.\n` +
      `        Re-run with --yes-production if that is genuinely what you want.`,
    );
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[seed] connected to database: ${dbName}${isProdDb ? '  (PRODUCTION — explicitly confirmed)' : ''}`);

  if (reportOnly) {
    console.log('[seed] report only — nothing written');
    console.table(await report());
    await mongoose.disconnect();
    return;
  }

  const results = {
    brands: await seedBrands(),
    problemCategories: await seedProblemCategories(),
    problems: await seedProblems(),
    repairs: await seedRepairs(),
    partQualities: await seedPartQualities(),
    skillLevels: await seedSkillLevels(),
    qaChecklists: await seedQAChecklists(),
    diagnosticFlows: await seedDiagnosticFlows(),
    config: await seedConfig(),
  };

  for (const [name, r] of Object.entries(results)) {
    const created = r.created ?? 0;
    const total = r.total ?? 1;
    console.log(`[seed] ${name.padEnd(18)} created ${String(created).padStart(3)} / ${total}`);
    if (r.missingCategory?.length) {
      console.warn(`[seed]   ! skipped (missing category): ${r.missingCategory.join(', ')}`);
    }
  }

  console.log('\n[seed] final state:');
  console.table(await report());
  await mongoose.disconnect();
}

if (require.main === module) {
  run({ reportOnly: process.argv.includes('--report') })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed] failed:', err.message);
      process.exit(1);
    });
}

module.exports = { run, report };
