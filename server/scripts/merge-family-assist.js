// One-time: Shopping & Pickup and Returns & Exchange move into Family Assist; the separate Helping Services section is switched off. Their own verification rules come along (copied from the live Helping Services set, so admin edits are kept). Safe to run twice.
// Run:  NODE_ENV=production node scripts/merge-family-assist.js --yes-production
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const overlay = path.resolve(__dirname, `../.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });

const { ServiceDomain, ServiceLine, ProviderEnrolment, KycRequirementSet } = require('../src/modules/onboarding/onboarding.model');

const MOVE = [{ code: 'shopping_pickup', order: 9 }, { code: 'returns_exchange', order: 10 }];

async function merge() {
  const old = await KycRequirementSet.find({ domainCode: 'helping_services' }).lean();
  let rules = 0;
  for (const m of MOVE) {
    await ServiceLine.updateOne({ code: m.code }, { $set: { domainCode: 'family_assist', displayOrder: m.order } });
    await ProviderEnrolment.updateMany({ lineCode: m.code }, { $set: { domainCode: 'family_assist' } });
    for (const s of old.filter((x) => !x.lineCode || x.lineCode === m.code)) {
      const { _id, createdAt, updatedAt, __v, ...rest } = s;
      const r = await KycRequirementSet.updateOne(
        { domainCode: 'family_assist', lineCode: m.code, providerKind: s.providerKind },
        { $setOnInsert: { ...rest, domainCode: 'family_assist', lineCode: m.code } },
        { upsert: true },
      );
      rules += r.upsertedCount || 0;
    }
  }
  await ServiceDomain.updateOne({ code: 'helping_services' }, { $set: { isActive: false } });
  await ServiceDomain.updateOne({ code: 'family_assist' }, { $set: { isActive: true, isArchived: false } });
  return { moved: MOVE.length, rules };
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error('Refusing to change production without --yes-production');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const r = await merge();
  console.log(`Family Assist now holds the errands: ${r.moved} services moved, ${r.rules} verification rules copied, Helping Services section off.`);
  await mongoose.disconnect();
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { merge };
