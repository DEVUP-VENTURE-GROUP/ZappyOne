/**
 * Idempotent seeder for provider onboarding.
 *
 * Same discipline as the repair seeders: `$setOnInsert` for anything an admin
 * might reasonably have edited — a line's name, its status, the document list —
 * so a re-run never overwrites an operator's decision. Re-running on a live
 * database is safe and is how a newly added domain reaches an existing
 * deployment.
 *
 * Usage:
 *   NODE_ENV=development node src/modules/onboarding/run-onboarding-seed.js
 *   NODE_ENV=development node src/modules/onboarding/run-onboarding-seed.js --report
 *   NODE_ENV=production  node src/modules/onboarding/run-onboarding-seed.js --yes-production
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Env loaded exactly as src/config/index.js does — base .env then the
// .env.<NODE_ENV> overlay. Plain dotenv would read only the base file, whose
// MONGO_URI points at the live database, and seed production without saying so.
const projectRoot = path.resolve(__dirname, '../../../');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const overlayPath = path.join(projectRoot, `.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlayPath)) {
  require('dotenv').config({ path: overlayPath, override: true });
}

const { ServiceDomain, ServiceLine, KycRequirementSet } = require('./onboarding.model');
const seed = require('./onboarding.seed');

async function seedDomains() {
  let created = 0;
  for (const d of seed.DOMAINS) {
    const res = await ServiceDomain.updateOne(
      { code: d.code },
      {
        $setOnInsert: {
          name: d.name,
          description: d.description || '',
          icon: d.icon || '',
          displayOrder: d.displayOrder || 0,
          isActive: true,
          isArchived: false,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.DOMAINS.length, created };
}

async function seedLines() {
  let created = 0;
  for (const l of seed.LINES) {
    const res = await ServiceLine.updateOne(
      { code: l.code },
      {
        // The domain link is structural — it must stay correct even on a re-run.
        $set: { domainCode: l.domainCode },
        $setOnInsert: {
          name: l.name,
          description: l.description || '',
          icon: l.icon || '',
          repairVertical: l.repairVertical || null,
          status: l.status || 'coming_soon',
          customerPath: l.customerPath || '',
          tagline: l.tagline || '',
          isPopular: !!l.isPopular,
          providerKinds: l.providerKinds || ['shop', 'individual'],
          displayOrder: l.displayOrder || 0,
          isActive: true,
          isArchived: false,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;

    /**
     * Backfill presentation fields that are still blank.
     *
     * `$setOnInsert` protects an operator's edits, but a row created before
     * these fields existed has no customer path at all — which silently hides
     * the service from customers. Filling ONLY what is empty keeps both
     * properties: nothing an operator chose is overwritten, and nothing stays
     * invisible because it predates a field.
     */
    if (l.customerPath) {
      await ServiceLine.updateOne(
        { code: l.code, $or: [{ customerPath: '' }, { customerPath: { $exists: false } }] },
        { $set: { customerPath: l.customerPath, tagline: l.tagline || '', isPopular: !!l.isPopular } },
      );
    }
  }
  return { total: seed.LINES.length, created };
}

async function seedRequirementSets() {
  let created = 0;
  for (const s of seed.REQUIREMENT_SETS) {
    const res = await KycRequirementSet.updateOne(
      { domainCode: s.domainCode, lineCode: s.lineCode ?? null, providerKind: s.providerKind },
      {
        $setOnInsert: {
          name: s.name,
          documents: s.documents || [],
          fields: s.fields || [],
          declarations: s.declarations || [],
          minSkillLevel: s.minSkillLevel ?? null,
          isActive: true,
          isArchived: false,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  return { total: seed.REQUIREMENT_SETS.length, created };
}


/**
 * Apply capture rules to requirement sets that predate the field.
 *
 * Targeted with arrayFilters so only the named document is touched, and only
 * when it has no rule yet — an operator who deliberately relaxed a rule keeps
 * their decision, while a set created before the field existed stops silently
 * accepting a gallery photo where a live one was meant.
 */
async function seedCaptureRules() {
  let updated = 0;

  for (const s of seed.REQUIREMENT_SETS) {
    const wanted = new Map(
      (s.documents || []).filter((d) => d.capture).map((d) => [d.code, d.capture]),
    );
    if (!wanted.size) continue;

    const set = await KycRequirementSet.findOne({
      domainCode: s.domainCode,
      lineCode: s.lineCode ?? null,
      providerKind: s.providerKind,
    });
    if (!set) continue;

    // Patched in JS rather than with positional array filters: the rule is
    // "fill it only if blank", which is far easier to read here than to express
    // in an update pipeline — and this runs a handful of times, not in a loop.
    let touched = false;
    for (const doc of set.documents) {
      const rule = wanted.get(doc.code);
      if (rule && !doc.capture) { doc.capture = rule; touched = true; updated += 1; }
    }
    if (touched) await set.save();
  }

  return { total: updated, created: updated };
}

async function report() {
  const [domains, lines, live, sets] = await Promise.all([
    ServiceDomain.countDocuments({ isArchived: false }),
    ServiceLine.countDocuments({ isArchived: false }),
    ServiceLine.countDocuments({ status: 'live', isArchived: false }),
    KycRequirementSet.countDocuments({ isArchived: false }),
  ]);
  return [{ domains, lines, liveLines: live, requirementSets: sets }];
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dbName = uri.split('/').pop().split('?')[0];
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && !process.argv.includes('--yes-production')) {
    console.error(`[onboarding-seed] refusing to seed PRODUCTION database "${dbName}" without --yes-production`);
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`[onboarding-seed] connected to database: ${dbName}`);

  if (process.argv.includes('--report')) {
    console.table(await report());
    await mongoose.disconnect();
    return;
  }

  const results = {
    domains: await seedDomains(),
    lines: await seedLines(),
    requirementSets: await seedRequirementSets(),
    captureRules: await seedCaptureRules(),
  };

  for (const [name, r] of Object.entries(results)) {
    console.log(`[onboarding-seed] ${name.padEnd(16)} created ${String(r.created).padStart(3)} / ${r.total}`);
  }

  console.log('\n[onboarding-seed] final state:');
  console.table(await report());

  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[onboarding-seed] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main, report, seedDomains, seedLines, seedRequirementSets, seedCaptureRules };
