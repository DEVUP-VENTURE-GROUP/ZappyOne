// Opens every version 1 service (onboarding/catalog-az.seed): safe to re-run, it only adds what is missing and never overwrites an admin edit.
// Usage: NODE_ENV=development node src/modules/onboarding/run-catalog-az.js [--yes-production]
const { ServiceDomain, ServiceLine, KycRequirementSet } = require('./onboarding.model');
const { upsertPackageLine } = require('../repair/package-lines.service');
const { AZ_DOMAINS, AZ_LINES, AZ_REQUIREMENT_SETS, RENAMED_FROM } = require('./catalog-az.seed');

async function seedCatalogAZ() {
  const out = { domains: 0, renamed: 0, requirementSets: 0, lines: 0 };
  for (const d of AZ_DOMAINS) {
    const r = await ServiceDomain.updateOne({ code: d.code }, { $setOnInsert: { name: d.name, description: d.description, icon: d.icon, displayOrder: d.displayOrder, isActive: true, isArchived: false } }, { upsert: true });
    if (r.upsertedCount) out.domains += 1;
    if (RENAMED_FROM[d.code]) out.renamed += (await ServiceDomain.updateOne({ code: d.code, name: RENAMED_FROM[d.code] }, { $set: { name: d.name, description: d.description, displayOrder: d.displayOrder } })).modifiedCount;
  }
  for (const s of AZ_REQUIREMENT_SETS) {
    const r = await KycRequirementSet.updateOne(
      { domainCode: s.domainCode, lineCode: s.lineCode ?? null, providerKind: s.providerKind, isArchived: false },
      { $setOnInsert: { name: s.name, documents: s.documents, fields: s.fields, declarations: s.declarations, minSkillLevel: null, isActive: true } },
      { upsert: true },
    );
    if (r.upsertedCount) out.requirementSets += 1;
  }
  const { Repair } = require('../repair/models/repair.model');
  const { prefixOf } = require('../repair/package-lines.service');
  for (const def of AZ_LINES) {
    const existed = await ServiceLine.exists({ code: def.code });
    const line = await upsertPackageLine(def);
    if (!existed) out.lines += 1;
    // What each job includes, only where nobody has written it yet.
    const prefix = def.prefix || prefixOf(line.repairVertical);
    for (const p of def.packages.filter((x) => x.includes?.length)) {
      await Repair.updateOne({ vertical: line.repairVertical, code: `${prefix}_${p.code}`, $or: [{ includes: { $exists: false } }, { includes: { $size: 0 } }] }, { $set: { includes: p.includes } });
    }
  }
  // Care agencies take family assistance too, not only individuals.
  await ServiceLine.updateMany({ domainCode: 'family_assist' }, { $addToSet: { providerKinds: 'shop' } });
  return out;
}

if (require.main === module) {
  const path = require('path');
  const fs = require('fs');
  const mongoose = require('mongoose');
  const root = path.resolve(__dirname, '../../../');
  require('dotenv').config({ path: path.join(root, '.env') });
  const overlay = path.join(root, `.env.${process.env.NODE_ENV || 'development'}`);
  if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) { console.error('Refusing to seed production without --yes-production'); process.exit(1); }
  mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 })
    .then(seedCatalogAZ)
    .then((r) => { console.table(r); return mongoose.disconnect(); })
    .then(() => process.exit(0))
    .catch((e) => { console.error('[catalog-az] failed:', e.message); process.exit(1); });
}

module.exports = { seedCatalogAZ };
