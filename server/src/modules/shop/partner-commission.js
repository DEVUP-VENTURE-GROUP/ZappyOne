// A partner's own commission rate (Economics → Partner commission), applied to the frozen base of a job they hold.
const Shop = require('./shop.model');
const { KINDS } = require('../jobs/kinds');

const Worker = require('../worker/worker.model');

const activeOverride = (o, now = new Date()) => (o?.pct != null && (!o.until || new Date(o.until) > now) ? o.pct : null);

// The rate this partner pays now and where it comes from; null for own staff.
async function rateOf({ kind, id }) {
  if (kind === 'worker' && await require('../workforce/staff').isStaff(id)) return null;
  const Model = kind === 'shop' ? Shop : Worker;
  const p = await Model.findById(id).select('partnerType commissionOverride').lean();
  if (!p) return null;
  const rates = await require('../pricing/services/config.service').partnerCommissionSettings();
  const type = kind === 'shop' ? (p.partnerType || 'shop') : 'individual';
  const typePct = Number.isFinite(Number(rates[type])) ? Number(rates[type]) : null;
  const custom = activeOverride(p.commissionOverride);
  return { type, typePct, override: p.commissionOverride?.pct != null ? p.commissionOverride : null, pct: custom ?? typePct, custom: custom != null };
}

async function pctFor(doc) {
  if (!doc?.shopId && !doc?.workerId) return null;
  return (await rateOf(doc.shopId ? { kind: 'shop', id: doc.shopId } : { kind: 'worker', id: doc.workerId }))?.pct ?? null;
}

// Sets or clears (pct null) one partner's own rate.
async function setOverride({ kind, id, pct, until = null, note = '', adminId }) {
  const Model = kind === 'shop' ? Shop : Worker;
  if (kind === 'worker' && await require('../workforce/staff').isStaff(id)) throw Object.assign(new Error('ZappyOne staff pay no commission'), { status: 400, code: 'STAFF' });
  if (until && new Date(until) <= new Date()) throw Object.assign(new Error('The end date must be in the future'), { status: 400, code: 'BAD_UNTIL' });
  const before = await rateOf({ kind, id });
  if (!before) throw Object.assign(new Error('Partner not found'), { status: 404, code: 'NOT_FOUND' });
  const value = pct == null ? { pct: null, until: null, note: '', setBy: adminId, setAt: new Date() } : { pct, until: until ? new Date(until) : null, note, setBy: adminId, setAt: new Date() };
  await Model.updateOne({ _id: id }, { $set: { commissionOverride: value } });
  return { before, after: await rateOf({ kind, id }) };
}

// Every partner with a custom rate, for the Economics list.
async function overrides() {
  const q = { 'commissionOverride.pct': { $ne: null } };
  const [shops, workers] = await Promise.all([
    Shop.find(q).select('businessName partnerType commissionOverride').limit(500).lean(),
    Worker.find(q).select('name phone commissionOverride').limit(500).lean(),
  ]);
  const row = (kind, p, name) => ({ kind, id: String(p._id), name, ...p.commissionOverride, active: activeOverride(p.commissionOverride) != null });
  return [...shops.map((s) => row('shop', s, s.businessName)), ...workers.map((w) => row('worker', w, w.name || w.phone))]
    .sort((a, b) => new Date(b.setAt || 0) - new Date(a.setAt || 0));
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

module.exports = { pctFor, rateOf, setOverride, overrides, commissionOn, refreeze };
