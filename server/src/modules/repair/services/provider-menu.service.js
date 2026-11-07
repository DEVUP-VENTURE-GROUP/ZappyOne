// A provider's own menu for one fixed-price service (cleaning, daily help, washes, electrician…): ZappyOne's sample jobs they keep or drop, jobs of their own, what each includes, a photo, and their price for each option (home size, vehicle…). Prices go live at once through the one price path (pricing.controller applyPriceSubmission); booking, payment and settlement treat a menu job like any catalog job.
const crypto = require('crypto');
const mongoose = require('mongoose');
const { httpError } = require('../../../core/errors');
const { Repair } = require('../models/repair.model');
const { Problem, ProblemCategory } = require('../models/problem.model');
const { ProviderCapability } = require('../models/capability.model');
const { ProviderPricing, ZappyReferencePricing } = require('../models/pricing.model');
const Brand = require('../../service/brand.model');
const s3Service = require('../../../core/storage/s3');

const LIVE = { supersededAt: null, isActive: true, approvalStatus: { $in: ['approved', 'auto_approved'] } };
const MAX_OWN = 40;
const MAX_INCLUDES = 8;
const ownerKey = (o) => (o.shopId ? `shop:${o.shopId}` : `worker:${o.workerId}`);
const ownerRef = (o) => (o.shopId ? { kind: 'shop', id: o.shopId } : { kind: 'worker', id: o.workerId });
const filterOf = (o) => (o.shopId ? { shopId: o.shopId } : { workerId: o.workerId });
const cleanIncludes = (list = []) => [...new Set(list.map((x) => String(x || '').trim()).filter((x) => x.length >= 2))].slice(0, MAX_INCLUDES).map((x) => x.slice(0, 60));

// A menu service unless admin set it up as model-by-model pricing; nothing seeded yet means the provider builds their own menu, never an empty list.
async function isMenuService(vertical) {
  const deep = await Repair.exists({ vertical, owner: null, isActive: true, isArchived: false, $or: [{ pricingMode: { $ne: 'fixed' } }, { 'partRequirements.0': { $exists: true } }] });
  return !deep;
}

async function assertMenuService(vertical) {
  if (!(await isMenuService(vertical))) throw httpError('This service is priced model by model, not as a menu.', 400, 'NOT_A_MENU_SERVICE');
}

async function menu(owner, vertical) {
  await assertMenuService(vertical);
  const [types, repairs, caps, prices, refs] = await Promise.all([
    Brand.find({ category: vertical, isActive: { $ne: false } }).select('code name sortOrder').sort({ sortOrder: 1, name: 1 }).lean(),
    Repair.find({ vertical, isActive: true, isArchived: false, isAddOn: { $ne: true }, $or: [{ owner: null }, { 'owner.id': owner.shopId || owner.workerId }] })
      .select('code name description owner includes photoKey estimatedDurationMin displayOrder').sort({ displayOrder: 1, name: 1 }).lean(),
    ProviderCapability.find({ ...filterOf(owner), vertical }).select('repairCode isActive includes photoKey estimatedDurationMin').lean(),
    ProviderPricing.find({ ...filterOf(owner), vertical, ...LIVE }).select('repairCode brandCode totalPaise').lean(),
    ZappyReferencePricing.find({ vertical, supersededAt: null, isActive: true }).select('repairCode brandCode recommendedPaise').lean(),
  ]);
  const capOf = new Map(caps.map((c) => [c.repairCode, c]));
  const items = await Promise.all(repairs.map(async (r) => {
    const cap = capOf.get(r.code);
    const own = !!r.owner;
    const priceOf = (type) => prices.find((p) => p.repairCode === r.code && p.brandCode === type)?.totalPaise
      ?? prices.find((p) => p.repairCode === r.code && !p.brandCode)?.totalPaise ?? null;
    const suggestOf = (type) => (own ? null : refs.find((x) => x.repairCode === r.code && x.brandCode === type)?.recommendedPaise
      ?? refs.find((x) => x.repairCode === r.code && !x.brandCode)?.recommendedPaise ?? null);
    const photoKey = cap?.photoKey || r.photoKey || '';
    return {
      repairCode: r.code, name: r.name, own,
      offered: !!cap?.isActive && types.some((t) => priceOf(t.code) != null),
      includes: cap?.includes?.length ? cap.includes : (r.includes || []),
      minutes: cap?.estimatedDurationMin || r.estimatedDurationMin || null,
      photoKey, photoUrl: photoKey ? await s3Service.signMedia(photoKey).catch(() => null) : null,
      prices: Object.fromEntries(types.map((t) => [t.code, priceOf(t.code)])),
      suggested: Object.fromEntries(types.map((t) => [t.code, suggestOf(t.code)])),
    };
  }));
  const offered = items.filter((i) => i.offered);
  const tips = [
    !offered.length && 'Add at least one job with a price',
    offered.length && offered.some((i) => !i.photoKey) && 'Add a photo of your work to each job',
    offered.length && offered.some((i) => !i.includes.length) && 'Say what is included in each job',
  ].filter(Boolean);
  return { vertical, types: types.map((t) => ({ code: t.code, name: t.name })), items, tips };
}

// A new job of the provider's own, inside the service, under its first heading.
async function createOwnJob(owner, vertical, { name, minutes, includes, photoKey }) {
  if ((await Repair.countDocuments({ vertical, 'owner.id': owner.shopId || owner.workerId, isArchived: false })) >= MAX_OWN) {
    throw httpError(`You can add up to ${MAX_OWN} jobs of your own to one service.`, 409, 'MENU_FULL');
  }
  const [sample, category] = await Promise.all([
    Repair.findOne({ vertical, owner: null, isActive: true }).select('allowedServiceModes qaChecklistCodes').lean(),
    ProblemCategory.findOne({ vertical, isActive: true, isArchived: false }).sort({ displayOrder: 1 }).lean(),
  ]);
  if (!category) throw httpError('This service is not set up for menus yet.', 409, 'NO_CATEGORY');
  const code = `own_${crypto.randomBytes(5).toString('hex')}`;
  const problemCode = `${code}_req`;
  await Repair.create({
    code, name, vertical, pricingMode: 'fixed', minSkillLevel: 1, warrantyDays: 0,
    estimatedDurationMin: minutes, allowedServiceModes: sample?.allowedServiceModes?.length ? sample.allowedServiceModes : ['doorstep'],
    qaChecklistCodes: sample?.qaChecklistCodes || [], problemCodes: [problemCode],
    owner: ownerRef(owner), includes, photoKey: photoKey || '',
  });
  await Problem.create({
    code: problemCode, name, vertical, categoryId: category._id, categoryCode: category.code,
    candidateRepairCodes: [code], ownerKey: ownerKey(owner), displayOrder: 100,
  });
  return code;
}

// Save one job on the menu (a sample kept or one of their own): a blank price takes that option off, no prices at all takes the job off the menu.
async function saveItem(owner, vertical, body, actor) {
  await assertMenuService(vertical);
  const types = await Brand.find({ category: vertical, isActive: { $ne: false } }).select('code').lean();
  const typeCodes = new Set(types.map((t) => t.code));
  const includes = cleanIncludes(body.includes);
  const minutes = Math.round(Number(body.minutes)) || null;
  if (minutes != null && (minutes < 5 || minutes > 1440)) throw httpError('Set how long it takes, between 5 minutes and a day.', 400, 'BAD_MINUTES');
  const prices = Object.entries(body.prices || {}).filter(([t]) => typeCodes.has(t));
  const priced = prices.filter(([, p]) => Number(p) >= 100);
  if (prices.some(([, p]) => p != null && p !== '' && !(Number(p) >= 100 && Number(p) <= 100000000))) throw httpError('Each price must be at least ₹1.', 400, 'BAD_PRICE');

  let repair;
  if (body.repairCode) {
    repair = await Repair.findOne({ vertical, code: body.repairCode, isActive: true, isArchived: false }).lean();
    if (!repair || (repair.owner && String(repair.owner.id) !== String(owner.shopId || owner.workerId))) throw httpError('That job is not on this service.', 404, 'UNKNOWN_JOB');
    if (repair.owner) {
      const name = String(body.name || repair.name).trim();
      if (name.length < 2) throw httpError('Name the job.', 400, 'NAME_REQUIRED');
      await Repair.updateOne({ _id: repair._id }, { $set: { name, includes, photoKey: body.photoKey || '', ...(minutes && { estimatedDurationMin: minutes }) } });
      await Problem.updateOne({ vertical, code: `${repair.code}_req`, ownerKey: ownerKey(owner) }, { $set: { name } });
    }
  } else {
    const name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 80) throw httpError('Name the job in 2 to 80 letters.', 400, 'NAME_REQUIRED');
    if (!priced.length) throw httpError('Set a price for at least one option.', 400, 'PRICE_REQUIRED');
    const code = await createOwnJob(owner, vertical, { name, minutes: minutes || 60, includes, photoKey: body.photoKey });
    repair = await Repair.findOne({ vertical, code }).lean();
  }

  await ProviderCapability.updateOne(
    { ...filterOf(owner), repairCode: repair.code },
    {
      $set: {
        vertical, isActive: priced.length > 0, includes, photoKey: body.photoKey || '',
        estimatedDurationMin: minutes, serviceModes: repair.allowedServiceModes, skillLevel: Math.max(1, repair.minSkillLevel || 1),
      },
      $setOnInsert: { ...filterOf(owner), repairCode: repair.code, verificationStatus: 'not_required' },
    },
    { upsert: true },
  );

  const { applyPriceSubmission } = require('../controllers/provider/pricing.controller');
  const live = await ProviderPricing.find({ ...filterOf(owner), vertical, repairCode: repair.code, ...LIVE }).select('brandCode totalPaise').lean();
  for (const [brandCode, p] of prices) {
    const paise = Number(p) >= 100 ? Math.round(Number(p)) : null;
    const current = live.find((x) => x.brandCode === brandCode);
    if (paise == null) {
      if (current) await ProviderPricing.updateOne({ _id: current._id }, { $set: { isActive: false, supersededAt: new Date() } });
      continue;
    }
    if (current?.totalPaise === paise) continue;
    const r = await applyPriceSubmission({
      owner, vertical, requestedByRole: actor.role, requestedById: actor.id,
      row: { repairCode: repair.code, brandCode, totalPaise: paise, estimatedDurationMin: minutes },
    });
    if (r.error) throw httpError(r.error.body.error, r.error.status, r.error.body.code);
  }
  return menu(owner, vertical);
}

// Off the menu: a sample job stops being offered; a job of their own is archived with its prices.
async function removeItem(owner, vertical, repairCode) {
  const repair = await Repair.findOne({ vertical, code: repairCode }).lean();
  if (!repair) throw httpError('That job is not on this service.', 404, 'UNKNOWN_JOB');
  const mine = repair.owner && String(repair.owner.id) === String(owner.shopId || owner.workerId);
  if (repair.owner && !mine) throw httpError('That job is not on this service.', 404, 'UNKNOWN_JOB');
  await ProviderCapability.updateOne({ ...filterOf(owner), repairCode }, { $set: { isActive: false } });
  await ProviderPricing.updateMany({ ...filterOf(owner), vertical, repairCode, supersededAt: null }, { $set: { isActive: false, supersededAt: new Date() } });
  if (mine) {
    await Repair.updateOne({ _id: repair._id }, { $set: { isActive: false, isArchived: true } });
    await Problem.updateOne({ vertical, code: `${repairCode}_req`, ownerKey: ownerKey(owner) }, { $set: { isActive: false, isArchived: true } });
  }
  return menu(owner, vertical);
}

// Every live price on this menu up or down by a percentage, rounded to the rupee.
async function adjustAll(owner, vertical, pct, actor) {
  await assertMenuService(vertical);
  if (!(Number(pct) >= -50 && Number(pct) <= 100) || Number(pct) === 0) throw httpError('Change prices by between -50% and +100%.', 400, 'BAD_PERCENT');
  const { applyPriceSubmission } = require('../controllers/provider/pricing.controller');
  const rows = await ProviderPricing.find({ ...filterOf(owner), vertical, ...LIVE }).lean();
  for (const row of rows) {
    const paise = Math.max(100, Math.round((row.totalPaise * (1 + Number(pct) / 100)) / 100) * 100);
    await applyPriceSubmission({
      owner, vertical, requestedByRole: actor.role, requestedById: actor.id,
      row: { repairCode: row.repairCode, brandCode: row.brandCode, modelCode: row.modelCode, qualityCode: row.qualityCode, serviceMode: row.serviceMode, cityCode: row.cityCode, totalPaise: paise, estimatedDurationMin: row.estimatedDurationMin, warrantyDays: row.warrantyDays },
    });
  }
  return menu(owner, vertical);
}

// The starter menu: every sample job they have not priced yet, at the suggested starting price, which they then edit or delete.
async function useSamples(owner, vertical, actor) {
  const current = await menu(owner, vertical);
  for (const item of current.items.filter((i) => !i.own && !i.offered)) {
    const prices = Object.fromEntries(Object.entries(item.suggested).filter(([, p]) => p != null));
    if (!Object.keys(prices).length) continue;
    await saveItem(owner, vertical, { repairCode: item.repairCode, includes: item.includes, minutes: item.minutes, photoKey: item.photoKey, prices }, actor);
  }
  return menu(owner, vertical);
}

const ownerFromAuth = (auth) => (auth.role === 'shop'
  ? { shopId: new mongoose.Types.ObjectId(auth.sub), workerId: null }
  : { shopId: null, workerId: new mongoose.Types.ObjectId(auth.sub) });

module.exports = { isMenuService, menu, saveItem, removeItem, adjustAll, useSamples, ownerFromAuth, cleanIncludes };
