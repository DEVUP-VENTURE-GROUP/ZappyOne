// Admin's read-only view of what a shop or independent pro has set up to sell: every service they enrolled in, whether customers see it, and each job with their price per option.
const Joi = require('joi');
const mongoose = require('mongoose');
const Shop = require('../../shop/shop.model');
const Worker = require('../../worker/worker.model');
const { ProviderEnrolment, ServiceLine } = require('../../onboarding/onboarding.model');
const { Repair } = require('../../repair/models/repair.model');
const { ProviderPricing } = require('../../repair/models/pricing.model');
const Brand = require('../../service/brand.model');
const { modelNames, keyOf } = require('../../service/model-names');
const menuSvc = require('../../repair/services/provider-menu.service');
const { shownToCustomers } = require('../../repair/services/storefront.service');
const { inspectionFeeFor } = require('../../repair/services/pricing.service');

const MODEL_ROWS = 300;

async function modelPrices(owner, vertical) {
  const rows = await ProviderPricing.find({ ...owner, vertical, supersededAt: null, isActive: true })
    .select('repairCode brandCode modelCode qualityCode serviceMode totalPaise approvalStatus updatedAt vertical')
    .sort({ repairCode: 1, brandCode: 1, totalPaise: 1 }).limit(MODEL_ROWS + 1).lean();
  const shown = rows.slice(0, MODEL_ROWS);
  const [repairs, brands, models] = await Promise.all([
    Repair.find({ vertical, code: { $in: [...new Set(shown.map((r) => r.repairCode))] } }).select('code name').lean(),
    Brand.find({ category: vertical, code: { $in: [...new Set(shown.map((r) => r.brandCode).filter(Boolean))] } }).select('code name').lean(),
    modelNames(shown),
  ]);
  const repairName = new Map(repairs.map((r) => [r.code, r.name]));
  const brandName = new Map(brands.map((b) => [b.code, b.name]));
  return {
    more: rows.length > MODEL_ROWS,
    rows: shown.map((r) => ({
      job: repairName.get(r.repairCode) || r.repairCode,
      brand: r.brandCode ? brandName.get(r.brandCode) || r.brandCode : 'Any',
      model: r.modelCode ? models.get(keyOf(vertical, r.modelCode)) || r.modelCode : 'Any',
      quality: r.qualityCode || null, serviceMode: r.serviceMode || null,
      totalPaise: r.totalPaise, approvalStatus: r.approvalStatus, updatedAt: r.updatedAt,
    })),
  };
}

async function serviceSetup(kind, id, owner, enrolment, line) {
  const vertical = line?.repairVertical || null;
  const base = { lineCode: enrolment.lineCode, name: line?.name || enrolment.lineCode, enrolment: enrolment.status, vertical };
  if (!vertical) return { ...base, mode: 'none' };
  const [visible, inspectionFeePaise, isMenu] = await Promise.all([
    shownToCustomers(kind, id, vertical),
    inspectionFeeFor({ vertical, ...owner }),
    menuSvc.isMenuService(vertical),
  ]);
  if (!isMenu) return { ...base, mode: 'models', visible, inspectionFeePaise, ...(await modelPrices(owner, vertical)) };
  const m = await menuSvc.menu(owner, vertical);
  return {
    ...base, mode: 'menu', visible, inspectionFeePaise, types: m.types, tips: m.tips,
    items: m.items.map(({ photoKey, photoKeys, ...i }) => i), // eslint-disable-line no-unused-vars
  };
}

async function storeSetup(kind, id) {
  if (!['shop', 'worker'].includes(kind) || !mongoose.Types.ObjectId.isValid(id)) return null;
  const provider = kind === 'shop'
    ? await Shop.findById(id).select('businessName ownerName phone isActive isBlocked takingOrders hours kyc.status').lean()
    : await Worker.findById(id).select('name phone isActive isBlocked isOnline shopId kyc.status').lean();
  if (!provider) return null;
  const owner = kind === 'shop' ? { shopId: provider._id } : { workerId: provider._id };
  const enrolments = await ProviderEnrolment.find(owner).select('lineCode status').lean();
  const lines = await ServiceLine.find({ code: { $in: enrolments.map((e) => e.lineCode) } }).select('code name repairVertical').lean();
  const lineOf = new Map(lines.map((l) => [l.code, l]));
  const services = await Promise.all(enrolments.map((e) => serviceSetup(kind, provider._id, owner, e, lineOf.get(e.lineCode))));
  return {
    kind,
    provider: {
      id: provider._id, name: provider.businessName || provider.name, ownerName: provider.ownerName || null, phone: provider.phone,
      kycStatus: provider.kyc?.status || 'not_submitted', isBlocked: !!provider.isBlocked, openForBookings: provider.isActive !== false,
      takingOrders: provider.takingOrders ?? null, isOnline: provider.isOnline ?? null, hours: provider.hours || [],
    },
    services: services.sort((a, b) => Number(b.visible || 0) - Number(a.visible || 0) || a.name.localeCompare(b.name)),
  };
}

const route = (kind) => async (req, res, next) => {
  try {
    const setup = await storeSetup(kind, req.params.id);
    if (!setup) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    res.json(setup);
  } catch (err) { next(err); }
};

const EDIT_BODY = Joi.object({
  name: Joi.string().trim().min(2).max(80),
  includes: Joi.array().items(Joi.string().trim().max(60).allow('')).max(12),
  minutes: Joi.number().integer().min(5).max(1440),
  keepPhotos: Joi.array().items(Joi.number().integer().min(0).max(5)).max(6),
  hidden: Joi.boolean(),
}).min(1);

// Admin edits one job on a menu (never its prices); logged, and the partner is told what changed.
const editRoute = (kind) => async (req, res, next) => {
  try {
    const { id, vertical, code } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    const exists = kind === 'shop' ? await Shop.exists({ _id: id }) : await Worker.exists({ _id: id });
    if (!exists) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    const owner = kind === 'shop' ? { shopId: new mongoose.Types.ObjectId(id), workerId: null } : { shopId: null, workerId: new mongoose.Types.ObjectId(id) };
    const result = await menuSvc.adminEditItem(owner, vertical, code, req.body);
    await require('../audit.service').fromRequest(req, 'admin.store_item_edit', { kind, id }, result.before, { ...result.after, vertical, repairCode: code });
    require('../../notification/notification.service').notify({
      recipient: { kind, id },
      type: 'system_alert',
      title: 'ZappyOne updated your menu',
      body: `We tidied "${result.name}" on your menu. Your prices are unchanged.`,
      data: { vertical, repairCode: code },
    }).catch(() => {});
    res.json(await storeSetup(kind, id));
  } catch (err) { next(err); }
};

module.exports = { storeSetup, route, editRoute, EDIT_BODY, MODEL_ROWS };
