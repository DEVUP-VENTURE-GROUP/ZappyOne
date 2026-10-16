// A partner's own commission rate (Economics → Partner commission), applied to the frozen base of a job they hold.
const Shop = require('./shop.model');
const { KINDS } = require('../jobs/kinds');

async function pctFor(doc) {
  if (!doc?.shopId && !doc?.workerId) return null;
  if (!doc.shopId && await require('../workforce/staff').isStaff(doc.workerId)) return null;
  const rates = await require('../pricing/services/config.service').partnerCommissionSettings();
  const type = doc.shopId ? ((await Shop.findById(doc.shopId).select('partnerType').lean())?.partnerType || 'shop') : 'individual';
  const pct = Number(rates[type]);
  return Number.isFinite(pct) && pct >= 0 ? pct : null;
}

async function commissionOn(doc, basePaise, fallbackPct) {
  const pct = await pctFor(doc);
  return Math.round(((basePaise || 0) * (pct ?? fallbackPct ?? 0)) / 100);
}

// Re-applies the holder's rate to a job's frozen base: updates the stored commission (and provider amount), mutates `doc` to match, returns the change in paise.
async function refreeze(kind, doc) {
  const spec = KINDS[kind]?.commission;
  const money = spec && doc?.[spec.path];
  if (!money || money.commissionBasePaise == null) return 0;
  const holder = doc.shopId ? `shop:${doc.shopId}` : doc.workerId ? `worker:${doc.workerId}` : null;
  const frozen = money.partnerRate?.holder === holder ? money.partnerRate.pct : null;
  const pct = frozen ?? await pctFor(doc);
  if (pct == null) return 0;
  const next = Math.round((money.commissionBasePaise * pct) / 100);
  const delta = next - (money.commissionPaise || 0);
  const set = frozen == null ? { [`${spec.path}.partnerRate`]: { holder, pct } } : {};
  if (frozen == null) money.partnerRate = { holder, pct };
  if (!delta) {
    if (Object.keys(set).length) await KINDS[kind].model().updateOne({ _id: doc._id }, { $set: set });
    return 0;
  }
  set[`${spec.path}.commissionPaise`] = next;
  if (spec.provider) set[`${spec.path}.${spec.provider}`] = Math.max(0, (money[spec.provider] || 0) - delta);
  await KINDS[kind].model().updateOne({ _id: doc._id }, { $set: set });
  money.commissionPaise = next;
  if (spec.provider) money[spec.provider] = set[`${spec.path}.${spec.provider}`];
  return delta;
}

module.exports = { pctFor, commissionOn, refreeze };
