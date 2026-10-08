/**
 * What customers can see but nobody can do, for ops — read only.
 *
 * Per repair service: each repair is either bookable (some approved provider
 * does it and it has a price: a shop's own, or the ZappyOne standard for an
 * individual), or a gap with the reason:
 *
 *   nobody_does   no approved provider has it in their work
 *   no_price      someone does it, but no shop priced it and there is no
 *                 ZappyOne standard (so no individual can be booked for it)
 *
 * And the price requests customers sent that no shop has answered for half an
 * hour: those are customers waiting right now, worth a phone call.
 */
const { ServiceLine, ProviderEnrolment } = require('../../onboarding/onboarding.model');
const { Repair } = require('../models/repair.model');
const { ProviderCapability } = require('../models/capability.model');
const { ZappyReferencePricing, ProviderPricing } = require('../models/pricing.model');
const { RepairPriceRequest } = require('../models/price-request.model');

const UNANSWERED_AFTER_MIN = 30;

async function gaps() {
  const lines = await ServiceLine.find({ status: 'live', isActive: true, isArchived: false, repairVertical: { $ne: null } })
    .select('code name repairVertical').lean();
  const out = [];
  for (const line of lines) {
    const v = line.repairVertical;
    const enrolled = await ProviderEnrolment.find({ lineCode: line.code, status: 'approved' }).select('shopId workerId').lean();
    const shopIds = enrolled.filter((e) => e.shopId).map((e) => e.shopId);
    const workerIds = enrolled.filter((e) => e.workerId).map((e) => e.workerId);
    const [repairs, caps, standard, shopPriced] = await Promise.all([
      Repair.find({ vertical: v, isActive: true, isArchived: { $ne: true } }).select('code name pricingMode').lean(),
      ProviderCapability.find({ vertical: v, isActive: true, $or: [{ shopId: { $in: shopIds } }, { workerId: { $in: workerIds } }] })
        .select('repairCode shopId workerId').lean(),
      ZappyReferencePricing.distinct('repairCode', { vertical: v, isActive: true, supersededAt: null }),
      ProviderPricing.distinct('repairCode', { vertical: v, shopId: { $in: shopIds }, isActive: true, supersededAt: null, approvalStatus: { $in: ['approved', 'auto_approved'] } }),
    ]);
    const std = new Set(standard); const priced = new Set(shopPriced);
    const doers = new Map();
    for (const c of caps) {
      const d = doers.get(c.repairCode) || { shops: 0, individuals: 0 };
      if (c.shopId) d.shops += 1; else d.individuals += 1;
      doers.set(c.repairCode, d);
    }
    const rows = repairs.map((r) => {
      const d = doers.get(r.code) || { shops: 0, individuals: 0 };
      const inspection = r.pricingMode === 'diagnosis_required';
      const bookable = d.shops + d.individuals > 0
        && (inspection || priced.has(r.code) || (d.individuals > 0 && std.has(r.code)));
      const gap = bookable ? null : (d.shops + d.individuals === 0 ? 'nobody_does' : 'no_price');
      return { code: r.code, name: r.name, shops: d.shops, individuals: d.individuals, standardPrice: std.has(r.code), gap };
    });
    out.push({
      line: line.code, name: line.name, vertical: v,
      providers: { shops: shopIds.length, individuals: workerIds.length },
      bookable: rows.filter((r) => !r.gap).length,
      gaps: rows.filter((r) => r.gap),
      total: rows.length,
    });
  }

  const waitingSince = new Date(Date.now() - UNANSWERED_AFTER_MIN * 60000);
  const unanswered = await RepairPriceRequest.find({
    status: 'open', expiresAt: { $gt: new Date() }, createdAt: { $lt: waitingSince }, 'offers.0': { $exists: false },
  }).sort({ createdAt: 1 }).limit(50).select('reference vertical brandCode modelCode repairCode location.address notifiedShopIds createdAt expiresAt').lean();

  return { lines: out, unansweredRequests: unanswered.map((r) => ({ ...r, shopsAsked: r.notifiedShopIds.length, notifiedShopIds: undefined })) };
}

module.exports = { gaps, UNANSWERED_AFTER_MIN };
