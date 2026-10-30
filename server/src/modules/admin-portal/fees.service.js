/**
 * Economics: every service line's fee, commission and tax on one screen.
 *
 * ZappyOne earns two ways, from two different people:
 *   platformFeePaise  added to the CUSTOMER's bill, per booking
 *   commissionPct     taken from the PROVIDER, out of their service money
 *
 * Nothing new is stored here. Each line keeps its numbers where its pricing
 * engine already reads them, and an edit goes through the same rules as the
 * line's own admin screen: repair configs are versioned, every engine's cache
 * is cleared, and each change is audited. Bookings freeze the rates they were
 * made at, so a change only affects new bookings.
 */
const { RepairConfig } = require('../repair/models/config.model');
const { PetPricingRule } = require('../pet/models/config.model');
const { HelpingConfig, SERVICE_TYPES } = require('../helping/models/config.model');
const EventConfig = require('../events/event-config.model');
const { VERTICAL_LABEL, HELPING_LABEL, PET_LABEL } = require('./bookings.source');

const LINES = ['repair', 'pet', 'helping', 'event'];
const DEFAULTS = { platformFeePaise: 1000, commissionPct: 10 }; // ₹10 and 10%: the launch rule
const MAX = { platformFeePaise: 100000, commissionPct: { repair: 100, pet: 100, helping: 100, event: 50 } };

const row = (line, key, label, doc, commissionField = 'commissionPct') => ({
  line, key, label,
  // A saved config shows what pricing really uses: a missing fee charges ₹0.
  platformFeePaise: doc ? (doc.platformFeePaise ?? 0) : DEFAULTS.platformFeePaise,
  commissionPct: doc ? (doc[commissionField] ?? 0) : DEFAULTS.commissionPct,
  // Events carry no tax line yet; every other engine adds taxPct on the bill.
  taxPct: line === 'event' ? null : (doc?.taxPct ?? 0),
  maxCommissionPct: MAX.commissionPct[line],
  configured: Boolean(doc),
  updatedAt: doc?.updatedAt || null,
});

async function list() {
  const [repair, pet, helping, event] = await Promise.all([
    RepairConfig.find({ supersededAt: null }).lean(),
    // A category's fee and commission sit on its rules; the base rule speaks for it.
    PetPricingRule.find({ isActive: true }).sort({ variantCode: 1, species: 1, cityCode: 1 }).lean(),
    HelpingConfig.find({}).lean(),
    EventConfig.findOne({ isActive: true }).lean(),
  ]);

  const repairBy = new Map(repair.map((c) => [c.vertical, c]));
  const repairKeys = [...new Set([...Object.keys(VERTICAL_LABEL), ...repairBy.keys()])];

  const petBy = new Map();
  for (const r of pet) if (!petBy.has(r.categoryCode)) petBy.set(r.categoryCode, r);
  const helpingBy = new Map(helping.map((c) => [c.serviceType, c]));

  return [
    ...repairKeys.map((k) => row('repair', k, VERTICAL_LABEL[k] || k, repairBy.get(k))),
    ...[...petBy.keys()].sort().map((k) => row('pet', k, PET_LABEL[k] || k, petBy.get(k))),
    ...SERVICE_TYPES.filter((k) => helpingBy.has(k)).map((k) => row('helping', k, HELPING_LABEL[k] || k, helpingBy.get(k))),
    // Events read their config merged over defaults, so a missing field means the default.
    row('event', 'event', 'Event décor', event && { platformFeePaise: DEFAULTS.platformFeePaise, ...event }, 'platformCommissionPct'),
  ];
}

function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

/** Change one line's fee and/or commission. Returns { before, after } for the audit. */
async function update({ line, key, platformFeePaise, commissionPct, taxPct, adminId }) {
  if (!LINES.includes(line)) throw httpError('Unknown service line', 400, 'UNKNOWN_LINE');
  const patch = {};
  if (platformFeePaise !== undefined) patch.platformFeePaise = platformFeePaise;
  if (commissionPct !== undefined) {
    if (commissionPct > MAX.commissionPct[line]) {
      throw httpError(`Commission for this service can be at most ${MAX.commissionPct[line]}%`, 400, 'COMMISSION_TOO_HIGH');
    }
    patch.commissionPct = commissionPct;
  }
  if (taxPct !== undefined) {
    if (line === 'event') throw httpError('Event bookings do not carry a tax line yet', 400, 'NO_TAX_ON_LINE');
    patch.taxPct = taxPct;
  }

  if (line === 'repair') {
    const current = await RepairConfig.findOne({ vertical: key, supersededAt: null });
    const before = current ? current.toObject() : null;
    if (current) {
      current.supersededAt = new Date();
      current.isActive = false;
      await current.save();
    }
    const next = await RepairConfig.create({
      ...(before || {}), ...patch, _id: undefined, vertical: key,
      version: (before?.version || 0) + 1, supersededAt: null, isActive: true, updatedById: adminId,
    });
    require('../repair/services/pricing.service').invalidateConfigCache(key);
    return { before: pick(before), after: pick(next.toObject()) };
  }

  if (line === 'pet') {
    const before = await PetPricingRule.findOne({ categoryCode: key, isActive: true }).lean();
    if (!before) throw httpError('This pet service has no pricing yet. Set it up under Catalog → Pet first.', 404, 'NOT_FOUND');
    await PetPricingRule.updateMany({ categoryCode: key, isActive: true }, { $set: patch }, { runValidators: true });
    require('../pet/services/pricing.service').invalidateRuleCache();
    return { before: pick(before), after: { ...pick(before), ...patch } };
  }

  if (line === 'helping') {
    const before = await HelpingConfig.findOne({ serviceType: key }).lean();
    if (!before) throw httpError('This helping service has no pricing yet. Set it up under Catalog → Helping first.', 404, 'NOT_FOUND');
    const after = await HelpingConfig.findOneAndUpdate({ serviceType: key }, { $set: patch }, { new: true, runValidators: true }).lean();
    require('../helping/services/pricing.service').invalidateConfigCache(key);
    return { before: pick(before), after: pick(after) };
  }

  // Events keep a single config; its commission field has its own name.
  const before = await EventConfig.findOne({ isActive: true }).lean();
  const eventPatch = {};
  if (patch.platformFeePaise !== undefined) eventPatch.platformFeePaise = patch.platformFeePaise;
  if (patch.commissionPct !== undefined) eventPatch.platformCommissionPct = patch.commissionPct;
  const after = await require('../events/event.service').adminUpdateConfig(eventPatch, adminId);
  return { before: pick(before, 'platformCommissionPct'), after: pick(after, 'platformCommissionPct') };
}

function pick(doc, commissionField = 'commissionPct') {
  if (!doc) return null;
  return { platformFeePaise: doc.platformFeePaise ?? null, commissionPct: doc[commissionField] ?? null, taxPct: doc.taxPct ?? null };
}

/**
 * Fill in the launch rule where a line has no fee or commission yet: ₹10 fee
 * and 10% commission. Values an operator has set are left alone, except the
 * placeholder numbers earlier seeds wrote (₹5 fee, 15% commission), which
 * were never a decision. Returns what changed.
 */
async function applyLaunchDefaults({ dryRun = false } = {}) {
  const SEEDED_FEE = 500;
  const SEEDED_COMMISSION = 15;
  const changes = [];
  for (const r of await list()) {
    const patch = {};
    if (!r.configured) continue; // defaults already apply until a line is set up
    if (!r.platformFeePaise || r.platformFeePaise === SEEDED_FEE) patch.platformFeePaise = DEFAULTS.platformFeePaise;
    if (!r.commissionPct || r.commissionPct === SEEDED_COMMISSION) patch.commissionPct = DEFAULTS.commissionPct;
    if (!Object.keys(patch).length) continue;
    // Tax is never defaulted: a wrong rate is collected from customers and owed to the state.
    changes.push({ line: r.line, key: r.key, from: { fee: r.platformFeePaise, commission: r.commissionPct }, to: patch });
    if (!dryRun) await update({ line: r.line, key: r.key, ...patch, adminId: null });
  }
  return changes;
}

module.exports = { list, update, applyLaunchDefaults, DEFAULTS, LINES };
