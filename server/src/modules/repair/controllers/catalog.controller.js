const Brand = require('../../service/brand.model');
const DeviceModel = require('../../service/device-model.model');
const { ProblemCategory, Problem } = require('../models/problem.model');
const { Repair } = require('../models/repair.model');
const { PartQuality } = require('../models/part.model');
const { CustomerCatalogRequest } = require('../models/governance.model');
const { ProductType, ProductFamily, ProductSeries, DeviceConfiguration, ModelIdentificationRequest } = require('../models/catalog.model');
const s3Service = require('../../../core/storage/s3');
const diagnosticService = require('../services/diagnostic.service');
const matchingService = require('../services/matching.service');
const pricingService = require('../services/pricing.service');
const { verticalOf, verticalFilter } = require('../vertical');
const { gatewayReady } = require('../../payment/payables');

/**
 * Repair catalog, as the customer browses it: brands, models, problems,
 * repairs, diagnostics, price preview and nearby providers.
 *
 * Everything is read straight from the database: there is no hardcoded brand,
 * model, problem or price here. Admin edits show on the next request.
 */

/* Catalog */

async function listBrands(req, res, next) {
  try {
    const cfg = await pricingService.getConfig(verticalOf(req));
    const rows = await Brand.find({ category: verticalOf(req), isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .select('code name logoUrl sortOrder')
      .lean();

    // Logos are stored as private S3 keys; unsigned they render as nothing,
    // which reads to everyone as "this brand has no logo".
    const brands = await s3Service.signDocsMedia(rows);

    // "Popular first" is a presentation rule driven by config, not a hardcoded list.
    res.json({
      brands,
      popularLimit: cfg.popularBrandLimit,
      popular: brands.slice(0, cfg.popularBrandLimit),
    });
  } catch (err) { next(err); }
}

function rx(term) {
  return new RegExp(String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

async function listModels(req, res, next) {
  try {
    const { brandCode } = req.params;
    const {
      q, productTypeCode, familyCode, seriesCode, page = 1, limit = 50,
    } = req.query;

    const filter = {
      brandCode: String(brandCode).toLowerCase(),
      isActive: true,
      ...verticalFilter(verticalOf(req)),
    };
    if (productTypeCode) filter.productTypeCode = String(productTypeCode).toLowerCase();
    if (familyCode) filter.familyCode = String(familyCode).toLowerCase();
    if (seriesCode) filter.seriesCode = String(seriesCode).toLowerCase();

    /**
     * Laptop owners read an identifier off the sticker far more reliably than
     * they recall a marketing name, so the search covers the manufacturer's
     * own numbers as well as the name. `$and` keeps this clause from
     * colliding with the vertical filter's `$or`.
     */
    if (q) {
      const pattern = rx(q);
      filter.$and = [{
        $or: [
          { name: pattern },
          { modelNumbers: pattern },
          { productNumbers: pattern },
        ],
      }];
    }

    const [models, total] = await Promise.all([
      DeviceModel.find(filter)
        .sort({ sortOrder: 1, launchYear: -1, name: 1 })
        .skip((page - 1) * limit)
        .limit(Math.min(Number(limit), 100))
        .select('code name seriesName seriesCode familyCode productTypeCode storageVariants ramVariants modelNumbers productNumbers imageUrl launchYear')
        .lean(),
      DeviceModel.countDocuments(filter),
    ]);

    res.json({ models: await s3Service.signDocsMedia(models), total, page: Number(page) });
  } catch (err) { next(err); }
}

/* Deep catalog (§4-§6) */

/**
 * The layers between a brand and a repairable unit.
 *
 * Mobile leaves these empty and the picker collapses to Brand → Model, which
 * is how mobile already works. Laptops populate them because "HP Pavilion" is
 * not a machine — it is several hundred machines whose panels, batteries and
 * boards do not interchange.
 */
async function listProductTypes(req, res, next) {
  try {
    const productTypes = await ProductType.find({
      vertical: verticalOf(req), isActive: true, isArchived: false,
    }).sort({ displayOrder: 1, name: 1 }).lean();

    const signedTypes = await s3Service.signDocsMedia(productTypes);
    res.json({ productTypes: signedTypes, popular: signedTypes.filter((t) => t.isPopular) });
  } catch (err) { next(err); }
}

async function listFamilies(req, res, next) {
  try {
    const filter = {
      vertical: verticalOf(req),
      brandCode: String(req.params.brandCode).toLowerCase(),
      isActive: true,
      isArchived: false,
    };
    if (req.query.productTypeCode) filter.productTypeCode = String(req.query.productTypeCode).toLowerCase();

    const families = await ProductFamily.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
    const signedFamilies = await s3Service.signDocsMedia(families);
    res.json({ families: signedFamilies, popular: signedFamilies.filter((f) => f.isPopular) });
  } catch (err) { next(err); }
}

async function listSeries(req, res, next) {
  try {
    const filter = {
      vertical: verticalOf(req),
      brandCode: String(req.params.brandCode).toLowerCase(),
      isActive: true,
      isArchived: false,
    };
    if (req.query.familyCode) filter.familyCode = String(req.query.familyCode).toLowerCase();

    const series = await ProductSeries.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
    res.json({ series: await s3Service.signDocsMedia(series) });
  } catch (err) { next(err); }
}

/**
 * The exact builds of one model.
 *
 * An empty list is a legitimate answer, not a failure: it means the model has
 * a single build, or none has been catalogued yet. The customer then proceeds
 * on the model alone rather than being blocked by a picker with nothing in it.
 */
async function listConfigurations(req, res, next) {
  try {
    const configurations = await DeviceConfiguration.find({
      vertical: verticalOf(req),
      modelCode: String(req.params.modelCode).toLowerCase(),
      isActive: true,
      isArchived: false,
    }).sort({ displayOrder: 1, name: 1 }).lean();

    res.json({ configurations: await s3Service.signDocsMedia(configurations) });
  } catch (err) { next(err); }
}

/* "I don't know my model" (§7) */

/**
 * Capture what the customer CAN tell us and let a human finish the job.
 *
 * The alternative — inferring a model from a partial description — produces
 * the wrong part order, which costs a visit, a part and the customer's trust.
 * Asking is cheaper than any of those.
 */
async function submitIdentificationRequest(req, res, next) {
  try {
    const { brandCode, brandName, modelText, productNumber, serialNumber, notes, imageUrls } = req.body;

    if (!modelText && !productNumber && !serialNumber && !(imageUrls || []).length) {
      return res.status(400).json({
        error: 'Tell us anything you can — a model name, the number on the sticker, or a photo of it.',
        code: 'IDENTIFICATION_EMPTY',
      });
    }

    const request = await ModelIdentificationRequest.create({
      vertical: verticalOf(req),
      userId: req.auth.sub,
      brandCode: brandCode || '',
      brandName: brandName || '',
      modelText: modelText || '',
      productNumber: productNumber || '',
      serialNumber: serialNumber || '',
      notes: notes || '',
      imageUrls: imageUrls || [],
    });

    return res.status(201).json({ request });
  } catch (err) { return next(err); }
}

/** The caller's own requests — scoped by token, never by anything they send. */
async function listMyIdentificationRequests(req, res, next) {
  try {
    const requests = await ModelIdentificationRequest.find({
      userId: req.auth.sub, vertical: verticalOf(req),
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('resolvedModelId', 'code name imageUrl')
      .populate('resolvedConfigurationId', 'code name')
      .lean();

    res.json({ requests });
  } catch (err) { next(err); }
}

async function listProblems(req, res, next) {
  try {
    const { modelCode, productTypeCode, fuelType } = req.query;

    const categories = await ProblemCategory.find({ vertical: verticalOf(req), isActive: true, isArchived: false })
      .sort({ displayOrder: 1 })
      .lean();

    // Unpublishing a category hides its problems everywhere, including "popular".
    const filter = {
      vertical: verticalOf(req), isActive: true, isArchived: false,
      categoryCode: { $in: categories.map((c) => c.code) },
    };

    /**
     * Hide symptoms that cannot happen to THIS product, rather than confusing
     * the customer with impossibilities. Two independent scopes:
     *
     *   model  — "green line" is an OLED-era fault, not a universal one.
     *   type   — a scooter has no chain, a motorcycle no CVT belt, an electric
     *            neither a spark plug nor a gearbox.
     *   fuel   — an EV has no spark plug, a petrol car no CNG regulator, and
     *            only a diesel has a DPF. Independent of the body type.
     *
     * Collected into `$and` rather than assigned to `filter.$or` twice: the
     * second assignment would silently replace the first and quietly widen the
     * list back out.
     */
    const scopes = [];
    if (modelCode) {
      scopes.push({ $or: [{ appliesToModelCodes: { $size: 0 } }, { appliesToModelCodes: modelCode }] });
    }
    if (productTypeCode) {
      scopes.push({
        $or: [
          { appliesToProductTypeCodes: { $size: 0 } },
          { appliesToProductTypeCodes: String(productTypeCode).toLowerCase() },
        ],
      });
    }
    if (fuelType) {
      scopes.push({
        $or: [
          { appliesToFuelTypes: { $size: 0 } },
          { appliesToFuelTypes: String(fuelType).toLowerCase() },
        ],
      });
    }
    if (scopes.length) filter.$and = scopes;
    const rows = await Problem.find(filter).sort({ displayOrder: 1, name: 1 }).lean();

    /*
     * Media is signed AND forwarded.
     *
     * Two separate reasons the pictures never appeared: the keys were served
     * unsigned (so unloadable), and this shaper dropped `imageUrl`/`videoUrl`
     * from the payload altogether — so even a correct URL would never have
     * reached the screen. An admin uploading an illustration for a symptom had
     * no way to ever see it.
     */
    const problems = await s3Service.signDocsMedia(rows);
    const signedCategories = await s3Service.signDocsMedia(categories);

    const byCategory = signedCategories.map((c) => ({
      code: c.code,
      name: c.name,
      icon: c.icon,
      imageUrl: c.imageUrl || '',
      problems: problems
        .filter((p) => p.categoryCode === c.code)
        .map((p) => ({
          code: p.code,
          name: p.name,
          severity: p.severity,
          requiresDiagnosis: p.requiresDiagnosis,
          isPopular: p.isPopular,
          imageUrl: p.imageUrl || '',
          videoUrl: p.videoUrl || '',
        })),
    })).filter((c) => c.problems.length > 0);

    res.json({ categories: byCategory, popular: problems.filter((p) => p.isPopular).slice(0, 8) });
  } catch (err) { next(err); }
}

async function listRepairs(req, res, next) {
  try {
    // Add-ons are bought alongside a repair, never returned as one — they would
    // otherwise appear as candidate answers to the customer's problem.
    const filter = {
      vertical: verticalOf(req), isActive: true, isArchived: false, isAddOn: { $ne: true },
    };
    if (req.query.problemCode) filter.problemCodes = req.query.problemCode;
    const repairs = await Repair.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
    res.json({ repairs });
  } catch (err) { next(err); }
}

/**
 * Add-ons offerable alongside a chosen repair, priced by the chosen provider.
 *
 * Priced here rather than on the client so the number the customer ticks is
 * the number the server will charge — and so an add-on the provider has not
 * priced is simply not offered, instead of being offered and then silently
 * dropped at booking.
 */
async function listAddOns(req, res, next) {
  try {
    const vertical = verticalOf(req);
    const { repairCode = null, brandCode, modelCode, shopId, workerId, qualityCode } = req.query;

    const addOns = await Repair.find({
      vertical, isActive: true, isArchived: false, isAddOn: true,
    }).sort({ displayOrder: 1, name: 1 }).lean();

    const eligible = addOns.filter((a) => !(a.eligibleForRepairCodes || []).length
      || a.eligibleForRepairCodes.includes(repairCode));

    const ctx = {
      brandCode, modelCode, qualityCode: qualityCode || null,
      serviceMode: req.query.serviceMode || 'doorstep',
      cityCode: req.query.cityCode || null,
    };

    const priced = [];
    for (const a of eligible) {
      const lineCtx = { ...ctx, repairCode: a.code };
      const provider = (shopId || workerId)
        ? await pricingService.resolveProviderPrice(lineCtx, { shopId, workerId })
        : null;
      const reference = provider ? null : await pricingService.resolveReferencePrice(lineCtx);
      const totalPaise = provider?.totalPaise ?? reference?.recommendedPaise ?? null;
      if (totalPaise == null) continue;

      priced.push({
        repairCode: a.code,
        name: a.name,
        description: a.description || '',
        totalPaise,
        isEstimate: !provider,
        estimatedDurationMin: a.estimatedDurationMin || 0,
        warrantyDays: a.warrantyDays || 0,
      });
    }

    res.json({ addOns: priced });
  } catch (err) { next(err); }
}

async function listPartQualities(req, res, next) {
  try {
    const qualities = await PartQuality.find({ isActive: true }).sort({ rank: -1 }).lean();
    res.json({ qualities });
  } catch (err) { next(err); }
}

/* Diagnostics */

async function getDiagnosticFlow(req, res, next) {
  try {
    const { problemCode } = req.params;
    const { problem, flow } = await diagnosticService.getFlowForProblem(problemCode, verticalOf(req));
    if (!problem) return res.status(404).json({ error: 'Unknown problem', code: 'UNKNOWN_PROBLEM' });

    res.json({
      problem: { code: problem.code, name: problem.name, requiresDiagnosis: problem.requiresDiagnosis },
      flow: flow ? { code: flow.code, title: flow.title, description: flow.description } : null,
      questions: flow ? diagnosticService.nextQuestions(flow, {}) : [],
    });
  } catch (err) { next(err); }
}

/**
 * Submit answers and get the next question, or the resolved recommendation.
 * Stateless on purpose — the client holds the answers, so a dropped connection
 * mid-questionnaire loses nothing and no server session has to be reaped.
 */
async function submitDiagnostic(req, res, next) {
  try {
    const { problemCode } = req.params;
    const answers = req.body.answers || {};

    const vertical = verticalOf(req);
    const { problem, flow } = await diagnosticService.getFlowForProblem(problemCode, vertical);
    if (!problem) return res.status(404).json({ error: 'Unknown problem', code: 'UNKNOWN_PROBLEM' });

    const nextQuestion = flow ? diagnosticService.firstUnanswered(flow, answers) : null;
    const result = await diagnosticService.resolve({ problemCode, flow, answers, vertical });

    res.json({
      nextQuestion,
      complete: !nextQuestion,
      diagnosis: result,
    });
  } catch (err) { next(err); }
}

/* Price preview + providers */

/**
 * Indicative price BEFORE a provider is chosen. Explicitly flagged as an
 * estimate so the UI cannot present it as a firm figure (§53).
 */
async function previewPrice(req, res, next) {
  try {
    const { repairCode, brandCode, modelCode, qualityCode, serviceMode = 'doorstep', cityCode } = req.query;
    if (!repairCode) return res.status(400).json({ error: 'repairCode is required', code: 'REPAIR_REQUIRED' });

    const ctx = {
      vertical: verticalOf(req),
      repairCode, brandCode, modelCode,
      qualityCode: qualityCode || null,
      serviceMode,
      cityCode: cityCode || null,
    };
    const reference = await pricingService.resolveReferencePrice(ctx);
    const snapshot = await pricingService.buildPriceSnapshot({
      vertical: verticalOf(req), repairCode, referencePrice: reference, serviceMode,
    });
    const cfg = await pricingService.getConfig(verticalOf(req));

    const onlineEnabled = !!cfg?.onlinePaymentsEnabled && gatewayReady();
    res.json({
      /**
       * How this can be paid for. Sent so the app never offers a method that
       * cannot complete — with no gateway configured, online is not a choice
       * being withheld, it is a thing that does not exist yet.
       */
      payment: {
        methods: onlineEnabled ? ['cash', 'online'] : ['cash'],
        onlineEnabled,
      },
      reference: reference
        ? { minPaise: reference.minPaise, recommendedPaise: reference.recommendedPaise, maxPaise: reference.maxPaise }
        : null,
      estimate: snapshot,
      isEstimate: true,
      note: snapshot?.pricingMode === 'diagnosis_required'
        ? 'This repair is priced after inspection. You will receive a quote to approve before any work begins.'
        : 'Final price is confirmed once you choose a provider.',
    });
  } catch (err) { next(err); }
}

async function findProviders(req, res, next) {
  try {
    const { repairCode, brandCode, modelCode, qualityCode, serviceMode = 'doorstep', lat, lng, pincode, cityCode } = req.query;
    if (!repairCode || lat == null || lng == null) {
      return res.status(400).json({ error: 'repairCode, lat and lng are required', code: 'PARAMS_REQUIRED' });
    }

    const result = await matchingService.findProviders({
      vertical: verticalOf(req),
      repairCode, brandCode, modelCode,
      qualityCode: qualityCode || null,
      serviceMode,
      lat: Number(lat), lng: Number(lng),
      pincode: pincode || null,
      cityCode: cityCode || null,
    });

    // Internal scoring never leaves the server (§71).
    res.json({
      recommended: matchingService.toPublic(result.recommended),
      providers: result.providers.map(matchingService.toPublic),
      reason: result.reason,
      // Aggregate only, so the empty state can say what is actually wrong.
      nearbyCount: result.nearbyCount ?? 0,
      primaryReason: result.primaryReason ?? null,
      repairName: result.repairName ?? null,
    });
  } catch (err) { next(err); }
}

/* Customer catalog requests (§67) */

async function submitCatalogRequest(req, res, next) {
  try {
    const { kind, brandName, modelName, variantName, problemText, notes, imageUrls } = req.body;

    // Collapse duplicates into a counter so admin sees demand, not noise.
    const dupFilter = {
      kind, vertical: verticalOf(req), status: 'pending',
      ...(brandName ? { brandName } : {}),
      ...(modelName ? { modelName } : {}),
    };
    const existing = (brandName || modelName) ? await CustomerCatalogRequest.findOne(dupFilter) : null;

    if (existing) {
      existing.requestCount += 1;
      await existing.save();
      return res.status(200).json({ request: existing.toObject(), deduped: true });
    }

    const request = await CustomerCatalogRequest.create({
      kind, vertical: verticalOf(req), userId: req.auth.sub,
      brandName, modelName, variantName, problemText, notes,
      imageUrls: imageUrls || [],
    });
    res.status(201).json({ request, deduped: false });
  } catch (err) { next(err); }
}

module.exports = {
  listBrands,
  listModels,
  listProductTypes,
  listFamilies,
  listSeries,
  listConfigurations,
  submitIdentificationRequest,
  listMyIdentificationRequests,
  listProblems,
  listRepairs,
  listAddOns,
  listPartQualities,
  getDiagnosticFlow,
  submitDiagnostic,
  previewPrice,
  findProviders,
  submitCatalogRequest,
};
