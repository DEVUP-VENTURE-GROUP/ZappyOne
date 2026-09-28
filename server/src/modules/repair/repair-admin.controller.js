const Brand = require('../service/brand.model');
const DeviceModel = require('../service/device-model.model');
const { ProblemCategory, Problem } = require('./models/problem.model');
const { Repair } = require('./models/repair.model');
const { Part, PartQuality, Supplier } = require('./models/part.model');
const { SkillLevel, ProviderCapability } = require('./models/capability.model');
const { ZappyReferencePricing, ProviderPricing } = require('./models/pricing.model');
const { RepairConfig, QAChecklist } = require('./models/config.model');
const {
  ApprovalRequest, CustomerCatalogRequest, RepairWarrantyClaim, ProviderCatalogRequest,
} = require('./models/governance.model');
const { RepairBooking } = require('./models/booking.model');
const { RepairQuote } = require('./models/quote.model');
const {
  ProductType, ProductFamily, ProductSeries, DeviceConfiguration, ModelIdentificationRequest,
} = require('./models/catalog.model');
const eventsService = require('./services/events.service');
const pricingService = require('./services/pricing.service');
const auditService = require('../admin/audit.service');

/**
 * Admin catalog, pricing and approval management.
 *
 * Two behaviours run through every write here:
 *
 *   AUDIT — every mutation records actor, before and after (§36). Business data
 *   changing without a trace is what makes a pricing dispute unresolvable.
 *
 *   VERSIONING — price edits never overwrite. `supersede()` closes the old row
 *   and writes a new one at version+1, so historical bookings keep pointing at
 *   the figure they were actually sold on (§69).
 */

const { verticalOf, verticalFilter } = require('./vertical');
const s3Service = require('../../core/storage/s3');

/** Generic list helper — pagination and search are identical across catalog types. */
function listHandler(Model, { searchFields = [], defaultSort = { createdAt: -1 }, baseFilter = {} } = {}) {
  return async (req, res, next) => {
    try {
      // `vertical` is pulled out of the loose query params deliberately: it must
      // NOT become a plain equality, because mobile rows written before the
      // field existed have no `vertical` at all and a bare match would hide
      // every one of them. It is re-applied below through `verticalFilter`.
      const { q, page = 1, limit = 50, vertical, ...rest } = req.query;

      // Resolved per request so one handler serves every vertical — a baked-in
      // filter is what forced the whole module to be copied per vertical.
      const scope = typeof baseFilter === 'function' ? baseFilter(req) : baseFilter;
      const filter = { ...scope };

      /**
       * Scope to the vertical being administered.
       *
       * This was destructured out above and then never re-applied, so every
       * admin list returned EVERY vertical's rows: the Laptop console showed
       * mobile bookings, and the two consoles reported identical revenue. Any
       * collection that carries a `vertical` is scoped here unless the caller
       * already supplied its own scope for that field.
       */
      if (Model.schema?.path?.('vertical') && !('vertical' in filter)) {
        Object.assign(filter, verticalFilter(verticalOf(req)));
      }

      for (const [k, v] of Object.entries(rest)) {
        if (v === '' || v == null) continue;
        filter[k] = v === 'true' ? true : v === 'false' ? false : v;
      }
      if (q && searchFields.length) {
        const safe = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = searchFields.map((f) => ({ [f]: new RegExp(safe, 'i') }));
      }

      const [items, total] = await Promise.all([
        Model.find(filter).sort(defaultSort).skip((page - 1) * limit).limit(Math.min(Number(limit), 200)).lean(),
        Model.countDocuments(filter),
      ]);
      /*
       * Sign media before it leaves.
       *
       * Every catalog collection stores uploads as S3 KEYS and the bucket is
       * private, so a key reaching an `<img src>` renders nothing — which is
       * indistinguishable from "no image was uploaded". Admins uploaded brand
       * logos, model photos and problem images, saw the local preview, hit
       * refresh and watched them vanish. Nothing was lost; nothing was signed.
       *
       * Done here, once, for every list this generic handler serves rather than
       * at each of the dozens of call sites — which is exactly the arrangement
       * that let it be forgotten everywhere.
       */
      res.json({
        items: await s3Service.signDocsMedia(items),
        total,
        page: Number(page),
        limit: Number(limit),
      });
    } catch (err) { next(err); }
  };
}

/** Generic create/update/archive with audit logging. */
function crudHandlers(Model, entityName, { auditPrefix }) {
  return {
    create: async (req, res, next) => {
      try {
        // Stamp the vertical the admin is working in, when the model has one.
        // Store clean keys, never the signed URLs a read handed back.
        const body = s3Service.normalizeDocMedia({ ...req.body });
        if (Model.schema.path('vertical') && !body.vertical) body.vertical = verticalOf(req);
        if (Model.schema.path('category') && !body.category) body.category = verticalOf(req);
        const doc = await Model.create(body);
        await auditService.fromRequest(req, `${auditPrefix}.create`, { kind: entityName, id: doc._id }, null, doc.toObject());
        res.status(201).json({ item: doc });
      } catch (err) { next(err); }
    },
    update: async (req, res, next) => {
      try {
        const before = await Model.findById(req.params.id).lean();
        if (!before) return res.status(404).json({ error: `${entityName} not found` });
        const patch = s3Service.normalizeDocMedia({ ...req.body });
        const doc = await Model.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true, runValidators: true });
        await auditService.fromRequest(req, `${auditPrefix}.update`, { kind: entityName, id: req.params.id }, before, doc.toObject());
        // Signed so the form redraws with the stored image, not a dead key.
        res.json({ item: await s3Service.signDocMedia(doc.toObject ? doc.toObject() : doc) });
      } catch (err) { next(err); }
    },
    archive: async (req, res, next) => {
      try {
        const before = await Model.findById(req.params.id).lean();
        if (!before) return res.status(404).json({ error: `${entityName} not found` });
        // Archive, never hard-delete — historical bookings still reference these.
        const patch = 'isArchived' in Model.schema.paths
          ? { isArchived: true, isActive: false }
          : { isActive: false };
        const doc = await Model.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true });
        await auditService.fromRequest(req, `${auditPrefix}.archive`, { kind: entityName, id: req.params.id }, before, doc.toObject());
        // Signed so the form redraws with the stored image, not a dead key.
        res.json({ item: await s3Service.signDocMedia(doc.toObject ? doc.toObject() : doc) });
      } catch (err) { next(err); }
    },
  };
}

/* Catalog */

const brands = {
  list: listHandler(Brand, { searchFields: ['name', 'code'], defaultSort: { sortOrder: 1 }, baseFilter: (req) => ({ category: verticalOf(req) }) }),
  ...crudHandlers(Brand, 'brand', { auditPrefix: 'repair.brand' }),
};

const models = {
  list: listHandler(DeviceModel, {
    searchFields: ['name', 'code', 'seriesName'],
    defaultSort: { sortOrder: 1, launchYear: -1 },
    baseFilter: (req) => verticalFilter(verticalOf(req)),
  }),
  ...crudHandlers(DeviceModel, 'device_model', { auditPrefix: 'repair.model' }),
};

const problemCategories = {
  list: listHandler(ProblemCategory, { searchFields: ['name', 'code'], defaultSort: { displayOrder: 1 }, baseFilter: (req) => ({ vertical: verticalOf(req) }) }),
  ...crudHandlers(ProblemCategory, 'problem_category', { auditPrefix: 'repair.problem_category' }),
};

const problems = {
  list: listHandler(Problem, { searchFields: ['name', 'code'], defaultSort: { displayOrder: 1, name: 1 }, baseFilter: (req) => ({ vertical: verticalOf(req) }) }),
  ...crudHandlers(Problem, 'problem', { auditPrefix: 'repair.problem' }),
};

const repairs = {
  list: listHandler(Repair, { searchFields: ['name', 'code'], defaultSort: { displayOrder: 1, name: 1 }, baseFilter: (req) => ({ vertical: verticalOf(req) }) }),
  ...crudHandlers(Repair, 'repair', { auditPrefix: 'repair.repair' }),
};

const parts = {
  list: listHandler(Part, {
    searchFields: ['name', 'sku', 'manufacturerPartNumber'],
    defaultSort: { createdAt: -1 },
    baseFilter: (req) => ({ vertical: verticalOf(req) }),
  }),
  ...crudHandlers(Part, 'part', { auditPrefix: 'repair.part' }),
};

const partQualities = {
  list: listHandler(PartQuality, { searchFields: ['name', 'code'], defaultSort: { rank: -1 } }),
  ...crudHandlers(PartQuality, 'part_quality', { auditPrefix: 'repair.part_quality' }),
};

const suppliers = {
  list: listHandler(Supplier, { searchFields: ['name', 'code'] }),
  ...crudHandlers(Supplier, 'supplier', { auditPrefix: 'repair.supplier' }),
};

const skillLevels = {
  list: listHandler(SkillLevel, { defaultSort: { level: 1 }, baseFilter: (req) => ({ vertical: verticalOf(req) }) }),
  ...crudHandlers(SkillLevel, 'skill_level', { auditPrefix: 'repair.skill_level' }),
};

const qaChecklists = {
  list: listHandler(QAChecklist, { searchFields: ['name', 'code'], baseFilter: (req) => ({ vertical: verticalOf(req) }) }),
  ...crudHandlers(QAChecklist, 'qa_checklist', { auditPrefix: 'repair.qa_checklist' }),
};


/* Deep catalog (§4-§6) */

/**
 * Product type / family / series / configuration are the layers laptops need
 * between a brand and a repairable unit. They use the same generic CRUD as
 * every other catalog resource — a new vertical costs config, not code.
 */
const productTypes = {
  list: listHandler(ProductType, {
    searchFields: ['name', 'code'],
    defaultSort: { displayOrder: 1, name: 1 },
    baseFilter: (req) => ({ vertical: verticalOf(req) }),
  }),
  ...crudHandlers(ProductType, 'product_type', { auditPrefix: 'repair.product_type' }),
};

const productFamilies = {
  list: listHandler(ProductFamily, {
    searchFields: ['name', 'code'],
    defaultSort: { displayOrder: 1, name: 1 },
    baseFilter: (req) => ({ vertical: verticalOf(req) }),
  }),
  ...crudHandlers(ProductFamily, 'product_family', { auditPrefix: 'repair.product_family' }),
};

const productSeries = {
  list: listHandler(ProductSeries, {
    searchFields: ['name', 'code'],
    defaultSort: { displayOrder: 1, name: 1 },
    baseFilter: (req) => ({ vertical: verticalOf(req) }),
  }),
  ...crudHandlers(ProductSeries, 'product_series', { auditPrefix: 'repair.product_series' }),
};

const configurations = {
  list: listHandler(DeviceConfiguration, {
    searchFields: ['name', 'code', 'modelCode', 'partNumber'],
    defaultSort: { modelCode: 1, displayOrder: 1 },
    baseFilter: (req) => ({ vertical: verticalOf(req) }),
  }),
  ...crudHandlers(DeviceConfiguration, 'device_configuration', { auditPrefix: 'repair.configuration' }),
};

/* "I don't know my model" queue (§7) */

const identificationRequests = {
  list: listHandler(ModelIdentificationRequest, {
    searchFields: ['modelText', 'productNumber', 'serialNumber', 'brandName'],
    defaultSort: { createdAt: -1 },
    baseFilter: (req) => ({ vertical: verticalOf(req) }),
  }),

  /**
   * Close one request.
   *
   * Identifying it must point at a real model in the SAME vertical as the
   * request — resolving a laptop enquiry to a phone would send the customer
   * a booking flow for a device they do not own. The customer is notified
   * either way, because the whole queue exists to answer someone who is
   * waiting: telling them we could not identify it is also an answer.
   */
  resolve: async (req, res, next) => {
    try {
      const { status, modelCode, configurationCode, note = '' } = req.body;
      const allowed = ['identified', 'unidentifiable', 'rejected'];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: 'Unknown status', code: 'UNKNOWN_STATUS', allowed });
      }

      const reqDoc = await ModelIdentificationRequest.findById(req.params.id);
      if (!reqDoc) return res.status(404).json({ error: 'Request not found' });
      const before = reqDoc.toObject();

      let model = null;
      let configuration = null;
      if (status === 'identified') {
        if (!modelCode) {
          return res.status(400).json({ error: 'A model is required to mark this identified', code: 'MODEL_REQUIRED' });
        }
        model = await DeviceModel.findOne({
          code: String(modelCode).toLowerCase(),
          isActive: true,
          ...verticalFilter(reqDoc.vertical),
        }).lean();
        if (!model) {
          return res.status(400).json({ error: 'Unknown model for this vertical', code: 'UNKNOWN_MODEL' });
        }
        if (configurationCode) {
          configuration = await DeviceConfiguration.findOne({
            code: String(configurationCode).toLowerCase(),
            modelCode: model.code,
            isActive: true,
          }).lean();
          if (!configuration) {
            return res.status(400).json({ error: 'That configuration does not belong to this model', code: 'UNKNOWN_CONFIGURATION' });
          }
        }
      }

      reqDoc.status = status;
      reqDoc.resolvedModelId = model?._id || null;
      reqDoc.resolvedConfigurationId = configuration?._id || null;
      reqDoc.reviewedById = req.auth.sub;
      reqDoc.reviewedAt = new Date();
      reqDoc.reviewNote = note;
      await reqDoc.save();

      await auditService.fromRequest(req, 'repair.identification.resolve', { kind: 'identification_request', id: reqDoc._id }, before, reqDoc.toObject());

      await eventsService.notify({
        kind: 'user',
        id: reqDoc.userId,
        type: 'system_alert',
        title: model ? 'We identified your device' : 'We could not identify your device',
        body: model
          ? `It looks like a ${model.name}. Tap to continue your booking.`
          : (note || 'Please send a photo of the sticker on the base, or contact support.'),
        deepLink: '/repair',
        data: {
          identificationRequestId: String(reqDoc._id),
          vertical: reqDoc.vertical,
          modelCode: model?.code || null,
          configurationCode: configuration?.code || null,
        },
      });

      res.json({ item: reqDoc, model, configuration });
    } catch (err) { next(err); }
  },
};


/* Provider-proposed catalog additions */

const providerRequests = {
  list: listHandler(ProviderCatalogRequest, {
    searchFields: ['proposedName', 'description'],
    defaultSort: { status: 1, requestCount: -1, createdAt: -1 },
    baseFilter: (req) => ({ vertical: verticalOf(req) }),
  }),

  /**
   * Approving creates the real repair, scoped to the locality it came from.
   *
   * A provider telling us they fix something is a fact about their trade, not a
   * national product decision — so the new repair carries the requester's city
   * until someone widens it deliberately. The requester also gets the
   * capability immediately: they asked because they want the work.
   */
  approve: async (req, res, next) => {
    try {
      const reqDoc = await ProviderCatalogRequest.findById(req.params.id);
      if (!reqDoc) return res.status(404).json({ error: 'Request not found' });
      const before = reqDoc.toObject();

      const {
        code, name, minSkillLevel = 1, pricingMode = 'diagnosis_required',
        allowedServiceModes = ['doorstep', 'workshop'], nationwide = false, note = '',
      } = req.body;
      if (!code) return res.status(400).json({ error: 'A code for the new repair is required', code: 'CODE_REQUIRED' });

      const repairCode = String(code).toLowerCase();
      let repair = await Repair.findOne({ code: repairCode, vertical: reqDoc.vertical });

      if (!repair) {
        repair = await Repair.create({
          code: repairCode,
          name: name || reqDoc.proposedName,
          vertical: reqDoc.vertical,
          minSkillLevel,
          pricingMode,
          allowedServiceModes,
          cityCodes: nationwide || !reqDoc.cityCode ? [] : [reqDoc.cityCode],
          requiresDiagnosis: pricingMode === 'diagnosis_required',
        });
      } else if (!nationwide && reqDoc.cityCode && repair.cityCodes.length && !repair.cityCodes.includes(reqDoc.cityCode)) {
        // Another city asked for the same job — widen it rather than duplicating.
        repair.cityCodes.push(reqDoc.cityCode);
        await repair.save();
      }

      // Hook it under the heading the provider filed it against, so it shows up
      // in the same place for customers and for the next provider.
      if (reqDoc.categoryCode) {
        await Problem.updateMany(
          { vertical: reqDoc.vertical, categoryCode: reqDoc.categoryCode, isActive: true },
          { $addToSet: { candidateRepairCodes: repair.code } },
          { limit: 1 },
        ).catch(() => {});
      }

      const ownerFilter = reqDoc.shopId ? { shopId: reqDoc.shopId } : { workerId: reqDoc.workerId };
      await ProviderCapability.findOneAndUpdate(
        { ...ownerFilter, vertical: reqDoc.vertical, repairCode: repair.code },
        {
          $set: { isActive: true, skillLevel: minSkillLevel, serviceModes: allowedServiceModes },
          $setOnInsert: { providerKind: reqDoc.providerKind },
        },
        { upsert: true },
      );

      reqDoc.status = 'approved';
      reqDoc.resultRepairCode = repair.code;
      reqDoc.reviewedById = req.auth.sub;
      reqDoc.reviewedAt = new Date();
      reqDoc.reviewNote = note;
      await reqDoc.save();

      await auditService.fromRequest(
        req, 'repair.provider_request.approve',
        { kind: 'provider_catalog_request', id: reqDoc._id }, before, reqDoc.toObject(),
      );

      res.json({ item: reqDoc, repair });
    } catch (err) { next(err); }
  },

  reject: async (req, res, next) => {
    try {
      const row = await ProviderCatalogRequest.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            status: 'rejected',
            reviewedById: req.auth.sub,
            reviewedAt: new Date(),
            reviewNote: req.body.note || '',
          },
        },
        { new: true },
      );
      if (!row) return res.status(404).json({ error: 'Request not found' });
      res.json({ item: row });
    } catch (err) { next(err); }
  },
};

/* Reference pricing (versioned) */

const referencePricing = {
  list: listHandler(ZappyReferencePricing, {
    searchFields: ['repairCode', 'modelCode'],
    defaultSort: { updatedAt: -1 },
    baseFilter: { supersededAt: null },
  }),

  create: async (req, res, next) => {
    try {
      const doc = await ZappyReferencePricing.create({ ...req.body, vertical: verticalOf(req), createdBy: req.auth.sub });
      await auditService.fromRequest(req, 'repair.reference_price.create', { kind: 'reference_pricing', id: doc._id }, null, doc.toObject());
      res.status(201).json({ item: doc });
    } catch (err) { next(err); }
  },

  /**
   * Editing a price supersedes the old row rather than mutating it. Bookings
   * hold the version id they were priced on, so history stays truthful (§69).
   */
  update: async (req, res, next) => {
    try {
      const current = await ZappyReferencePricing.findById(req.params.id);
      if (!current || current.supersededAt) {
        return res.status(404).json({ error: 'Active reference price not found' });
      }

      const before = current.toObject();
      current.supersededAt = new Date();
      current.isActive = false;
      await current.save();

      const next_ = await ZappyReferencePricing.create({
        vertical: current.vertical,
        repairCode: current.repairCode,
        brandCode: current.brandCode,
        modelCode: current.modelCode,
        qualityCode: current.qualityCode,
        serviceMode: current.serviceMode,
        cityCode: current.cityCode,
        minPaise: req.body.minPaise ?? current.minPaise,
        recommendedPaise: req.body.recommendedPaise ?? current.recommendedPaise,
        maxPaise: req.body.maxPaise ?? current.maxPaise,
        partCostPaise: req.body.partCostPaise ?? current.partCostPaise,
        labourPaise: req.body.labourPaise ?? current.labourPaise,
        warrantyDays: req.body.warrantyDays ?? current.warrantyDays,
        note: req.body.note || '',
        version: current.version + 1,
        supersedesId: current._id,
        createdBy: req.auth.sub,
      });

      await auditService.fromRequest(req, 'repair.reference_price.update', { kind: 'reference_pricing', id: next_._id }, before, next_.toObject());
      res.json({ item: next_, previousVersion: current.version });
    } catch (err) { next(err); }
  },

  /** Full version chain for one price scope. */
  history: async (req, res, next) => {
    try {
      const rows = await ZappyReferencePricing.find({
        repairCode: req.query.repairCode,
        modelCode: req.query.modelCode || null,
        qualityCode: req.query.qualityCode || null,
      }).sort({ version: -1 }).lean();
      res.json({ versions: rows });
    } catch (err) { next(err); }
  },
};

/* Provider pricing approval (§12, §68) */

const providerPricing = {
  list: listHandler(ProviderPricing, {
    searchFields: ['repairCode', 'modelCode'],
    defaultSort: { createdAt: -1 },
    baseFilter: { supersededAt: null },
  }),

  /** Pending queue, enriched with the reference figure the decision hinges on. */
  pending: async (req, res, next) => {
    try {
      const rows = await ProviderPricing.find({ approvalStatus: 'pending', supersededAt: null })
        .sort({ createdAt: 1 })
        .lean();

      const enriched = await Promise.all(rows.map(async (row) => {
        const ref = await pricingService.resolveReferencePrice({
          repairCode: row.repairCode, brandCode: row.brandCode, modelCode: row.modelCode,
          qualityCode: row.qualityCode, serviceMode: row.serviceMode, cityCode: row.cityCode,
        });
        return {
          ...row,
          reference: ref ? { minPaise: ref.minPaise, recommendedPaise: ref.recommendedPaise, maxPaise: ref.maxPaise } : null,
        };
      }));

      res.json({ items: enriched, total: enriched.length });
    } catch (err) { next(err); }
  },

  decide: async (req, res, next) => {
    try {
      const row = await ProviderPricing.findById(req.params.id);
      if (!row) return res.status(404).json({ error: 'Provider price not found' });

      const before = row.toObject();
      const approve = req.body.decision === 'approve';
      row.approvalStatus = approve ? 'approved' : 'rejected';
      row.reviewedBy = req.auth.sub;
      row.reviewedAt = new Date();
      row.reviewNote = req.body.note || '';
      await row.save();

      await auditService.fromRequest(
        req,
        approve ? 'repair.provider_price.approve' : 'repair.provider_price.reject',
        { kind: 'provider_pricing', id: row._id },
        before,
        row.toObject(),
      );
      res.json({ item: row });
    } catch (err) { next(err); }
  },
};

/* Configuration (§42) */

const config = {
  get: async (req, res, next) => {
    try {
      let cfg = await RepairConfig.findOne({ vertical: verticalOf(req), supersededAt: null }).lean();
      if (!cfg) cfg = (await RepairConfig.create({ vertical: verticalOf(req) })).toObject();
      res.json({ config: cfg });
    } catch (err) { next(err); }
  },

  update: async (req, res, next) => {
    try {
      const current = await RepairConfig.findOne({ vertical: verticalOf(req), supersededAt: null });
      const before = current ? current.toObject() : null;

      if (current) {
        current.supersededAt = new Date();
        current.isActive = false;
        await current.save();
      }

      const next_ = await RepairConfig.create({
        ...(before || {}),
        ...req.body,
        _id: undefined,
        vertical: verticalOf(req),
        version: (before?.version || 0) + 1,
        supersededAt: null,
        isActive: true,
        updatedById: req.auth.sub,
      });

      // Config drives pricing and ranking — a stale cache would serve old rules.
      pricingService.invalidateConfigCache(verticalOf(req));

      await auditService.fromRequest(req, 'repair.config.update', { kind: 'repair_config', id: next_._id }, before, next_.toObject());
      res.json({ config: next_ });
    } catch (err) { next(err); }
  },
};

/* Approval queues + catalog requests */

const approvals = {
  list: listHandler(ApprovalRequest, { searchFields: ['title'], defaultSort: { createdAt: -1 } }),
  decide: async (req, res, next) => {
    try {
      const row = await ApprovalRequest.findById(req.params.id);
      if (!row) return res.status(404).json({ error: 'Approval request not found' });
      const before = row.toObject();
      row.status = req.body.decision === 'approve' ? 'approved' : 'rejected';
      row.reviewedById = req.auth.sub;
      row.reviewedAt = new Date();
      row.decisionReason = req.body.reason || '';
      await row.save();
      await auditService.fromRequest(req, `repair.approval.${row.status}`, { kind: 'approval_request', id: row._id }, before, row.toObject());
      res.json({ item: row });
    } catch (err) { next(err); }
  },
};

const catalogRequests = {
  list: listHandler(CustomerCatalogRequest, {
    searchFields: ['brandName', 'modelName', 'problemText'],
    defaultSort: { requestCount: -1, createdAt: -1 },
  }),

  /**
   * Approving a model request creates the real catalog row, so the customer who
   * asked can immediately book — the request is not just marked "done".
   */
  approve: async (req, res, next) => {
    try {
      const reqDoc = await CustomerCatalogRequest.findById(req.params.id);
      if (!reqDoc) return res.status(404).json({ error: 'Request not found' });
      const before = reqDoc.toObject();

      let createdEntity = null;
      if (reqDoc.kind === 'brand' && req.body.code) {
        createdEntity = await Brand.create({
          code: String(req.body.code).toLowerCase(),
          name: req.body.name || reqDoc.brandName,
          category: verticalOf(req),
        });
        reqDoc.resultEntityType = 'Brand';
      } else if (reqDoc.kind === 'model' && req.body.code && req.body.brandCode) {
        const brand = await Brand.findOne({ code: String(req.body.brandCode).toLowerCase() });
        if (!brand) return res.status(400).json({ error: 'Unknown brandCode for this model' });
        createdEntity = await DeviceModel.create({
          brandId: brand._id,
          brandCode: brand.code,
          name: req.body.name || reqDoc.modelName,
          code: String(req.body.code).toLowerCase(),
          seriesName: req.body.seriesName || '',
          vertical: verticalOf(req),
        });
        reqDoc.resultEntityType = 'DeviceModel';
      }

      reqDoc.status = 'approved';
      reqDoc.reviewedById = req.auth.sub;
      reqDoc.reviewedAt = new Date();
      reqDoc.reviewNote = req.body.note || '';
      if (createdEntity) reqDoc.resultEntityId = createdEntity._id;
      await reqDoc.save();

      await auditService.fromRequest(req, 'repair.catalog_request.approve', { kind: 'catalog_request', id: reqDoc._id }, before, reqDoc.toObject());
      res.json({ item: reqDoc, created: createdEntity });
    } catch (err) { next(err); }
  },

  reject: async (req, res, next) => {
    try {
      const row = await CustomerCatalogRequest.findByIdAndUpdate(
        req.params.id,
        { $set: { status: 'rejected', reviewedById: req.auth.sub, reviewedAt: new Date(), reviewNote: req.body.note || '' } },
        { new: true },
      );
      if (!row) return res.status(404).json({ error: 'Request not found' });
      res.json({ item: row });
    } catch (err) { next(err); }
  },
};

/* Operations */

const operations = {
  bookings: listHandler(RepairBooking, { searchFields: ['reference'], defaultSort: { createdAt: -1 } }),
  quotes: listHandler(RepairQuote, { defaultSort: { createdAt: -1 } }),
  warrantyClaims: listHandler(RepairWarrantyClaim, { defaultSort: { createdAt: -1 } }),
  capabilities: listHandler(ProviderCapability, { defaultSort: { createdAt: -1 } }),

  /** Dashboard counters (§34) — one aggregation rather than a dozen queries. */
  dashboard: async (req, res, next) => {
    try {
      /**
       * EVERY counter here is scoped to one vertical.
       *
       * None of them were, so the Mobile and Laptop consoles displayed the same
       * revenue, the same booking counts and the same queues — the sum of both
       * verticals, shown twice as if each belonged to one. An operator reading
       * either screen was told a number that was not true of it.
       *
       * `verticalFilter` rather than `{ vertical }` because mobile predates the
       * field: a bare equality silently drops every legacy mobile booking and
       * reports mobile revenue as near zero.
       */
      const scope = verticalFilter(verticalOf(req));

      const [byStatus, revenue, pendingPrices, pendingRequests, openClaims] = await Promise.all([
        RepairBooking.aggregate([
          { $match: scope },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        RepairBooking.aggregate([
          { $match: { ...scope, status: 'COMPLETED' } },
          { $group: { _id: null, revenuePaise: { $sum: '$priceSnapshot.totalPaise' }, commissionPaise: { $sum: '$priceSnapshot.commissionPaise' }, count: { $sum: 1 } } },
        ]),
        ProviderPricing.countDocuments({ ...scope, approvalStatus: 'pending', supersededAt: null }),
        CustomerCatalogRequest.countDocuments({ ...scope, status: 'pending' }),
        RepairWarrantyClaim.countDocuments({ status: { $in: ['submitted', 'under_review'] } }),
      ]);

      res.json({
        bookingsByStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])),
        completed: revenue[0]?.count || 0,
        revenuePaise: revenue[0]?.revenuePaise || 0,
        commissionPaise: revenue[0]?.commissionPaise || 0,
        queues: { pendingProviderPrices: pendingPrices, pendingCatalogRequests: pendingRequests, openWarrantyClaims: openClaims },
      });
    } catch (err) { next(err); }
  },
};

module.exports = {
  brands, models, problemCategories, problems, repairs,
  productTypes, productFamilies, productSeries, configurations, identificationRequests,
  parts, partQualities, suppliers, skillLevels, qaChecklists,
  referencePricing, providerPricing, config,
  approvals, catalogRequests, providerRequests, operations,
};
