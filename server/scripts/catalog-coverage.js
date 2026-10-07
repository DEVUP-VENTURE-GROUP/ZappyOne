/**
 * Catalog coverage: where can a customer NOT complete a booking, and why?
 * READ-ONLY. Never writes anything.
 *
 *   node scripts/catalog-coverage.js                 (dev database)
 *   NODE_ENV=production node scripts/catalog-coverage.js --production   (live, read-only)
 *
 * Per repair vertical: problems customers can pick that lead to no repair,
 * repairs without a ZappyOne standard price (so nobody can book them unless a
 * provider priced them), repairs no provider has priced, and problems without
 * a photo. Per pet and helping line: whether anything is bookable at all.
 */
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const config = require('../src/config');
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(config.mongo.uri);
  const db = mongoose.connection.name;
  if (db !== 'zappy_dev' && !process.argv.includes('--production')) {
    console.log(`This is "${db}". Add --production to read it (read-only).`);
    process.exit(2);
  }
  const { Problem } = require('../src/modules/repair/models/problem.model');
  const { Repair } = require('../src/modules/repair/models/repair.model');
  const { ZappyReferencePricing, ProviderPricing } = require('../src/modules/repair/models/pricing.model');
  const { ProviderCapability } = require('../src/modules/repair/models/capability.model');
  const { ServiceLine, ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');

  console.log(`Catalog coverage — database "${db}" — ${new Date().toISOString()}\n`);
  const lines = await ServiceLine.find({ status: 'live', isActive: true, isArchived: false }).lean();
  const approved = new Set(await ProviderEnrolment.distinct('lineCode', { status: 'approved' }));

  for (const line of lines.filter((l) => l.repairVertical)) {
    const v = line.repairVertical;
    const [problems, repairs, refCodes, pricedCodes, capCodes] = await Promise.all([
      Problem.find({ vertical: v, isActive: true, isArchived: { $ne: true } }).select('code name candidateRepairCodes imageUrl image media').lean(),
      Repair.find({ vertical: v, isActive: true, isArchived: { $ne: true } }).select('code name pricingMode').lean(),
      ZappyReferencePricing.distinct('repairCode', { vertical: v }),
      ProviderPricing.distinct('repairCode', { vertical: v, approvalStatus: 'approved' }),
      ProviderCapability.distinct('repairCode', { vertical: v, isActive: true }),
    ]);
    const active = new Set(repairs.map((r) => r.code));
    const ref = new Set(refCodes); const priced = new Set(pricedCodes); const caps = new Set(capCodes);
    const deadProblems = problems.filter((p) => !(p.candidateRepairCodes || []).some((c) => active.has(c)));
    const needsPrice = repairs.filter((r) => r.pricingMode !== 'diagnosis_required');
    const noStandard = needsPrice.filter((r) => !ref.has(r.code));
    const nobodyPriced = needsPrice.filter((r) => !priced.has(r.code));
    const unbookable = needsPrice.filter((r) => !ref.has(r.code) && !priced.has(r.code));
    const nobodyDoes = repairs.filter((r) => !caps.has(r.code));
    const noPhoto = problems.filter((p) => !(p.imageUrl || p.image || p.media?.length));

    console.log(`■ ${line.name} (${v}) — ${approved.has(line.code) ? 'has verified providers' : 'NO verified providers'}`);
    console.log(`  ${problems.length} problems, ${repairs.length} repairs`);
    const list = (arr, f = (x) => x.name || x.code) => (arr.length ? `${arr.length}: ${arr.slice(0, 8).map(f).join(', ')}${arr.length > 8 ? ', …' : ''}` : 'none');
    console.log(`  Problems leading to no repair (inspection only) ... ${list(deadProblems)}`);
    console.log(`  Repairs no customer can book (no standard price, nobody priced) ... ${list(unbookable)}`);
    console.log(`  Repairs without a ZappyOne standard price ... ${list(noStandard)}`);
    console.log(`  Repairs no provider has priced ... ${list(nobodyPriced)}`);
    console.log(`  Repairs no provider does ... ${list(nobodyDoes)}`);
    console.log(`  Problems without a photo ... ${list(noPhoto)}\n`);
  }

  for (const line of lines.filter((l) => !l.repairVertical)) {
    console.log(`■ ${line.name} (${line.code}) — ${approved.has(line.code) ? 'has verified providers' : 'NO verified providers'}`);
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
