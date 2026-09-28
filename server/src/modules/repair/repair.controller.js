const Brand = require('../service/brand.model');
const DeviceModel = require('../service/device-model.model');
const { ProblemCategory, Problem } = require('./models/problem.model');
const { Repair } = require('./models/repair.model');
const { PartQuality } = require('./models/part.model');
const { CustomerCatalogRequest } = require('./models/governance.model');
const {
  ProductType, ProductFamily, ProductSeries, DeviceConfiguration, ModelIdentificationRequest,
} = require('./models/catalog.model');
const { RepairBooking, CANCELLABLE_FROM } = require('./models/booking.model');
const s3Service = require('../../utils/s3.service');
const { RepairQuote } = require('./models/quote.model');
const { DeviceInspection, QAInspection } = require('./models/custody.model');
const Worker = require('../worker/worker.model');
const Shop = require('../shop/shop.model');
const { QAChecklist } = require('./models/config.model');
const diagnosticService = require('./services/diagnostic.service');
const matchingService = require('./services/matching.service');
const bookingService = require('./services/booking.service');
const cancellationService = require('./services/cancellation.service');
const handoverService = require('./services/handover.service');
const ratingService = require('./services/rating.service');
const pricingService = require('./services/pricing.service');
const reportService = require('./services/report.service');
const { CustomerAsset } = require('./models/customer-asset.model');

/**
 * Customer- and worker-facing repair controllers.
 *
 * Everything catalog-shaped is read straight from the database — there is no
 * hardcoded brand, model, problem or price anywhere in this file. Admin edits
 * are visible on the next request without a deploy, which is the whole point
 * of §1.
 */

const { verticalOf, verticalFilter } = require('./vertical');

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

    res.json({
      /**
       * How this can be paid for. Sent so the app never offers a method that
       * cannot complete — with no gateway configured, online is not a choice
       * being withheld, it is a thing that does not exist yet.
       */
      payment: {
        methods: cfg?.onlinePaymentsEnabled ? ['cash', 'online'] : ['cash'],
        onlineEnabled: !!cfg?.onlinePaymentsEnabled,
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

/* Bookings */

async function createBooking(req, res, next) {
  try {
    const { booking, replayed } = await bookingService.createBooking({
      ...req.body,
      userId: req.auth.sub,
      idempotencyKey: req.get('Idempotency-Key') || req.body.idempotencyKey || null,
    });
    res.status(replayed ? 200 : 201).json({ booking, replayed });
  } catch (err) { next(err); }
}

async function listMyBookings(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = 20;
    const filter = { userId: req.auth.sub };
    if (req.query.status) filter.status = req.query.status;

    const [bookings, total] = await Promise.all([
      RepairBooking.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      RepairBooking.countDocuments(filter),
    ]);
    res.json({ bookings, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
}

/**
 * The service report — what was found and what was done (§26).
 *
 * Same object-level authorisation as the booking itself: a report carries
 * photos of the inside of someone's home and their address, so it is never
 * readable by anyone but the customer, the provider who did the work, and
 * admin.
 *
 * Only for finished work. A report on a job still in progress would show a
 * half-filled checklist as though it were the final result.
 */
/* Saved assets — "my tank", "my phone", "my car" (§27) */

/**
 * The customer's saved things, with the real catalog names attached.
 *
 * Names are resolved on read rather than stored, so a tank type renamed in
 * admin is renamed here too and an asset can never describe a model that no
 * longer exists.
 */
async function listMyAssets(req, res, next) {
  try {
    const filter = { userId: req.auth.sub, isArchived: false };
    if (req.query.vertical) filter.vertical = String(req.query.vertical).toLowerCase();

    const assets = await CustomerAsset.find(filter).sort({ updatedAt: -1 }).lean();
    if (!assets.length) return res.json({ assets: [] });

    const [brands, models] = await Promise.all([
      Brand.find({ code: { $in: assets.map((a) => a.brandCode) } }).select('code name').lean(),
      DeviceModel.find({ code: { $in: assets.map((a) => a.modelCode).filter(Boolean) } })
        .select('code name').lean(),
    ]);
    const brandName = new Map(brands.map((b) => [b.code, b.name]));
    const modelName = new Map(models.map((m) => [m.code, m.name]));

    /*
     * Last service is READ off the bookings, never stored on the asset — a
     * copy would drift the first time a booking was cancelled or backdated.
     */
    const lastByKey = new Map();
    const bookings = await RepairBooking.find({
      userId: req.auth.sub, status: 'COMPLETED',
    }).select('vertical brandCode modelCode completedAt repairCode').sort({ completedAt: -1 }).lean();
    for (const b of bookings) {
      const key = `${b.vertical}|${b.brandCode}|${b.modelCode}`;
      if (!lastByKey.has(key)) lastByKey.set(key, b);
    }

    const signed = await s3Service.signDocsMedia(assets);

    res.json({
      assets: signed.map((a) => {
        const last = lastByKey.get(`${a.vertical}|${a.brandCode}|${a.modelCode}`);
        return {
          ...a,
          brandName: brandName.get(a.brandCode) || a.brandCode,
          modelName: modelName.get(a.modelCode) || a.modelCode || null,
          // The customer's own stated date is a fallback for work done before
          // they ever used Zappy; a real booking always wins.
          lastServicedAt: last?.completedAt || a.lastServicedAt || null,
          lastRepairCode: last?.repairCode || null,
        };
      }),
    });
  } catch (err) { next(err); }
}

async function createMyAsset(req, res, next) {
  try {
    const { lat, lng, address, ...rest } = req.body;
    const asset = await CustomerAsset.create({
      ...rest,
      userId: req.auth.sub,
      photos: (req.body.photos || []).map((v) => s3Service.keyFromMedia(v)).filter(Boolean),
      location: lat != null && lng != null
        ? { type: 'Point', coordinates: [lng, lat], address: address || '' }
        : undefined,
    });
    res.status(201).json({ asset });
  } catch (err) { next(err); }
}

async function updateMyAsset(req, res, next) {
  try {
    const { lat, lng, address, ...rest } = req.body;
    const patch = { ...rest };
    if (req.body.photos) {
      patch.photos = req.body.photos.map((v) => s3Service.keyFromMedia(v)).filter(Boolean);
    }
    if (lat != null && lng != null) {
      patch.location = { type: 'Point', coordinates: [lng, lat], address: address || '' };
    }

    // Scoped by userId — an id alone must never be enough to edit someone
    // else's asset (§37, IDOR).
    const asset = await CustomerAsset.findOneAndUpdate(
      { _id: req.params.id, userId: req.auth.sub },
      { $set: patch },
      { new: true },
    ).lean();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json({ asset });
  } catch (err) { next(err); }
}

/** Archived, not deleted — bookings reference what it was. */
async function archiveMyAsset(req, res, next) {
  try {
    const asset = await CustomerAsset.findOneAndUpdate(
      { _id: req.params.id, userId: req.auth.sub },
      { $set: { isArchived: true } },
      { new: true },
    ).lean();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/** Every completed job on one asset — the service history in §27. */
async function getAssetHistory(req, res, next) {
  try {
    const asset = await CustomerAsset.findOne({ _id: req.params.id, userId: req.auth.sub }).lean();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const bookings = await RepairBooking.find({
      userId: req.auth.sub,
      vertical: asset.vertical,
      brandCode: asset.brandCode,
      ...(asset.modelCode ? { modelCode: asset.modelCode } : {}),
      status: { $in: ['COMPLETED', 'CANCELLED'] },
    })
      .select('reference status repairCode addOns priceSnapshot completedAt createdAt rating')
      .sort({ completedAt: -1, createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ asset, bookings });
  } catch (err) { next(err); }
}

async function getBookingReport(req, res, next) {
  try {
    const booking = await RepairBooking.findById(req.params.id).select('userId workerId shopId status').lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const role = req.auth.role;
    const id = String(req.auth.sub);
    const allowed =
      role === 'admin' ||
      (role === 'user' && String(booking.userId) === id) ||
      (role === 'worker' && String(booking.workerId || '') === id) ||
      (role === 'shop' && String(booking.shopId || '') === id);
    if (!allowed) return res.status(403).json({ error: 'You do not have access to this booking' });

    if (booking.status !== 'COMPLETED') {
      return res.status(409).json({
        error: 'The report is available once the job is complete',
        code: 'REPORT_NOT_READY',
      });
    }

    const data = await reportService.getReportData(req.params.id);
    if (!data) return res.status(404).json({ error: 'Booking not found' });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="report-${data.booking.reference}.html"`);
    res.send(reportService.renderHtml(data));
  } catch (err) { next(err); }
}

async function getBooking(req, res, next) {
  try {
    const booking = await RepairBooking.findById(req.params.id).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Object-level authorisation — never rely on the client not asking (§37).
    const role = req.auth.role;
    const id = String(req.auth.sub);
    const allowed =
      role === 'admin' ||
      (role === 'user' && String(booking.userId) === id) ||
      (role === 'worker' && String(booking.workerId || '') === id) ||
      (role === 'shop' && String(booking.shopId || '') === id);
    if (!allowed) return res.status(403).json({ error: 'You do not have access to this booking' });

    /**
     * Completion photos are stored as S3 KEYS and the bucket is private, so a
     * key in an `<img src>` loads nothing at all. That is why the customer saw
     * no photos and read it as the upload failing — the upload was fine, the
     * URLs were simply never signed on the way out.
     */
    booking.completionPhotos = await s3Service.signMediaList(booking.completionPhotos);

    const quotes = await RepairQuote.find({ bookingId: booking._id }).sort({ revision: -1 }).lean();

    /**
     * Who is coming, for the person waiting at the door.
     *
     * The tracking screen had a status, a price and an address, and no way to
     * answer the customer's actual first question — who is this, and can I call
     * them? Only the fields a customer legitimately needs are sent: a name, a
     * rating, and a number to ring. Never the provider's own address or id.
     *
     * Withheld until the job is accepted: before that the assignment can still
     * move, and naming someone who never turns up is worse than naming nobody.
     */
    let provider = null;
    const introduced = !['PENDING', 'CONFIRMED', 'PROVIDER_ASSIGNED'].includes(booking.status);
    if (introduced && (booking.workerId || booking.shopId)) {
      provider = booking.workerId
        ? await Worker.findById(booking.workerId).select('name phone rating completedJobs avatar').lean()
        : await Shop.findById(booking.shopId).select('businessName phone rating completedJobs').lean();

      if (provider) {
        provider = {
          name: provider.name || provider.businessName || 'Your technician',
          phone: provider.phone || null,
          rating: provider.rating ?? null,
          completedJobs: provider.completedJobs || 0,
          avatar: provider.avatar || null,
          kind: booking.workerId ? 'technician' : 'shop',
        };
      }
    }

    /**
     * Whether this booking can still be cancelled — decided HERE.
     *
     * The tracking screen kept its own list of cancellable statuses and the two
     * drifted: the client's was missing DIAGNOSING, QUOTE_PENDING and
     * PICKUP_SCHEDULED. A customer whose device pickup was scheduled had no
     * cancel button at all, while the server would have accepted it perfectly
     * well — they simply had no way to ask.
     *
     * A permission is the server's to state, never the client's to guess.
     */
    res.json({
      booking,
      quotes,
      provider,
      canCancel: CANCELLABLE_FROM.includes(booking.status),
    });
  } catch (err) { next(err); }
}

/** Role is derived from the token, never from the request body. */
function actorFrom(req) {
  const map = { user: 'customer', worker: 'worker', shop: 'shop', admin: 'admin' };
  return { actorRole: map[req.auth.role] || 'customer', actorId: req.auth.sub };
}

async function transitionBooking(req, res, next) {
  try {
    const booking = await bookingService.transition(req.params.id, req.body.status, {
      ...actorFrom(req),
      reason: req.body.reason || '',
      meta: req.body.meta || null,
    });
    res.json({ booking });
  } catch (err) { next(err); }
}

/**
 * "I've taken the cash."
 *
 * Provider-only: the customer does not get to mark their own booking paid, and
 * an online booking is settled by the gateway, never by a button.
 */
async function collectCash(req, res, next) {
  try {
    const { role, sub } = req.auth;
    const result = await bookingService.collectCash({
      bookingId: req.params.id,
      actorRole: role,
      actorId: sub,
    });

    res.json({
      booking: result.booking,
      alreadyPaid: result.alreadyPaid,
      collectedPaise: result.collectedPaise ?? result.booking.priceSnapshot?.totalPaise ?? 0,
    });
  } catch (err) { next(err); }
}

/** Shop owner hands the job to one of their own technicians. */
async function assignWorker(req, res, next) {
  try {
    const result = await bookingService.assignWorker({
      bookingId: req.params.id,
      shopId: req.auth.sub,
      workerId: req.body.workerId,
    });
    res.json({ booking: result.booking, worker: result.worker });
  } catch (err) { next(err); }
}

async function declineBooking(req, res, next) {
  try {
    const booking = await bookingService.declineBooking({
      bookingId: req.params.id,
      actorRole: req.auth.role,
      actorId: req.auth.sub,
      reason: req.body?.reason || '',
    });
    res.json({ booking });
  } catch (err) { next(err); }
}

/**
 * What would cancelling cost? Asked before the customer commits.
 *
 * A fee discovered after the fact is a support ticket. Shown on the confirm
 * dialog, it is an informed choice — and most people simply do not cancel on a
 * technician who is already outside.
 */
/**
 * Find a booking the caller is entitled to act on.
 *
 * Only a CUSTOMER is restricted to their own bookings. The cancel route is open
 * to every authenticated role because a shop, a technician or an admin can all
 * legitimately cancel a job — scoping the lookup to `userId` for all of them
 * turned a provider's cancel button into a 404 on a booking sitting right in
 * front of them.
 */
async function findCancellableBooking(req) {
  const filter = req.auth.role === 'user'
    ? { _id: req.params.id, userId: req.auth.sub }
    : { _id: req.params.id };
  return RepairBooking.findOne(filter).lean();
}

async function previewCancellation(req, res, next) {
  try {
    const booking = await findCancellableBooking(req);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const quote = await cancellationService.quoteCancellation(booking, { userId: booking.userId });
    res.json(quote);
  } catch (err) { next(err); }
}

async function cancelBooking(req, res, next) {
  try {
    const before = await findCancellableBooking(req);
    if (!before) return res.status(404).json({ error: 'Booking not found' });

    /**
     * Priced against the status BEFORE cancelling — afterwards everything looks
     * like 'created' and every cancellation would come out free.
     *
     * The fee is always assessed against the BOOKING'S customer, never against
     * whoever pressed the button: a shop cancelling its own job must not land a
     * penalty on the shop's account, nor count towards its cancellation tier.
     */
    const quote = await cancellationService.quoteCancellation(before, { userId: before.userId });
    if (!quote.allowed) {
      return res.status(409).json({ error: quote.message, code: quote.reason.toUpperCase() });
    }

    /**
     * A PROVIDER backing out is a supply failure, not the end of the job.
     *
     * The customer still wants their device fixed and has done nothing wrong,
     * so before killing the booking we try to hand it to somebody else — the
     * same thing that happens when a provider declines the offer, and what the
     * SLA watchdog does when nobody answers at all.
     *
     * Only while the job is still reassignable: once the device has been
     * collected or opened, there is nothing to hand over and this really is a
     * cancellation.
     */
    const providerBackingOut = ['shop', 'worker'].includes(req.auth.role);
    if (providerBackingOut && bookingService.canReleaseToPool(before)) {
      const result = await bookingService.releaseToPool({
        bookingId: req.params.id,
        ...actorFrom(req),
        reason: req.body.reason || 'Provider cancelled',
      });

      if (result.released) {
        return res.json({
          booking: result.booking,
          reassigned: true,
          reoffered: result.reoffered,
          // No fee either way: the customer did not cancel, and the provider is
          // penalised through their decline record, not the customer's bill.
          cancellation: {
            feePaise: 0, earnedPaise: 0, refundPaise: 0, isGrace: true,
            message: result.reoffered
              ? 'Job released — we are finding another provider.'
              : 'Job released. We are still looking for another provider.',
          },
        });
      }
    }

    const booking = await bookingService.transition(req.params.id, 'CANCELLED', {
      ...actorFrom(req),
      reason: req.body.reason || 'Cancelled by customer',
    });

    /**
     * Assessed AFTER the cancellation succeeds, and never allowed to fail it.
     * The customer asked to cancel; a bookkeeping error must not leave them
     * stuck with a booking they have already walked away from.
     */
    /**
     * A provider or admin cancelling is NOT the customer's doing, so no fee is
     * recorded against them — that would charge someone for a cancellation they
     * did not ask for. Only a customer-initiated cancellation is assessed.
     */
    // Not the customer's doing → whatever they paid online comes back in full.
    const paidOnline = before.paymentStatus === 'paid' ? (before.priceSnapshot?.totalPaise || 0) : 0;
    const settlement = req.auth.role === 'user'
      ? await cancellationService.assess(before, { userId: before.userId, quote })
      : { feePaise: 0, earnedPaise: 0, refundPaise: paidOnline, isGrace: false, message: 'Cancelled.' };

    if (paidOnline > 0 && settlement.refundPaise > 0) {
      await require('../payment/payment.service').refundBookingPayment({
        source: 'repair', bookingId: before._id, amountPaise: settlement.refundPaise,
        reason: `Cancelled: ${req.body.reason || req.auth.role}`,
      });
    }

    res.json({
      booking,
      cancellation: {
        feePaise: settlement.feePaise,
        earnedPaise: settlement.earnedPaise,
        refundPaise: settlement.refundPaise,
        isGrace: settlement.isGrace,
        message: settlement.message,
      },
    });
  } catch (err) { next(err); }
}

/* Proof and feedback */

/**
 * Photographs of the finished work, attached before the job closes.
 *
 * Evidence for both sides: the customer sees what was done to a device they
 * could not watch being opened, and the technician has something to point at
 * if the work is questioned a week later.
 */
async function attachCompletionPhotos(req, res, next) {
  try {
    const booking = await RepairBooking.findById(req.params.id).select('shopId workerId status').lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const mine = String(booking.workerId || '') === String(req.auth.sub)
      || String(booking.shopId || '') === String(req.auth.sub);
    if (!mine && req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'This is not your job' });
    }

    await RepairBooking.updateOne(
      { _id: req.params.id },
      { $set: { completionPhotos: req.body.photos } },
    );
    res.json({ ok: true, count: req.body.photos.length });
  } catch (err) { next(err); }
}

/**
 * The customer rates the finished repair. Once.
 *
 * A rating that can be rewritten is not a rating — it is a negotiating
 * position, and a technician who can ask for a revision will. `ratedAt` is the
 * lock, checked here rather than trusted from the client.
 */
async function rateRepair(req, res, next) {
  try {
    const booking = await RepairBooking.findOne({ _id: req.params.id, userId: req.auth.sub })
      .select('status ratedAt workerId shopId').lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.status !== 'COMPLETED') {
      return res.status(409).json({
        error: 'You can rate this once the repair is finished',
        code: 'NOT_COMPLETED',
      });
    }
    if (booking.ratedAt) {
      return res.status(409).json({ error: 'You have already rated this repair', code: 'ALREADY_RATED' });
    }

    await RepairBooking.updateOne(
      { _id: req.params.id, ratedAt: null },
      { $set: { rating: req.body.rating, ratingComment: req.body.comment || '', ratedAt: new Date() } },
    );

    // Feed the provider's running average, the same figure matching ranks on.
    await ratingService.applyRepairRating({
      workerId: booking.workerId,
      shopId: booking.shopId,
      rating: req.body.rating,
    }).catch(() => { /* the customer's rating is recorded either way */ });

    res.json({ ok: true });
  } catch (err) { next(err); }
}

/* Handover codes */

/**
 * The customer reads their own code.
 *
 * Only the booking's owner, and only the code for the step actually due — a
 * customer has no reason to hold the return code while their device is still
 * being collected, and a leaked full set would defeat the point.
 */
async function myHandoverCode(req, res, next) {
  try {
    const booking = await RepairBooking.findOne({ _id: req.params.id, userId: req.auth.sub })
      .select('+otp.start +otp.handover +otp.return')
      .lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Whichever step is next for this mode, if any.
    const due = ['start', 'handover', 'return']
      .find((kind) => booking.otp?.[kind] && !booking.otpVerified?.[`${kind}At`]);

    if (!due) return res.json({ code: null, kind: null });

    res.json({
      kind: due,
      code: booking.otp[due],
      label: handoverService.LABEL[due],
    });
  } catch (err) { next(err); }
}

/** The technician types what the customer reads out. */
async function verifyHandoverCode(req, res, next) {
  try {
    const booking = await RepairBooking.findById(req.params.id).select('shopId workerId').lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const mine = String(booking.workerId || '') === String(req.auth.sub)
      || String(booking.shopId || '') === String(req.auth.sub);
    if (!mine && req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'This is not your job' });
    }

    const result = await handoverService.verify({
      bookingId: req.params.id,
      kind: req.body.kind,
      code: req.body.code,
      actorRole: req.auth.role,
      actorId: req.auth.sub,
    });
    res.json(result);
  } catch (err) { next(err); }
}

/* Quotes */

async function submitQuote(req, res, next) {
  try {
    const { quote, replayed } = await bookingService.submitQuote({
      bookingId: req.params.id,
      ...actorFrom(req),
      ...req.body,
      idempotencyKey: req.get('Idempotency-Key') || null,
    });
    res.status(replayed ? 200 : 201).json({ quote, replayed });
  } catch (err) { next(err); }
}

async function respondToQuote(req, res, next) {
  try {
    const result = await bookingService.respondToQuote({
      quoteId: req.params.quoteId,
      userId: req.auth.sub,
      decision: req.body.decision,
      reason: req.body.reason || '',
    });
    res.json(result);
  } catch (err) { next(err); }
}

/* Device custody + QA */

async function createInspection(req, res, next) {
  try {
    const booking = await RepairBooking.findById(req.params.id).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    bookingService.assertActorMayAct(booking, actorFrom(req).actorRole, req.auth.sub);

    const inspection = await DeviceInspection.create({
      bookingId: booking._id,
      ...req.body,
      performedByWorkerId: req.auth.role === 'worker' ? req.auth.sub : null,
    });
    res.status(201).json({ inspection });
  } catch (err) { next(err); }
}

async function getQAChecklist(req, res, next) {
  try {
    const booking = await RepairBooking.findById(req.params.id).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const repair = booking.repairCode
      ? await Repair.findOne({ code: booking.repairCode, vertical: booking.vertical }).lean()
      : null;
    const codes = repair?.qaChecklistCodes || [];
    const checklist = codes.length
      ? await QAChecklist.findOne({ code: { $in: codes }, vertical: booking.vertical, isActive: true }).lean()
      : null;

    res.json({ checklist });
  } catch (err) { next(err); }
}

async function submitQA(req, res, next) {
  try {
    const booking = await RepairBooking.findById(req.params.id).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    bookingService.assertActorMayAct(booking, actorFrom(req).actorRole, req.auth.sub);

    const qa = await QAInspection.create({
      bookingId: booking._id,
      stage: req.body.stage || 'after',
      checklistCode: req.body.checklistCode || '',
      results: req.body.results || [],
      photos: req.body.photos || [],
      notes: req.body.notes || '',
      performedByWorkerId: req.auth.role === 'worker' ? req.auth.sub : null,
    });

    res.status(201).json({
      qa,
      passed: qa.passed,
      // Tell the worker plainly why completion is still blocked.
      blockingCompletion: !qa.passed && qa.stage === 'after',
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
  listBrands, listModels, listProblems, listRepairs, listAddOns, listPartQualities,
  getBookingReport,
  listMyAssets, createMyAsset, updateMyAsset, archiveMyAsset, getAssetHistory,
  listProductTypes, listFamilies, listSeries, listConfigurations,
  submitIdentificationRequest, listMyIdentificationRequests,
  getDiagnosticFlow, submitDiagnostic,
  previewPrice, findProviders,
  createBooking, listMyBookings, getBooking, transitionBooking, cancelBooking, previewCancellation, collectCash,
  myHandoverCode, verifyHandoverCode, attachCompletionPhotos, rateRepair,
  declineBooking, assignWorker,
  submitQuote, respondToQuote,
  createInspection, getQAChecklist, submitQA,
  submitCatalogRequest,
};
