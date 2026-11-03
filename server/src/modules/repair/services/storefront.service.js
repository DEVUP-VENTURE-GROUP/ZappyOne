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

// How each provider presents in one service: the business name they registered for it (its verification details), and a photo of their work in it; null where they gave none, so the account's own name and cover stand.
async function serviceFace(vertical, owners) {
  if (!owners.length) return new Map();
  const line = await require('../../jobs/kinds').KINDS.repair.line({ vertical });
  const { ProviderEnrolment } = require('../../onboarding/onboarding.model');
  const or = (k) => ({ $or: [{ shopId: { $in: owners.filter((o) => o.shopId).map((o) => o.shopId) } }, { workerId: { $in: owners.filter((o) => o.workerId).map((o) => o.workerId) } }], ...k });
  const [enrolments, caps] = await Promise.all([
    line ? ProviderEnrolment.find(or({ lineCode: line.code, status: 'approved' })).select('shopId workerId fields').lean() : [],
    ProviderCapability.find(or({ vertical, isActive: true, photoKey: { $nin: ['', null] } })).select('shopId workerId photoKey').lean(),
  ]);
  const out = new Map();
  const at = (k) => out.get(k) || out.set(k, {}).get(k);
  for (const e of enrolments) {
    const name = (e.fields || []).find((f) => f.code === 'business_name')?.value?.trim();
    if (name) at(keyOf(e)).name = name;
  }
  for (const c of caps) if (!at(keyOf(c)).imageKey) at(keyOf(c)).imageKey = c.photoKey;
  return out;
}

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
  const [prices, shops, workers, live, working, faces] = await Promise.all([
    lowestPrices(vertical, eligible),
    Shop.find({ _id: { $in: shopIds } }).select(`businessName partnerType rating reviewCount completedJobs yearsActive coverImageUrl ${shopSvc.LIVE_FIELDS}`).lean(),
    Worker.find({ _id: { $in: workerIds }, isBlocked: { $ne: true }, 'kyc.status': 'approved' }).select('name rating reviewCount completedJobs profilePhotoKey workHours').lean(),
    require('../../worker/presence').liveIds(workerIds),
    require('../../worker/worker-dues.service').filterWorkingWorkers(workerIds),
    serviceFace(vertical, eligible),
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
      items.push({ kind: 'shop', id: String(s._id), name: faces.get(k)?.name || s.businessName, partnerType: s.partnerType || 'shop', imageKey: faces.get(k)?.imageKey || s.coverImageUrl, rating: s.reviewCount ? s.rating : null, reviewCount: s.reviewCount || 0, completedJobs: s.completedJobs || 0, yearsActive: s.yearsActive || null, distanceKm: f.distanceKm, openNow: open.openNow, todayHours: open.todayHours, ...price });
    } else {
      const w = workerById.get(String(f.workerId));
      if (!w || !working.has(String(f.workerId))) continue;
      items.push({ kind: 'worker', id: String(w._id), name: faces.get(k)?.name || w.name, partnerType: 'individual', imageKey: w.profilePhotoKey || faces.get(k)?.imageKey, rating: w.reviewCount ? w.rating : null, reviewCount: w.reviewCount || 0, completedJobs: w.completedJobs || 0, distanceKm: f.distanceKm, openNow: live.has(String(w._id)), ...price });
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
async function menuItems({ kind, id, vertical }) {
  if (!['shop', 'worker'].includes(kind) || !mongoose.Types.ObjectId.isValid(id)) return null;
  const owner = kind === 'shop' ? { shopId: new mongoose.Types.ObjectId(id) } : { workerId: new mongoose.Types.ObjectId(id) };
  const [prices, caps] = await Promise.all([
    ProviderPricing.find({ ...owner, vertical, ...BOOKABLE }).select('repairCode brandCode modelCode totalPaise estimatedDurationMin warrantyDays qualityCode').lean(),
    ProviderCapability.find({ ...owner, isActive: true }).select('repairCode includes photoKey estimatedDurationMin').lean(),
  ]);
  const capOf = new Map(caps.map((c) => [c.repairCode, c]));
  const can = new Set(capOf.keys());
  const usable = prices.filter((p) => can.has(p.repairCode));
  if (!usable.length) return { items: [] };
  const codes = [...new Set(usable.map((p) => p.repairCode))];
  const [repairs, problems, brands] = await Promise.all([
    Repair.find({ vertical, code: { $in: codes }, isActive: true }).select('code name description estimatedDurationMin pricingMode includes photoKey owner').lean(),
    Problem.find({ vertical, candidateRepairCodes: { $in: codes } }).select('code candidateRepairCodes displayOrder').lean(),
    Brand.find({ category: vertical }).select('code name sortOrder').sort({ sortOrder: 1 }).lean(),
  ]);
  const models = await DeviceModel.find({ vertical, brandCode: { $in: brands.map((b) => b.code) } }).select('code brandCode').lean();
  const firstModel = new Map();
  for (const m of models) if (!firstModel.has(m.brandCode)) firstModel.set(m.brandCode, m.code);
  const pathOf = `/repair/${vertical.replace(/_/g, '-')}`;

  const items = await Promise.all(repairs.map(async (r) => {
    const cap = capOf.get(r.code);
    const photoKey = cap?.photoKey || r.photoKey || '';
    const problem = problems.find((p) => p.candidateRepairCodes.includes(r.code));
    const rows = usable.filter((p) => p.repairCode === r.code);
    const options = brands.flatMap((b) => {
      const row = rows.find((p) => p.brandCode === b.code) || rows.find((p) => !p.brandCode);
      if (!row) return [];
      const model = row.modelCode || firstModel.get(b.code) || null;
      const q = new URLSearchParams({ brand: b.code, ...(model && { model }), ...(problem && { problem: problem.code }), provider: `${kind}:${id}` });
      return [{ brandCode: b.code, typeName: b.name, totalPaise: row.totalPaise, warrantyDays: row.warrantyDays || 0, path: `${pathOf}?${q}` }];
    });
    return {
      repairCode: r.code, name: r.name, description: r.description || '', own: !!r.owner,
      includes: cap?.includes?.length ? cap.includes : (r.includes || []),
      photoUrl: photoKey ? await s3Service.signMedia(photoKey).catch(() => null) : null,
      minutes: cap?.estimatedDurationMin || rows[0]?.estimatedDurationMin || r.estimatedDurationMin || null,
      quoted: r.pricingMode === 'diagnosis_required', options, fromPaise: options.length ? Math.min(...options.map((o) => o.totalPaise)) : null,
    };
  }));
  return { items: items.filter((i) => i.options.length).sort((a, b) => a.fromPaise - b.fromPaise) };
}

// The menu plus how this provider presents in the service: the name they registered for it and a photo of their work, for the storefront heading.
async function storefrontMenu({ kind, id, vertical }) {
  const menu = await menuItems({ kind, id, vertical });
  if (!menu) return menu;
  const owner = kind === 'shop' ? { shopId: id } : { workerId: id };
  const face = (await serviceFace(vertical, [owner])).get(keyOf(owner)) || {};
  return { ...menu, serviceName: face.name || null, serviceImageUrl: face.imageKey ? await s3Service.signMedia(face.imageKey).catch(() => null) : null };
}

// One search across the menus near the customer: every job whose name matches, from each verified provider covering the spot who prices it, cheapest first.
async function searchMenus({ q, lat, lng, limit = 12 }) {
  const term = String(q || '').trim().slice(0, 60);
  if (term.length < 2 || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return { items: [] };
  const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(/\s+/).join('.*'), 'i');
  const matched = await Repair.find({ name: rx, isActive: true, isArchived: false, isAddOn: { $ne: true } })
    .select('code name vertical owner includes photoKey').limit(200).lean();
  const menu = require('./provider-menu.service');
  const verticals = [];
  for (const v of [...new Set(matched.map((r) => r.vertical))]) {
    if (verticals.length >= 6) break;
    if (await menu.isMenuService(v)) verticals.push(v);
  }
  const out = [];
  for (const vertical of verticals) {
    const { items: fronts } = await listStorefronts({ vertical, lat: Number(lat), lng: Number(lng), limit: 50 });
    if (!fronts.length) continue;
    const jobs = matched.filter((r) => r.vertical === vertical);
    const byKey = new Map(fronts.map((f) => [`${f.kind}:${f.id}`, f]));
    const rows = await ProviderPricing.find({
      vertical, ...BOOKABLE, repairCode: { $in: jobs.map((j) => j.code) },
      $or: [{ shopId: { $in: fronts.filter((f) => f.kind === 'shop').map((f) => f.id) } }, { workerId: { $in: fronts.filter((f) => f.kind === 'worker').map((f) => f.id) } }],
    }).select('shopId workerId repairCode totalPaise').lean();
    const best = new Map();
    for (const r of rows) {
      const k = `${keyOf(r)}|${r.repairCode}`;
      if (!best.has(k) || r.totalPaise < best.get(k)) best.set(k, r.totalPaise);
    }
    for (const [k, fromPaise] of best) {
      const [provider, code] = k.split('|');
      const job = jobs.find((j) => j.code === code);
      const front = byKey.get(provider);
      if (!job || !front || (job.owner && `${job.owner.kind}:${job.owner.id}` !== provider)) continue;
      out.push({
        repairCode: code, name: job.name, vertical, fromPaise, photoKey: job.photoKey || '',
        provider: { kind: front.kind, id: front.id, name: front.name, rating: front.rating, imageUrl: front.imageUrl, arrivalMinutes: front.arrivalMinutes ?? null, openNow: front.openNow },
        path: `/storefront/${front.kind}/${front.id}?service=${vertical}`,
      });
    }
  }
  out.sort((a, b) => a.fromPaise - b.fromPaise || (b.provider.rating || 0) - (a.provider.rating || 0));
  const page = out.slice(0, limit);
  await Promise.all(page.map(async (i) => { i.photoUrl = i.photoKey ? await s3Service.signMedia(i.photoKey).catch(() => null) : null; delete i.photoKey; }));
  return { items: page };
}

module.exports = { listStorefronts, storefrontMenu, searchMenus, SORTS };
