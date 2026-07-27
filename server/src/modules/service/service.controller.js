const ServiceCatalog = require('./service-catalog.model');
const Brand          = require('./brand.model');
const DeviceModel    = require('./device-model.model');
const ServiceVariant = require('./service-variant.model');
const DiagnosticFlow = require('./diagnostic-flow.model');
const DemandEvent    = require('./demand-event.model');
const Order          = require('../order/order.model');
const { redis }      = require('../../config/redis');
const invoiceService = require('./invoice.service');
const { escapeRegex } = require('../../utils/text');

// Public list endpoints are unauthenticated — cap them so one call can't pull the
// entire (post-seed, thousands-of-rows) model/variant tables.
const PUBLIC_LIST_LIMIT = 500;

const CATALOG_CACHE_KEY = 'catalog:services:public';
const CATALOG_CACHE_TTL = 120; // seconds — busts immediately on admin edit anyway

async function bustCatalogCache() {
  try { await redis.del(CATALOG_CACHE_KEY); } catch { /* non-blocking */ }
}

/* ── Public Catalog APIs ────────────────────────────────────────── */

async function listServices(req, res, next) {
  try {
    try {
      const cached = await redis.get(CATALOG_CACHE_KEY);
      if (cached) {
        res.set('Cache-Control', 'public, max-age=60');
        return res.type('application/json').send(cached);
      }
    } catch { /* redis down — fall through to DB */ }

    const services = await ServiceCatalog.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
    const payload = JSON.stringify({ services });
    redis.set(CATALOG_CACHE_KEY, payload, 'EX', CATALOG_CACHE_TTL).catch(() => {});
    res.set('Cache-Control', 'public, max-age=60');
    res.type('application/json').send(payload);
  } catch (err) { next(err); }
}

async function getService(req, res, next) {
  try {
    const service = await ServiceCatalog.findOne({ code: req.params.code.toLowerCase(), isActive: true }).lean();
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json({ service });
  } catch (err) { next(err); }
}

/* ── Dynamic Brands & Models APIs ── */

async function listBrands(req, res, next) {
  try {
    // Coerce to string — an object query (?category[$ne]=x) would otherwise reach
    // Mongo as an operator.
    const category = String(req.query.category || 'mobile');
    const brands = await Brand.find({ category, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
    res.json({ brands });
  } catch (err) { next(err); }
}

async function listModels(req, res, next) {
  try {
    const { brandCode, search } = req.query;
    const filter = { isActive: true };
    if (brandCode) filter.brandCode = String(brandCode).toLowerCase();
    // escapeRegex: `search` is raw user input — a bare $regex here is a ReDoS +
    // NoSQL-injection hole.
    if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };

    const models = await DeviceModel.find(filter)
      .sort({ seriesName: 1, launchYear: -1, name: 1 })
      .limit(PUBLIC_LIST_LIMIT)
      .lean();
    res.json({ models });
  } catch (err) { next(err); }
}

async function listVariants(req, res, next) {
  try {
    const { serviceCode, modelCode } = req.query;
    const filter = { isActive: true };
    if (serviceCode) filter.serviceCode = String(serviceCode).toLowerCase();
    if (modelCode)   filter.modelCode   = String(modelCode).toLowerCase();

    const variants = await ServiceVariant.find(filter).limit(PUBLIC_LIST_LIMIT).lean();
    res.json({ variants });
  } catch (err) { next(err); }
}

async function getDiagnosticFlow(req, res, next) {
  try {
    const { code = 'mobile_diagnostic' } = req.params;
    const flow = await DiagnosticFlow.findOne({ code: code.toLowerCase(), isActive: true }).lean();
    if (!flow) return res.status(404).json({ error: 'Diagnostic flow not found' });
    res.json({ flow });
  } catch (err) { next(err); }
}

async function recordDemandEvent(req, res, next) {
  try {
    const { cityCode, pincode, category, brandName, modelName, requestedService, reason, customerNote } = req.body;
    const userId = req.auth?.sub || null;

    const event = await DemandEvent.create({
      userId, cityCode: cityCode || 'general', pincode: pincode || '',
      category: category || 'mobile', brandName: brandName || '',
      modelName: modelName || '', requestedService: requestedService || '',
      reason: reason || 'no_part', customerNote: customerNote || '',
    });
    res.json({ success: true, eventId: event._id });
  } catch (err) { next(err); }
}

async function getInvoice(req, res, next) {
  try {
    const order = await Order.findById(req.params.orderId).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const isOwner = String(order.userId) === String(req.auth.sub);
    if (!isOwner && req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const data = await invoiceService.getInvoiceData(req.params.orderId);
    if (req.query.format === 'json') return res.json({ invoice: data });
    res.set('Content-Type', 'text/html');
    res.send(invoiceService.renderHtml(data));
  } catch (err) { next(err); }
}

async function getWorkerHeatmap(req, res, next) {
  try {
    const { lat, lng, radiusKm = 10 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng query params required' });
    const cells = await scanDemandCells(Number(lat), Number(lng), Number(radiusKm));
    res.json({ cells, generatedAt: new Date() });
  } catch (err) { next(err); }
}

async function scanDemandCells(lat, lng, radiusKm) {
  const stream = redis.scanStream({ match: 'demand:*', count: 200 });
  const cells = [];
  for await (const batch of stream) {
    for (const key of batch) {
      const [bLat, bLng] = key.replace('demand:', '').split(':').map(Number);
      const dist = haversineKm({ lat, lng }, { lat: bLat, lng: bLng });
      if (dist > radiusKm) continue;
      const demand = Number(await redis.get(key)) || 0;
      const supply = Number(await redis.scard(`supply:${bLat.toFixed(2)}:${bLng.toFixed(2)}`)) || 0;
      cells.push({
        lat: bLat, lng: bLng, demand, supply,
        attractivenessScore: supply === 0 ? demand * 2 : demand / Math.max(1, supply),
      });
    }
  }
  cells.sort((a, b) => b.attractivenessScore - a.attractivenessScore);
  return cells;
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* ── Admin Controllers ────────────────────────────────────────── */

async function adminListServices(req, res, next) {
  try {
    const services = await ServiceCatalog.find({}).sort({ category: 1, sortOrder: 1, name: 1 }).lean();
    res.json({ services });
  } catch (err) { next(err); }
}

async function adminUpdateService(req, res, next) {
  try {
    const { code } = req.params;
    const {
      name, description, shortDescription,
      priceRangeMinRs, priceRangeMaxRs, inspectionFeeRs,
      estimatedDurationMinutes, imageUrl, coverImage, galleryImages,
      isActive, isFeatured,
      category, subcategory, sortOrder,
    } = req.body;

    const update = {};
    if (name                     != null) update.name = name;
    if (description              != null) update.description = description;
    if (shortDescription         != null) update.shortDescription = shortDescription;
    if (imageUrl                 != null) update.imageUrl = imageUrl;
    if (coverImage               != null) update.coverImage = coverImage;
    if (Array.isArray(galleryImages)) update.galleryImages = galleryImages;

    if (priceRangeMinRs          != null) update.priceRangeMinPaise = Math.round(Number(priceRangeMinRs) * 100);
    if (priceRangeMaxRs          != null) update.priceRangeMaxPaise = Math.round(Number(priceRangeMaxRs) * 100);
    if (inspectionFeeRs          != null) update.inspectionFeePaise = Math.round(Number(inspectionFeeRs) * 100);

    if (estimatedDurationMinutes != null) update.estimatedDurationMinutes = Number(estimatedDurationMinutes);
    if (isActive                 != null) update.isActive = Boolean(isActive);
    if (isFeatured               != null) update.isFeatured = Boolean(isFeatured);

    // Category reassignment (#5/#18) — lets an admin move a mis-filed service (e.g.
    // Fuel Delivery wrongly under Pets) to the right category without a code change.
    if (category                 != null) update.category = String(category).toLowerCase();
    if (subcategory              != null) update.subcategory = String(subcategory);
    if (sortOrder                != null) update.sortOrder = Number(sortOrder);

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const svc = await ServiceCatalog.findOneAndUpdate(
      { code: code.toLowerCase() },
      { $set: update },
      { new: true }
    ).lean();
    if (!svc) return res.status(404).json({ error: 'Service not found' });
    await bustCatalogCache();
    res.json({ service: svc });
  } catch (err) { next(err); }
}

async function adminListBrands(req, res, next) {
  try {
    const brands = await Brand.find({}).sort({ category: 1, sortOrder: 1, name: 1 }).lean();
    res.json({ brands });
  } catch (err) { next(err); }
}

async function adminCreateBrand(req, res, next) {
  try {
    const { code, name, logoUrl, category = 'mobile', sortOrder = 0 } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code and name required' });
    const brand = await Brand.findOneAndUpdate(
      { code: code.toLowerCase() },
      { code: code.toLowerCase(), name, logoUrl: logoUrl || '', category, sortOrder },
      { upsert: true, new: true }
    ).lean();
    res.json({ brand });
  } catch (err) { next(err); }
}

async function adminListModels(req, res, next) {
  try {
    const { brandCode } = req.query;
    const filter = {};
    if (brandCode) filter.brandCode = brandCode.toLowerCase();
    const models = await DeviceModel.find(filter).sort({ brandCode: 1, seriesName: 1, name: 1 }).lean();
    res.json({ models });
  } catch (err) { next(err); }
}

async function adminCreateModel(req, res, next) {
  try {
    const { brandCode, seriesName, name, code, modelNumbers, storageVariants, launchYear } = req.body;
    if (!brandCode || !name || !code) return res.status(400).json({ error: 'brandCode, name, and code required' });
    const brand = await Brand.findOne({ code: brandCode.toLowerCase() });
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const model = await DeviceModel.findOneAndUpdate(
      { code: code.toLowerCase() },
      {
        brandId: brand._id, brandCode: brandCode.toLowerCase(),
        seriesName: seriesName || '', name, code: code.toLowerCase(),
        modelNumbers: modelNumbers || [], storageVariants: storageVariants || [],
        launchYear: launchYear || new Date().getFullYear(),
      },
      { upsert: true, new: true }
    ).lean();
    res.json({ model });
  } catch (err) { next(err); }
}

async function adminImportModelsBulk(req, res, next) {
  try {
    const { rows } = req.body; // Array of { brandCode, seriesName, name, code, serviceCode, qualityTier, partPriceRs, laborPriceRs, warrantyDays }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array required for bulk import' });
    }

    let modelsCreated = 0;
    let variantsCreated = 0;

    for (const r of rows) {
      const brandCode = (r.brandCode || 'other').toLowerCase();
      const modelCode = (r.code || `${brandCode}-${(r.name || 'model').replace(/[^a-z0-9]/gi, '-')}`).toLowerCase();
      const serviceCode = (r.serviceCode || 'screen_replacement').toLowerCase();
      const qualityTier = r.qualityTier || 'Compatible';

      let brand = await Brand.findOne({ code: brandCode });
      if (!brand) {
        brand = await Brand.create({ code: brandCode, name: r.brandName || brandCode.toUpperCase(), category: 'mobile' });
      }

      let model = await DeviceModel.findOne({ code: modelCode });
      if (!model) {
        model = await DeviceModel.create({
          brandId: brand._id, brandCode, seriesName: r.seriesName || '',
          name: r.name || r.modelName || 'Model', code: modelCode,
          launchYear: Number(r.launchYear) || new Date().getFullYear(),
        });
        modelsCreated++;
      }

      const partPricePaise  = Math.round((Number(r.partPriceRs) || 0) * 100);
      const laborPricePaise = Math.round((Number(r.laborPriceRs) || 0) * 100);

      await ServiceVariant.findOneAndUpdate(
        { serviceCode, modelCode, qualityTier },
        {
          serviceCode, brandCode, modelId: model._id, modelCode, qualityTier,
          partName: r.partName || `${qualityTier} Part`,
          partPricePaise, laborPricePaise, totalPricePaise: partPricePaise + laborPricePaise,
          warrantyDays: Number(r.warrantyDays) || 30, isActive: true,
        },
        { upsert: true, new: true }
      );
      variantsCreated++;
    }

    res.json({ success: true, modelsCreated, variantsCreated, totalProcessed: rows.length });
  } catch (err) { next(err); }
}

async function adminListVariants(req, res, next) {
  try {
    const { modelCode, serviceCode } = req.query;
    const filter = {};
    if (modelCode)   filter.modelCode   = modelCode.toLowerCase();
    if (serviceCode) filter.serviceCode = serviceCode.toLowerCase();

    const variants = await ServiceVariant.find(filter).lean();
    res.json({ variants });
  } catch (err) { next(err); }
}

async function adminCreateVariant(req, res, next) {
  try {
    const { serviceCode, brandCode, modelCode, qualityTier = 'Compatible', partName, partPriceRs, laborPriceRs, warrantyDays } = req.body;
    if (!serviceCode || !modelCode) return res.status(400).json({ error: 'serviceCode and modelCode required' });

    const model = await DeviceModel.findOne({ code: modelCode.toLowerCase() });
    if (!model) return res.status(404).json({ error: 'Device model not found' });

    const partPricePaise  = Math.round((Number(partPriceRs) || 0) * 100);
    const laborPricePaise = Math.round((Number(laborPriceRs) || 0) * 100);

    const variant = await ServiceVariant.findOneAndUpdate(
      { serviceCode: serviceCode.toLowerCase(), modelCode: modelCode.toLowerCase(), qualityTier },
      {
        serviceCode: serviceCode.toLowerCase(), brandCode: (brandCode || model.brandCode).toLowerCase(),
        modelId: model._id, modelCode: modelCode.toLowerCase(), qualityTier,
        partName: partName || `${qualityTier} Part`, partPricePaise, laborPricePaise,
        totalPricePaise: partPricePaise + laborPricePaise,
        warrantyDays: Number(warrantyDays) || 30, isActive: true,
      },
      { upsert: true, new: true }
    ).lean();

    res.json({ variant });
  } catch (err) { next(err); }
}

async function adminGetDemandEvents(req, res, next) {
  try {
    const { limit = 50, cityCode } = req.query;
    const filter = {};
    if (cityCode) filter.cityCode = cityCode;
    const events = await DemandEvent.find(filter).sort({ createdAt: -1 }).limit(Number(limit)).lean();
    res.json({ events });
  } catch (err) { next(err); }
}

async function adminServiceActiveOrderCount(req, res, next) {
  try {
    const count = await Order.countDocuments({
      service: req.params.code.toLowerCase(),
      status: { $in: ['created', 'searching', 'assigned', 'on_the_way', 'arrived', 'in_progress'] },
    });
    res.json({ code: req.params.code, activeOrderCount: count });
  } catch (err) { next(err); }
}

async function adminCreateService(req, res, next) {
  try {
    const {
      code, name, category, subcategory = '',
      shortDescription = '', description = '',
      priceRangeMinRs, priceRangeMaxRs, inspectionFeeRs,
      estimatedDurationMinutes = 30, requiredSkills,
      icon = '', imageUrl = '', isActive = true, isFeatured = false, sortOrder = 0,
    } = req.body;
    if (!code || !name || !category) {
      return res.status(400).json({ error: 'code, name and category are required' });
    }
    if (priceRangeMinRs == null || priceRangeMaxRs == null) {
      return res.status(400).json({ error: 'priceRangeMinRs and priceRangeMaxRs are required' });
    }
    const codeLc = String(code).toLowerCase().trim();
    const existing = await ServiceCatalog.findOne({ code: codeLc }).lean();
    if (existing) return res.status(409).json({ error: 'A service with this code already exists' });

    const svc = await ServiceCatalog.create({
      code: codeLc,
      name,
      category: String(category).toLowerCase(),
      subcategory: String(subcategory),
      shortDescription, description,
      icon, imageUrl,
      estimatedDurationMinutes: Number(estimatedDurationMinutes) || 30,
      priceRangeMinPaise: Math.round(Number(priceRangeMinRs) * 100),
      priceRangeMaxPaise: Math.round(Number(priceRangeMaxRs) * 100),
      ...(inspectionFeeRs != null && { inspectionFeePaise: Math.round(Number(inspectionFeeRs) * 100) }),
      // Default the dispatch skill to the service code if the admin didn't specify one.
      requiredSkills: Array.isArray(requiredSkills) && requiredSkills.length ? requiredSkills : [codeLc],
      isActive: Boolean(isActive),
      isFeatured: Boolean(isFeatured),
      sortOrder: Number(sortOrder) || 0,
    });
    await bustCatalogCache();
    res.status(201).json({ service: svc.toObject() });
  } catch (err) { next(err); }
}

async function adminDeleteService(req, res, next) {
  try {
    const code = String(req.params.code).toLowerCase();
    // Block only on in-flight orders — completed orders snapshot the code as a string
    // and don't populate from the catalog, so deleting won't corrupt history.
    const activeCount = await Order.countDocuments({
      service: code,
      status: { $in: ['created', 'searching', 'assigned', 'on_the_way', 'arrived', 'in_progress'] },
    });
    if (activeCount > 0) {
      return res.status(409).json({
        error: `Cannot delete: ${activeCount} active order(s) use this service. Disable it instead.`,
        activeOrderCount: activeCount,
      });
    }
    const svc = await ServiceCatalog.findOneAndDelete({ code });
    if (!svc) return res.status(404).json({ error: 'Service not found' });
    await bustCatalogCache();
    res.json({ ok: true, code });
  } catch (err) { next(err); }
}

module.exports = {
  listServices, getService, listBrands, listModels, listVariants,
  getDiagnosticFlow, recordDemandEvent, getInvoice, getWorkerHeatmap,
  adminListServices, adminUpdateService, adminCreateService, adminDeleteService,
  adminListBrands, adminCreateBrand,
  adminListModels, adminCreateModel, adminImportModelsBulk, adminListVariants,
  adminCreateVariant, adminGetDemandEvents, adminServiceActiveOrderCount,
};
