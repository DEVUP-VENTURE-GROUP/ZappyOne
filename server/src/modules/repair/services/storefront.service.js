// Zomato-style browsing on the repair engine: who near the customer is verified, priced and taking work for one service, and each one's menu. Eligibility is the booking engine's own (matching.findServiceableProviders, eligibility, approved prices), so a storefront listed here is one the booking flow will accept.
const mongoose = require('mongoose');
const { ProviderPricing } = require('../models/pricing.model');
const { Repair } = require('../models/repair.model');
const { ProviderCapability } = require('../models/capability.model');
const { Problem } = require('../models/problem.model');
const Brand = require('../../service/brand.model');
const DeviceModel = require('../../service/device-model.model');
const Shop = require('../../shop/shop.model');
const Worker = require('../../worker/worker.model');
const s3Service = require('../../../core/storage/s3');

const BOOKABLE = { approvalStatus: { $in: ['approved', 'auto_approved'] }, supersededAt: null, isActive: true };
const keyOf = (p) => (p.shopId ? `shop:${p.shopId}` : `worker:${p.workerId}`);
const SORTS = ['best', 'nearest', 'cheapest', 'rating', 'fastest'];

async function lowestPrices(vertical, owners) {
  const shopIds = owners.filter((o) => o.shopId).map((o) => new mongoose.Types.ObjectId(o.shopId));
  const workerIds = owners.filter((o) => o.workerId).map((o) => new mongoose.Types.ObjectId(o.workerId));
  const rows = await ProviderPricing.aggregate([
    { $match: { vertical, ...BOOKABLE, $or: [{ shopId: { $in: shopIds } }, { workerId: { $in: workerIds } }] } },
    { $group: { _id: { s: '$shopId', w: '$workerId' }, fromPaise: { $min: '$totalPaise' }, jobs: { $addToSet: '$repairCode' } } },
  ]);
  return new Map(rows.map((r) => [r._id.s ? `shop:${r._id.s}` : `worker:${r._id.w}`, { fromPaise: r.fromPaise, jobs: r.jobs.length }]));
}

// Best puts a provider who can arrive within the promise and keeps time first, then rating, then price; the customer can re-sort the same list.
function score(x) {
  const rating = x.rating ?? 4.2;
  const onTime = x.onTimeRate ?? 0.85;
  const arrive = x.arrivalMinutes == null ? 0.5 : Math.max(0, 1 - x.arrivalMinutes / 60);
  return rating / 5 * 0.35 + onTime * 0.25 + arrive * 0.25 + Math.min(1, (x.completedJobs || 0) / 200) * 0.15;
}
const order = {
  best: (a, b) => score(b) - score(a),
  nearest: (a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99),
  cheapest: (a, b) => a.fromPaise - b.fromPaise,
  rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviewCount || 0) - (a.reviewCount || 0),
  fastest: (a, b) => (a.arrivalMinutes ?? 999) - (b.arrivalMinutes ?? 999),
};

async function listStorefronts({ vertical, lat, lng, serviceMode = 'doorstep', sort = 'best', limit = 30 }) {
  const matching = require('./matching.service');
  const found = await matching.findServiceableProviders({ lat, lng, serviceMode });
  if (!found.length) return { items: [], total: 0 };
  const line = await require('../../jobs/kinds').KINDS.repair.line({ vertical });
  const approved = line ? new Set((await require('../../onboarding/eligibility').approvedProviders(line)).map((p) => p.id)) : new Set();
  const eligible = found.filter((f) => approved.has(String(f.shopId || f.workerId)));
  if (!eligible.length) return { items: [], total: 0 };

  const shopIds = eligible.filter((f) => f.shopId).map((f) => f.shopId);
  const workerIds = eligible.filter((f) => f.workerId).map((f) => f.workerId);
  const shopSvc = require('../../shop/shop.service');
  const [prices, shops, workers, live, working] = await Promise.all([
    lowestPrices(vertical, eligible),
    Shop.find({ _id: { $in: shopIds } }).select(`businessName partnerType rating reviewCount completedJobs yearsActive coverImageUrl ${shopSvc.LIVE_FIELDS}`).lean(),
    Worker.find({ _id: { $in: workerIds }, isBlocked: { $ne: true }, 'kyc.status': 'approved' }).select('name rating reviewCount completedJobs profilePhotoKey workHours').lean(),
    require('../../worker/presence').liveIds(workerIds),
    require('../../worker/worker-dues.service').filterWorkingWorkers(workerIds),
  ]);
  const shopById = new Map(shops.map((x) => [String(x._id), x]));
  const workerById = new Map(workers.map((x) => [String(x._id), x]));

  const items = [];
  for (const f of eligible) {
    const k = keyOf(f);
    const price = prices.get(k);
    if (!price) continue;
    if (f.shopId) {
      const s = shopById.get(String(f.shopId));
      if (!s || !shopSvc.isLive(s)) continue;
      const open = shopSvc.withOpenState(s);
      items.push({ kind: 'shop', id: String(s._id), name: s.businessName, partnerType: s.partnerType || 'shop', imageKey: s.coverImageUrl, rating: s.reviewCount ? s.rating : null, reviewCount: s.reviewCount || 0, completedJobs: s.completedJobs || 0, yearsActive: s.yearsActive || null, distanceKm: f.distanceKm, openNow: open.openNow, todayHours: open.todayHours, ...price });
    } else {
      const w = workerById.get(String(f.workerId));
      if (!w || !working.has(String(f.workerId))) continue;
      items.push({ kind: 'worker', id: String(w._id), name: w.name, partnerType: 'individual', imageKey: w.profilePhotoKey, rating: w.reviewCount ? w.rating : null, reviewCount: w.reviewCount || 0, completedJobs: w.completedJobs || 0, distanceKm: f.distanceKm, openNow: live.has(String(w._id)), ...price });
    }
  }
  if (!items.length) return { items: [], total: 0 };

  const [arrivals, kept] = await Promise.all([
    serviceMode === 'workshop' ? new Map() : require('../../jobs/arrival').forProviders(items.map((i) => ({ kind: i.kind, id: i.id, busyMin: 0 })), { lat, lng }).catch(() => new Map()),
    require('../../jobs/promise').onTimeRates(items.map((i) => i.id)).catch(() => new Map()),
  ]);
  for (const i of items) {
    const e = arrivals.get(`${i.kind}:${i.id}`);
    if (e) Object.assign(i, { arrivalMinutes: i.openNow === false ? null : e.minutes, arrivalWithinPromise: e.withinPromise, ...(e.km != null && { distanceKm: e.km }) });
    i.onTimeRate = kept.get(i.id) ?? null;
  }
  items.sort(order[SORTS.includes(sort) ? sort : 'best']);
  const page = items.slice(0, limit);
  await Promise.all(page.map(async (i) => { i.imageUrl = await s3Service.signMedia(i.imageKey).catch(() => null); delete i.imageKey; }));
  return { items: page, total: items.length };
}

// One storefront's menu for one service: every job it has a bookable price for, per option (home size, vehicle…), with the link the booking flow opens.
async function storefrontMenu({ kind, id, vertical }) {
  if (!['shop', 'worker'].includes(kind) || !mongoose.Types.ObjectId.isValid(id)) return null;
  const owner = kind === 'shop' ? { shopId: new mongoose.Types.ObjectId(id) } : { workerId: new mongoose.Types.ObjectId(id) };
  const [prices, caps] = await Promise.all([
    ProviderPricing.find({ ...owner, vertical, ...BOOKABLE }).select('repairCode brandCode modelCode totalPaise estimatedDurationMin warrantyDays qualityCode').lean(),
    ProviderCapability.find({ ...owner, isActive: true }).select('repairCode').lean(),
  ]);
  const can = new Set(caps.map((c) => c.repairCode));
  const usable = prices.filter((p) => can.has(p.repairCode));
  if (!usable.length) return { items: [] };
  const codes = [...new Set(usable.map((p) => p.repairCode))];
  const [repairs, problems, brands] = await Promise.all([
    Repair.find({ vertical, code: { $in: codes }, isActive: true }).select('code name estimatedDurationMin pricingMode').lean(),
    Problem.find({ vertical, candidateRepairCodes: { $in: codes } }).select('code candidateRepairCodes displayOrder').lean(),
    Brand.find({ category: vertical }).select('code name sortOrder').sort({ sortOrder: 1 }).lean(),
  ]);
  const models = await DeviceModel.find({ vertical, brandCode: { $in: brands.map((b) => b.code) } }).select('code brandCode').lean();
  const firstModel = new Map();
  for (const m of models) if (!firstModel.has(m.brandCode)) firstModel.set(m.brandCode, m.code);
  const pathOf = `/repair/${vertical.replace(/_/g, '-')}`;

  const items = repairs.map((r) => {
    const problem = problems.find((p) => p.candidateRepairCodes.includes(r.code));
    const rows = usable.filter((p) => p.repairCode === r.code);
    const options = brands.flatMap((b) => {
      const row = rows.find((p) => p.brandCode === b.code) || rows.find((p) => !p.brandCode);
      if (!row) return [];
      const model = row.modelCode || firstModel.get(b.code) || null;
      const q = new URLSearchParams({ brand: b.code, ...(model && { model }), ...(problem && { problem: problem.code }), provider: `${kind}:${id}` });
      return [{ brandCode: b.code, typeName: b.name, totalPaise: row.totalPaise, warrantyDays: row.warrantyDays || 0, path: `${pathOf}?${q}` }];
    });
    return { repairCode: r.code, name: r.name, minutes: rows[0]?.estimatedDurationMin || r.estimatedDurationMin || null, quoted: r.pricingMode === 'diagnosis_required', options, fromPaise: options.length ? Math.min(...options.map((o) => o.totalPaise)) : null };
  }).filter((i) => i.options.length).sort((a, b) => a.fromPaise - b.fromPaise);
  return { items };
}

module.exports = { listStorefronts, storefrontMenu, SORTS };
