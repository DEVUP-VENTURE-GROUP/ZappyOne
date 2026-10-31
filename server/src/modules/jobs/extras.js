// "Add a service" on a live booking: the provider's own catalogue price, added to the bill and collected in cash at the end.
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const MAX_EXTRAS = 10;

const ADAPTERS = {
  repair: {
    open: ['CONFIRMED', 'PROVIDER_ASSIGNED', 'WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'APPROVED', 'PICKUP_SCHEDULED', 'DEVICE_PICKED_UP', 'AT_WORKSHOP', 'REPAIR_IN_PROGRESS'],
    money: 'priceSnapshot',
    fields: 'userId status vertical repairCode qualityCode brandCode modelCode serviceMode location shopId workerId reference paymentMethod paymentStatus priceSnapshot addOns extras',
    blocked(doc) {
      const s = doc.priceSnapshot || {};
      if (!doc.repairCode || s.resolutionPath === 'inspection_only') return 'Services can be added once the repair is decided.';
      if (s.isEstimate) return 'Your pro will confirm the price after checking. Ask them to add it to the quote.';
      return null;
    },
    async items(doc) {
      const { Repair } = require('../repair/models/repair.model');
      const pricing = require('../repair/services/pricing.service');
      const have = new Set((doc.addOns || []).map((a) => a.repairCode));
      const rows = await Repair.find({ vertical: doc.vertical, isActive: true, isArchived: { $ne: true }, isAddOn: true })
        .sort({ displayOrder: 1, name: 1 }).limit(40).lean();
      const ctx = { brandCode: doc.brandCode, modelCode: doc.modelCode, qualityCode: doc.qualityCode || null, serviceMode: doc.serviceMode, cityCode: doc.location?.cityCode || null };
      const out = [];
      for (const r of rows) {
        if (have.has(r.code)) continue;
        if ((r.eligibleForRepairCodes || []).length && !r.eligibleForRepairCodes.includes(doc.repairCode)) continue;
        const built = await pricing.buildAddOnSnapshots({
          vertical: doc.vertical, addOnCodes: [r.code], primaryRepairCode: doc.repairCode, ctx, shopId: doc.shopId, workerId: doc.workerId,
        }).catch(() => null);
        const line = built?.addOns?.[0];
        if (line) out.push({ code: r.code, name: line.name, pricePaise: line.totalPaise, line });
      }
      return out;
    },
    async apply(doc, item) {
      const cfg = await require('../repair/services/pricing.service').getConfig(doc.vertical);
      const taxPaise = Math.round((item.pricePaise * (cfg.taxPct || 0)) / 100);
      return {
        taxPaise,
        filter: { 'addOns.repairCode': { $ne: item.code } },
        update: {
          $push: { addOns: { ...item.line, addedAt: new Date() } },
          $inc: {
            'priceSnapshot.subtotalPaise': item.pricePaise,
            'priceSnapshot.taxPaise': taxPaise,
            'priceSnapshot.totalPaise': item.pricePaise + taxPaise,
            'priceSnapshot.commissionPaise': item.line.commissionPaise || 0,
            ...(item.line.fromProvider && doc.priceSnapshot?.commissionBasePaise != null && { 'priceSnapshot.commissionBasePaise': item.pricePaise }),
          },
        },
      };
    },
  },

  pet: {
    open: ['BOOKED', 'PROVIDER_SEARCHING', 'PROVIDER_ASSIGNED', 'PROVIDER_ACCEPTED', 'PROVIDER_EN_ROUTE', 'PROVIDER_ARRIVED', 'PET_HANDOVER', 'SERVICE_STARTED', 'SERVICE_PAUSED'],
    money: 'pricing',
    fields: 'userId status categoryCode pets shopId workerId reference paymentMethod paymentStatus pricing extras',
    blocked: () => null,
    async items(doc) {
      const { PetServiceAddon } = require('../pet/models/catalog.model');
      const pricing = require('../pet/services/pricing.service');
      const rows = await PetServiceAddon.find({ isActive: true, $or: [{ categoryCodes: { $size: 0 } }, { categoryCodes: doc.categoryCode }] })
        .sort({ displayOrder: 1, name: 1 }).limit(40).lean();
      const out = [];
      for (const [petIndex, p] of (doc.pets || []).entries()) {
        if (['refused', 'cancelled', 'completed'].includes(p.status)) continue;
        const rule = await pricing.resolveRule({ categoryCode: doc.categoryCode, variantCode: p.variantCode, species: p.snapshot?.species }).catch(() => null);
        if (!rule) continue;
        const mult = rule.sizeMultipliers?.[p.snapshot?.size || 'medium'] ?? 1;
        for (const a of rows) {
          if ((p.addonCodes || []).includes(a.code)) continue;
          if ((a.variantCodes || []).length && !a.variantCodes.includes(p.variantCode)) continue;
          if (p.snapshot?.species && (a.species || []).length && !a.species.includes(p.snapshot.species)) continue;
          if (!a.pricePaise) continue;
          const pricePaise = a.scalesWithSize ? Math.round(a.pricePaise * mult) : a.pricePaise;
          out.push({ code: a.code, name: a.name, pricePaise, petIndex, petName: p.snapshot?.name || null });
        }
      }
      return out;
    },
    async apply(doc, item) {
      const rule = await require('../pet/services/pricing.service').resolveRule({ categoryCode: doc.categoryCode });
      const taxPaise = Math.round((item.pricePaise * (rule.taxPct || 0)) / 100);
      const commission = Math.round((item.pricePaise * (rule.commissionPct || 0)) / 100);
      const at = `pets.${item.petIndex}`;
      return {
        taxPaise,
        filter: { [`${at}.addonCodes`]: { $ne: item.code } },
        update: {
          $push: { [`${at}.addonCodes`]: item.code },
          $inc: {
            [`${at}.addonsPaise`]: item.pricePaise,
            [`${at}.linePaise`]: item.pricePaise,
            'pricing.addonsPaise': item.pricePaise,
            'pricing.subtotalPaise': item.pricePaise,
            'pricing.taxPaise': taxPaise,
            'pricing.totalPaise': item.pricePaise + taxPaise,
            'pricing.commissionPaise': commission,
            ...(doc.pricing?.commissionBasePaise != null && { 'pricing.commissionBasePaise': item.pricePaise }),
            'pricing.providerAmountPaise': item.pricePaise - commission,
          },
        },
      };
    },
  },
};

const strip = ({ line, ...rest }) => rest;

// What the tracking screen shows: the services that can still be added, or why not.
async function view(kind, doc) {
  const a = ADAPTERS[kind];
  if (!a || !a.open.includes(doc.status)) return { allowed: false };
  if (doc.paymentMethod && doc.paymentMethod !== 'cash') return { allowed: false, reason: 'This booking was paid online. Ask your pro, they can add it to the bill.' };
  if ((doc.extras || []).length >= MAX_EXTRAS) return { allowed: false, reason: 'You have added the most we allow on one booking.' };
  const why = a.blocked(doc);
  if (why) return { allowed: false, reason: why };
  const items = await a.items(doc);
  return items.length ? { allowed: true, payBy: 'cash', items: items.map(strip) } : { allowed: false };
}

async function add({ id, userId, code, petIndex = null }) {
  const { findJob, KINDS } = require('./kinds');
  const found = await findJob(id, '_id');
  if (!found || !ADAPTERS[found.kind]) throw fail(404, 'NOT_FOUND', 'Booking not found');
  const { kind } = found;
  const a = ADAPTERS[kind];
  const Model = KINDS[kind].model();
  const doc = await Model.findById(id).select(a.fields).lean();
  if (!doc || String(doc.userId) !== String(userId)) throw fail(404, 'NOT_FOUND', 'Booking not found');

  const v = await view(kind, doc);
  if (!v.allowed) throw fail(409, 'NOT_ADDABLE', v.reason || 'Services cannot be added to this booking now.');
  const items = await a.items(doc);
  const item = items.find((i) => i.code === String(code).toLowerCase() && (petIndex == null || i.petIndex === Number(petIndex)));
  if (!item) throw fail(400, 'UNKNOWN_EXTRA', 'That service is not available on this booking.');

  const { taxPaise, filter, update } = await a.apply(doc, item);
  update.$push = { ...update.$push, extras: { code: item.code, name: item.name, petIndex: item.petIndex ?? null, pricePaise: item.pricePaise, taxPaise, addedAt: new Date() } };
  // Optimistic: the bill this price was worked out against must still be the bill.
  const row = await Model.findOneAndUpdate(
    { _id: doc._id, userId, status: { $in: a.open }, [`${a.money}.totalPaise`]: doc[a.money]?.totalPaise, ...filter },
    update, { new: true },
  ).lean();
  if (!row) throw fail(409, 'CHANGED', 'This booking just changed. Refresh and try again.');
  await require('../shop/partner-commission').refreeze(kind, row).catch(() => 0);

  const events = require('./job-events');
  const rupees = `₹${Math.round((item.pricePaise + taxPaise) / 100).toLocaleString('en-IN')}`;
  const payload = { kind, id: String(row._id), status: row.status, at: new Date().toISOString() };
  events.toProvider('user', row.userId, 'job.update', payload);
  const provider = row.workerId ? { kind: 'worker', id: row.workerId } : row.shopId ? { kind: 'shop', id: row.shopId } : null;
  if (provider) {
    events.toProvider(provider.kind, provider.id, 'job.update', payload);
    await events.push(provider, {
      title: 'Customer added a service',
      body: `${row.reference || 'A booking'}: ${item.name}${item.petName ? ` for ${item.petName}` : ''}. Collect ${rupees} more in cash.`,
      deepLink: KINDS[kind].providerLink(String(row._id)), data: payload,
    }).catch(() => {});
  }
  return { ok: true, totalPaise: row[a.money].totalPaise, addedPaise: item.pricePaise + taxPaise, message: `${item.name} added. Pay ${rupees} more in cash at the end.` };
}

module.exports = { view, add, ADAPTERS, MAX_EXTRAS };
