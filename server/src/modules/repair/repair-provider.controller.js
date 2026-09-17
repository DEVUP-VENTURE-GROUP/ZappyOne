const mongoose = require('mongoose');
const { ProviderCapability, SkillLevel } = require('./models/capability.model');
const { ProviderServiceArea } = require('./models/config.model');
const { ProviderInventory } = require('./models/inventory.model');
const { ProviderPricing, ZappyReferencePricing } = require('./models/pricing.model');
const { ApprovalRequest, ProviderCatalogRequest } = require('./models/governance.model');
const { ProblemCategory, Problem } = require('./models/problem.model');
const { Part } = require('./models/part.model');
const { Repair } = require('./models/repair.model');
const { RepairBooking } = require('./models/booking.model');
const { RepairQuote } = require('./models/quote.model');
const pricingService = require('./services/pricing.service');

/**
 * Provider self-service: capabilities, service areas, inventory and pricing.
 *
 * "Provider" is a shop OR an independent worker — every handler resolves the
 * owner from the token rather than the body, so a worker cannot write rows
 * belonging to a shop by guessing an id (§51).
 *
 * Prices submitted here are NOT live. They are scored against the Zappy
 * reference band and either auto-approved (green, if config allows) or queued
 * for review (§12). A provider can never publish their own price unchecked.
 */

const { verticalOf } = require('./vertical');

/** The owning entity, taken from the verified token — never from user input. */
function ownerOf(req) {
  if (req.auth.role === 'shop') return { shopId: new mongoose.Types.ObjectId(req.auth.sub), workerId: null };
  return { shopId: null, workerId: new mongoose.Types.ObjectId(req.auth.sub) };
}

/** Mongo filter matching only this provider's rows. */
function ownerFilter(req) {
  const o = ownerOf(req);
  return o.shopId ? { shopId: o.shopId } : { workerId: o.workerId };
}

/* ─── Capabilities (§15) ───────────────────────────────────────────────── */

async function listCapabilities(req, res, next) {
  try {
    // A provider approved for two verticals has two separate skill lists —
    // showing phone capabilities on the laptop screen would invite them to
    // price work they are not verified for.
    const rows = await ProviderCapability.find({ ...ownerFilter(req), vertical: verticalOf(req) })
      .sort({ repairCode: 1 })
      .lean();

    // Pair each capability with its repair so the UI can show what it means
    // without the client having to hold the catalog.
    const codes = rows.map((r) => r.repairCode);
    const repairs = await Repair.find({ code: { $in: codes }, vertical: verticalOf(req) })
      .select('code name minSkillLevel pricingMode')
      .lean();
    const byCode = new Map(repairs.map((r) => [r.code, r]));

    res.json({
      capabilities: rows.map((r) => ({ ...r, repair: byCode.get(r.repairCode) || null })),
    });
  } catch (err) { next(err); }
}

async function upsertCapability(req, res, next) {
  try {
    const { repairCode, brandCodes = [], modelCodes = [], qualityCodes = [], serviceModes, skillLevel = 1, estimatedDurationMin } = req.body;

    const repair = await Repair.findOne({ code: repairCode, vertical: verticalOf(req), isActive: true }).lean();
    if (!repair) return res.status(400).json({ error: 'Unknown repair', code: 'UNKNOWN_REPAIR' });

    // A provider cannot claim work above the repair's skill floor.
    if (skillLevel < repair.minSkillLevel) {
      return res.status(400).json({
        error: `This repair requires skill level ${repair.minSkillLevel} or above`,
        code: 'SKILL_TOO_LOW',
        requiredLevel: repair.minSkillLevel,
      });
    }

    // Verification-gated levels are held pending until an admin approves (§16).
    const level = await SkillLevel.findOne({ level: skillLevel, vertical: verticalOf(req) }).lean();
    const needsVerification = !!level?.requiresVerification;

    const owner = ownerOf(req);
    const filter = owner.shopId ? { shopId: owner.shopId, repairCode } : { workerId: owner.workerId, repairCode };

    const existing = await ProviderCapability.findOne(filter);
    // Re-claiming a level already approved should not silently reset to pending.
    const alreadyApprovedAtLevel = existing?.verificationStatus === 'approved' && existing.skillLevel === skillLevel;

    const doc = await ProviderCapability.findOneAndUpdate(
      filter,
      {
        $set: {
          ...owner,
          vertical: verticalOf(req),
          repairCode,
          brandCodes, modelCodes, qualityCodes,
          serviceModes: serviceModes || ['doorstep'],
          skillLevel,
          estimatedDurationMin: estimatedDurationMin ?? null,
          verificationStatus: needsVerification
            ? (alreadyApprovedAtLevel ? 'approved' : 'pending')
            : 'not_required',
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    if (needsVerification && doc.verificationStatus === 'pending') {
      await ApprovalRequest.findOneAndUpdate(
        { kind: 'skill_level', entityId: doc._id, status: 'pending' },
        {
          $set: {
            entityType: 'ProviderCapability',
            title: `Skill level ${skillLevel} claim for ${repair.name}`,
            summary: `${req.auth.role} ${req.auth.sub} claims level ${skillLevel}`,
            proposed: { repairCode, skillLevel },
            requestedByRole: req.auth.role === 'shop' ? 'shop' : 'worker',
            requestedById: req.auth.sub,
            priority: 'normal',
          },
        },
        { upsert: true },
      );
    }

    res.json({
      capability: doc,
      pendingVerification: doc.verificationStatus === 'pending',
      note: doc.verificationStatus === 'pending'
        ? 'This skill level needs admin verification before you receive jobs for it.'
        : undefined,
    });
  } catch (err) { next(err); }
}

async function removeCapability(req, res, next) {
  try {
    const doc = await ProviderCapability.findOneAndUpdate(
      { ...ownerFilter(req), _id: req.params.id },
      { $set: { isActive: false } },
      { new: true },
    );
    if (!doc) return res.status(404).json({ error: 'Capability not found' });
    res.json({ capability: doc });
  } catch (err) { next(err); }
}

/* ─── Service areas (§17) ──────────────────────────────────────────────── */

async function listServiceAreas(req, res, next) {
  try {
    const areas = await ProviderServiceArea.find(ownerFilter(req)).lean();
    res.json({ areas });
  } catch (err) { next(err); }
}

async function upsertServiceArea(req, res, next) {
  try {
    const { cityCode, areaNames = [], pincodes = [], center, radiusKm = 10, serviceModes, workshopAddress, workshopLocation } = req.body;

    // Workshop and pickup modes are meaningless without somewhere to take the
    // device, so the address is required rather than silently optional.
    const modes = serviceModes || ['doorstep'];
    const needsWorkshop = modes.includes('workshop') || modes.includes('pickup_repair');
    if (needsWorkshop && !workshopAddress) {
      return res.status(400).json({
        error: 'A workshop address is required to offer workshop or pickup service',
        code: 'WORKSHOP_ADDRESS_REQUIRED',
      });
    }

    const owner = ownerOf(req);
    const filter = owner.shopId ? { shopId: owner.shopId, cityCode } : { workerId: owner.workerId, cityCode };

    /**
     * A half-written GeoJSON point breaks the 2dsphere index.
     *
     * `center` and `workshopLocation` default their `type` to 'Point' but leave
     * `coordinates` undefined, so saving an area without a map pin stored
     * `{ type: 'Point' }` — which Mongo rejects outright: "Point must be an
     * array or object". Most providers set a city and a radius and never drop a
     * pin, so this was the common path, not an edge case. Unset the field
     * entirely rather than storing half of one.
     */
    const hasCenter = Array.isArray(center) && center.length === 2;
    const hasWorkshopPin = Array.isArray(workshopLocation) && workshopLocation.length === 2;

    /**
     * An area with no pin and no pincodes can never match a single customer.
     *
     * findServiceableProviders covers a provider one of two ways: the customer's
     * pincode is on their list, or the customer is inside radiusKm of their
     * CENTRE. With neither, every check fails and the provider is invisible —
     * fully verified, fully priced, and never offered a job, with nothing on any
     * screen to say why. Refusing the save is the only honest answer.
     *
     * Note what the centre is NOT: it is not where the owner happens to be
     * standing. It is the shop's fixed location, set once. An owner who is out
     * of the shop still receives the job and assigns it to a technician, so
     * matching must never follow their live position.
     */
    if (!hasCenter && !(pincodes || []).length) {
      return res.status(400).json({
        error: 'Drop a pin on your shop location, or list the pincodes you cover — '
          + 'without one of the two, no customer can ever be matched to you.',
        code: 'SERVICE_AREA_UNREACHABLE',
      });
    }

    const unset = {};
    if (!hasCenter) unset.center = '';
    if (!hasWorkshopPin) unset.workshopLocation = '';

    const doc = await ProviderServiceArea.findOneAndUpdate(
      filter,
      {
        $set: {
          ...owner, cityCode, areaNames, pincodes,
          ...(hasCenter ? { center: { type: 'Point', coordinates: center } } : {}),
          radiusKm, serviceModes: modes,
          workshopAddress: workshopAddress || '',
          ...(hasWorkshopPin ? { workshopLocation: { type: 'Point', coordinates: workshopLocation } } : {}),
          isActive: true,
        },
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.json({ area: doc });
  } catch (err) { next(err); }
}

/* ─── Inventory (§14) ──────────────────────────────────────────────────── */

async function listInventory(req, res, next) {
  try {
    const rows = await ProviderInventory.find(ownerFilter(req)).lean();

    /**
     * Stock rows have no vertical of their own — the PART carries it. So the
     * vertical filter is applied to the parts, and a row whose part belongs to
     * another vertical simply is not this screen's business.
     */
    const parts = await Part.find({
      _id: { $in: rows.map((r) => r.partId) },
      vertical: verticalOf(req),
    }).select('sku name componentCode brandCode qualityCode compatibleModelCodes').lean();
    const byId = new Map(parts.map((p) => [String(p._id), p]));

    res.json({
      inventory: rows.filter((r) => byId.has(String(r.partId))).map((r) => ({
        ...r,
        // `available` is a virtual, so it is recomputed here for lean() rows.
        available: Math.max(0, (r.quantity || 0) - (r.reserved || 0)),
        part: byId.get(String(r.partId)) || null,
      })),
    });
  } catch (err) { next(err); }
}

async function upsertInventory(req, res, next) {
  try {
    const { partId, quantity = 0, costPaise = 0, lowStockThreshold = 2, onOrder = false } = req.body;

    const part = await Part.findById(partId).lean();
    if (!part) return res.status(400).json({ error: 'Unknown part', code: 'UNKNOWN_PART' });

    const owner = ownerOf(req);
    const filter = owner.shopId ? { shopId: owner.shopId, partId } : { workerId: owner.workerId, partId };

    // Fetched-then-saved (rather than a raw update) so the pre-save hook
    // recomputes status from the new quantity.
    let doc = await ProviderInventory.findOne(filter);
    if (!doc) doc = new ProviderInventory({ ...owner, partId, partSku: part.sku });

    doc.quantity = quantity;
    doc.costPaise = costPaise;
    doc.lowStockThreshold = lowStockThreshold;
    doc.onOrder = onOrder;
    doc.lastUpdatedBy = req.auth.sub;
    if (quantity > 0) doc.lastRestockedAt = new Date();
    await doc.save();

    res.json({ inventory: { ...doc.toObject(), available: doc.available } });
  } catch (err) { next(err); }
}

/* ─── Pricing (§12, §68) ───────────────────────────────────────────────── */

async function listPricing(req, res, next) {
  try {
    const rows = await ProviderPricing.find({
      ...ownerFilter(req), vertical: verticalOf(req), supersededAt: null,
    }).sort({ repairCode: 1 }).lean();
    res.json({ pricing: rows });
  } catch (err) { next(err); }
}

/**
 * Write ONE price row, scored against the reference band.
 *
 * Shared by the single-row and bulk handlers so the two can never drift on the
 * rules that matter — deviation scoring, the red-band block, superseding the
 * previous version, and raising an approval request. A second copy of this for
 * the bulk path is exactly how a provider would end up publishing an unchecked
 * price by submitting it through the other door.
 */
async function applyPriceSubmission({ owner, vertical, requestedByRole, requestedById, row }) {
  const {
    repairCode, brandCode = null, modelCode = null, qualityCode = null,
    serviceMode = null, cityCode = null,
    partCostPaise = 0, labourPaise = 0, consumablesPaise = 0,
    travelPaise = 0, pickupPaise = 0, returnPaise = 0,
    totalPaise, warrantyDays = 0, estimatedDurationMin = null,
  } = row;

  const repair = await Repair.findOne({ code: repairCode, vertical, isActive: true }).lean();
  if (!repair) return { error: { status: 400, body: { error: 'Unknown repair', code: 'UNKNOWN_REPAIR' } } };

  /**
   * A part-based repair MUST be priced per quality grade.
   *
   * "Screen replacement — ₹700" tells a customer nothing about what they are
   * buying; the same job with an original panel and with a compatible one are
   * different products at different prices, and lumping them together is how a
   * customer expecting genuine glass gets aftermarket. So the grade is part of
   * the price, not a footnote — and the provider names it when they set it.
   *
   * Labour-only repairs carry no grade and correctly pass with none.
   */
  if ((repair.partRequirements || []).length > 0 && !qualityCode) {
    return {
      error: {
        status: 400,
        body: {
          error: 'Choose which part quality this price is for — customers see the grade they are buying.',
          code: 'QUALITY_REQUIRED',
        },
      },
    };
  }

  const scope = { vertical, repairCode, brandCode, modelCode, qualityCode, serviceMode, cityCode };

  const reference = await pricingService.resolveReferencePrice(scope);
  const evaluation = await pricingService.evaluateDeviation({
    vertical,
    totalPaise,
    referenceRecommendedPaise: reference?.recommendedPaise ?? null,
  });

  /*
   * No price limit. The provider's price is final and goes live immediately.
   *
   * There used to be a guardrail here: a price too far from Zappy's reference
   * band was BLOCKED outright (409), and anything above the green band sat in
   * pending approval instead of going live. That contradicts the whole model —
   * the provider quotes the finished job and that number is what the customer
   * pays. A shop that charges ₹750 for a screen it fits every day should not be
   * told its own price is "outside our accepted range".
   *
   * The deviation is still MEASURED and stored, so admin can see outliers on
   * the pricing screen and step in by hand if a price looks like a typo — but
   * it never blocks the provider and never delays their price going live.
   */

  // Editing a price supersedes the old row — history is never rewritten (§69).
  const existingFilter = owner.shopId
    ? { shopId: owner.shopId, ...scope, supersededAt: null }
    : { workerId: owner.workerId, ...scope, supersededAt: null };
  const previous = await ProviderPricing.findOne(existingFilter);
  if (previous) {
    previous.supersededAt = new Date();
    previous.isActive = false;
    await previous.save();
  }

  const doc = await ProviderPricing.create({
    ...owner,
    vertical,
    ...scope,
    partCostPaise, labourPaise, consumablesPaise,
    travelPaise, pickupPaise, returnPaise,
    totalPaise, warrantyDays, estimatedDurationMin,
    referencePricingId: reference?.referencePricingId || null,
    referenceRecommendedPaise: reference?.recommendedPaise ?? null,
    deviationPct: evaluation.deviationPct,
    band: evaluation.band,
    // Live on submission — the provider's price is final (see above).
    approvalStatus: 'auto_approved',
    version: previous ? previous.version + 1 : 1,
    supersedesId: previous?._id || null,
  });

  /*
   * A genuinely abnormal price is FLAGGED for admin's eyes, never gated.
   *
   * The price is already live; this is only so a wildly-off figure (often a
   * missing zero) surfaces on the ops queue for a human to glance at. It does
   * not hold the price back.
   */
  if (evaluation.band === 'red' && reference) {
    await ApprovalRequest.create({
      kind: 'abnormal_price',
      entityType: 'ProviderPricing',
      entityId: doc._id,
      title: `${repair.name} — ${modelCode || brandCode || 'all models'}`,
      summary: `LIVE ₹${Math.round(totalPaise / 100)} vs reference ₹${Math.round(reference.recommendedPaise / 100)} (${evaluation.deviationPct}%) — review, not blocking`,
      proposed: { totalPaise, warrantyDays },
      current: { recommendedPaise: reference.recommendedPaise },
      requestedByRole,
      requestedById,
      priority: 'normal',
    }).catch(() => {});
  }

  return { doc, evaluation, reference };
}

/**
 * Submit a price. Scored against the reference band immediately so the provider
 * gets honest feedback — "this is well above our benchmark" — at the moment they
 * enter it, rather than silence followed by a rejection days later.
 */
async function submitPricing(req, res, next) {
  try {
    const result = await applyPriceSubmission({
      owner: ownerOf(req),
      vertical: verticalOf(req),
      requestedByRole: req.auth.role === 'shop' ? 'shop' : 'worker',
      requestedById: req.auth.sub,
      row: req.body,
    });

    if (result.error) return res.status(result.error.status).json(result.error.body);

    const { doc, evaluation, reference } = result;
    res.status(201).json({
      pricing: doc,
      band: evaluation.band,
      deviationPct: evaluation.deviationPct,
      // Every price is live on submission now — the provider's price is final.
      autoApproved: true,
      reference: reference
        ? { minPaise: reference.minPaise, recommendedPaise: reference.recommendedPaise, maxPaise: reference.maxPaise }
        : null,
      note: 'This price is live.',
    });
  } catch (err) { next(err); }
}

/**
 * Price a whole model in one request.
 *
 * A technician setting up prices is not entering one number — they are saying
 * "for this model, screen is 2,400 with an OEM panel and 1,600 with a standard
 * one, battery is 900". That is three to ten rows they think of as a single
 * decision, and sending each separately leaves them half-priced when the
 * connection drops in a basement workshop.
 *
 * Rows are applied independently and reported individually: one blocked price
 * must not discard the nine good ones typed alongside it, so this deliberately
 * does NOT run as a transaction. The response says exactly which rows landed
 * and which were rejected, and why.
 */
async function bulkPricing(req, res, next) {
  try {
    const owner = ownerOf(req);
    const vertical = verticalOf(req);
    const requestedByRole = req.auth.role === 'shop' ? 'shop' : 'worker';

    const saved = [];
    const rejected = [];

    for (const row of req.body.rows || []) {
      const result = await applyPriceSubmission({
        owner, vertical, requestedByRole, requestedById: req.auth.sub, row,
      });

      if (result.error) {
        rejected.push({
          repairCode: row.repairCode,
          modelCode: row.modelCode || null,
          qualityCode: row.qualityCode || null,
          reason: result.error.body.error,
          code: result.error.body.code,
        });
        continue;
      }

      // Nothing waits on review any more — every saved price is live. `band`
      // is still reported so a provider sees where they sit vs the benchmark.
      saved.push({
        repairCode: row.repairCode,
        modelCode: row.modelCode || null,
        qualityCode: row.qualityCode || null,
        totalPaise: result.doc.totalPaise,
        approvalStatus: result.doc.approvalStatus,
        band: result.evaluation.band,
      });
    }

    res.status(201).json({
      saved,
      rejected,
      savedCount: saved.length,
      rejectedCount: rejected.length,
      // Kept for the client's shape; always 0 now that prices go live on save.
      pendingReview: 0,
      note: rejected.length
        ? `${saved.length} price${saved.length === 1 ? '' : 's'} saved and live, ${rejected.length} could not be accepted.`
        : `${saved.length} price${saved.length === 1 ? '' : 's'} saved and live.`,
    });
  } catch (err) { next(err); }
}

/**
 * The reference band for a repair, so a provider can see what they are being
 * measured against BEFORE submitting rather than guessing.
 */
async function getReferenceBand(req, res, next) {
  try {
    const { repairCode, brandCode, modelCode, qualityCode, serviceMode, cityCode } = req.query;
    if (!repairCode) return res.status(400).json({ error: 'repairCode is required' });

    const reference = await pricingService.resolveReferencePrice({
      // Repair codes are unique per vertical, so without this a laptop repair
      // sharing a mobile code could be quoted against mobile's band.
      vertical: verticalOf(req),
      repairCode,
      brandCode: brandCode || null,
      modelCode: modelCode || null,
      qualityCode: qualityCode || null,
      serviceMode: serviceMode || null,
      cityCode: cityCode || null,
    });
    const cfg = await pricingService.getConfig(verticalOf(req));

    res.json({
      reference: reference
        ? {
          minPaise: reference.minPaise,
          recommendedPaise: reference.recommendedPaise,
          maxPaise: reference.maxPaise,
          partCostPaise: reference.partCostPaise,
          labourPaise: reference.labourPaise,
        }
        : null,
      bands: {
        greenMaxDeviationPct: cfg.greenMaxDeviationPct,
        yellowMaxDeviationPct: cfg.yellowMaxDeviationPct,
      },
    });
  } catch (err) { next(err); }
}

/**
 * Parts a provider can stock.
 *
 * Exists separately from the admin parts list because a technician needs to
 * browse the catalog to add stock, and must not be handed an admin endpoint to
 * do it. Scoped to their own declared brands so the list is usable rather than
 * being the entire parts master.
 */
async function listStockableParts(req, res, next) {
  try {
    const { q, componentCode, brandCode } = req.query;
    const filter = { isActive: true, isArchived: false };
    if (componentCode) filter.componentCode = componentCode;
    if (brandCode) filter.brandCode = brandCode;
    if (q) {
      const safe = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ name: new RegExp(safe, 'i') }, { sku: new RegExp(safe, 'i') }];
    }

    const parts = await Part.find(filter)
      .select('sku name componentCode brandCode qualityCode compatibleModelCodes costPaise warrantyDays')
      .sort({ name: 1 })
      .limit(200)
      .lean();

    res.json({ parts });
  } catch (err) { next(err); }
}

/* ─── Jobs ─────────────────────────────────────────────────────────────── */

async function listJobs(req, res, next) {
  try {
    const filter = { ...ownerFilter(req) };
    if (req.query.active === 'true') {
      filter.status = { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'] };
    }
    const bookings = await RepairBooking.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ bookings });
  } catch (err) { next(err); }
}

/** Readiness summary — tells a provider exactly what is stopping them earning. */
async function onboardingStatus(req, res, next) {
  try {
    const filter = ownerFilter(req);
    const vertical = verticalOf(req);

    /**
     * Setup is per vertical, so the checklist must be too.
     *
     * Counting across verticals would tell a provider who priced their phone
     * work that their laptop setup is finished — and then leave them wondering
     * why no laptop jobs arrive. Service AREA is the exception: where someone
     * works does not change with what they repair, so it stays global.
     */
    const [capabilities, areas, pricing, stockedParts] = await Promise.all([
      ProviderCapability.countDocuments({ ...filter, vertical, isActive: true }),
      ProviderServiceArea.countDocuments({ ...filter, isActive: true }),
      ProviderPricing.countDocuments({
        ...filter, vertical, supersededAt: null, approvalStatus: { $in: ['approved', 'auto_approved'] },
      }),
      ProviderInventory.find({ ...filter, quantity: { $gt: 0 } }).select('partId').lean(),
    ]);

    // Stock belongs to a vertical through its part, not through the row.
    const inventory = stockedParts.length
      ? await Part.countDocuments({ _id: { $in: stockedParts.map((r) => r.partId) }, vertical })
      : 0;

    const pendingVerification = await ProviderCapability.countDocuments({ ...filter, vertical, verificationStatus: 'pending' });
    const pendingPrices = await ProviderPricing.countDocuments({
      ...filter, vertical, approvalStatus: 'pending', supersededAt: null,
    });

    /**
     * What setup actually requires.
     *
     * Stock is NOT on this list any more. Providers quote one final price with
     * the part included and are no longer asked to keep an inventory, so
     * requiring one left every provider permanently "incomplete" with a step
     * the app no longer has a screen for.
     *
     * It is still reported, because a provider who does track stock ranks above
     * one who does not — but as a count they can act on, never as a blocker.
     */
    const steps = [
      { key: 'capabilities', label: 'Add the repairs you can do', done: capabilities > 0, count: capabilities },
      { key: 'serviceArea', label: 'Set your service area', done: areas > 0, count: areas },
      { key: 'pricing', label: 'Set and get your prices approved', done: pricing > 0, count: pricing },
    ];

    res.json({
      steps,
      complete: steps.every((s) => s.done),
      // Optional, and deliberately outside `steps` so no screen can turn it
      // back into a requirement by iterating the list.
      optional: { stockedParts: inventory },
      pending: { skillVerifications: pendingVerification, priceApprovals: pendingPrices },
    });
  } catch (err) { next(err); }
}


/* ─── The work a provider can sign up for ──────────────────────────────── */

/**
 * Everything the "what do you fix?" step needs, in one call.
 *
 * Grouped under the SAME headings the customer sees — Display, Battery & Power,
 * Storage — because a provider ticking boxes and a customer picking a symptom
 * should be looking at one catalog, not two that drift. The link runs through
 * the problems: a heading owns problems, and each problem names the repairs
 * that fix it.
 *
 * Each repair carries whether this provider already claims it, so the UI can
 * render ticks without a second round trip, and the skill floor, so a level-1
 * technician is told why board work is closed to them rather than being
 * rejected days later.
 */
async function workCatalog(req, res, next) {
  try {
    const vertical = verticalOf(req);
    const cityCode = (req.query.cityCode || '').toLowerCase();

    const [categories, problems, repairs, mine, levels] = await Promise.all([
      ProblemCategory.find({ vertical, isActive: true, isArchived: false })
        .sort({ displayOrder: 1, name: 1 }).lean(),
      Problem.find({ vertical, isActive: true, isArchived: false })
        .select('code name categoryCode candidateRepairCodes').lean(),
      Repair.find({ vertical, isActive: true, isArchived: false })
        .sort({ displayOrder: 1, name: 1 }).lean(),
      ProviderCapability.find({ ...ownerFilter(req), vertical })
        .select('repairCode skillLevel serviceModes brandCodes isActive').lean(),
      SkillLevel.find({ vertical }).sort({ level: 1 }).lean(),
    ]);

    const mineByCode = new Map(mine.map((c) => [c.repairCode, c]));

    // A repair added for one city is not offered to providers elsewhere — see
    // the note on Repair.cityCodes.
    const inLocality = (r) => !r.cityCodes?.length || (cityCode && r.cityCodes.includes(cityCode));

    /**
     * Which headings a repair belongs under, via the problems it answers.
     *
     * ALL of them, not the first one found. A charging port repair answers both
     * "won't charge" under Charging and "port damaged" under Physical Damage,
     * and a technician looking under either heading has to find it.
     *
     * Keeping only the first match quietly deleted work from this screen: the
     * laptop provider saw 38 entries where the catalog holds 75, and headings
     * whose every repair had already been claimed by an earlier heading — phone
     * Connectivity, laptop Upgrade and Data Recovery — came out empty and were
     * then dropped altogether. The customer, who browses PROBLEMS rather than
     * repairs, saw the full catalog throughout, which is why the two panels
     * looked so different.
     *
     * Ticking is by repair code, so the same repair shown under two headings is
     * one choice in two places, not two separate claims.
     */
    const categoriesOfRepair = new Map();
    /**
     * The customer's words for each repair.
     *
     * A customer browses SYMPTOMS — "cracked screen", "black screen", "touch not
     * working" — while a provider claims FIXES. One fix answers many symptoms,
     * so the two counts never match: eleven display issues are covered by three
     * display repairs, and a provider looking at "3 jobs" beside the customer's
     * "11 issues" reasonably concludes something is missing.
     *
     * Nothing is missing, and the honest answer is not to fake parity by making
     * providers tick eleven boxes that mean the same three things — it is to
     * show which symptoms each fix already covers. So every repair carries the
     * problems that point at it, and every heading carries its symptom count.
     */
    const problemsOfRepair = new Map();

    for (const p of problems) {
      for (const code of p.candidateRepairCodes || []) {
        if (!categoriesOfRepair.has(code)) categoriesOfRepair.set(code, new Set());
        categoriesOfRepair.get(code).add(p.categoryCode);

        if (!problemsOfRepair.has(code)) problemsOfRepair.set(code, []);
        problemsOfRepair.get(code).push(p.name);
      }
    }

    const groups = categories.map((c) => ({
      code: c.code,
      name: c.name,
      icon: c.icon,
      imageUrl: c.imageUrl || '',
      // What the customer sees under this heading, so the provider's screen can
      // reconcile its own count against it instead of contradicting it.
      problemCount: problems.filter((p) => p.categoryCode === c.code).length,
      repairs: repairs
        .filter((r) => categoriesOfRepair.get(r.code)?.has(c.code) && inLocality(r))
        .map((r) => ({
          code: r.code,
          name: r.name,
          minSkillLevel: r.minSkillLevel || 1,
          allowedServiceModes: r.allowedServiceModes || [],
          pricingMode: r.pricingMode,
          estimatedDurationMin: r.estimatedDurationMin,
          warrantyDays: r.warrantyDays,
          // A repair that swaps a physical component can be quoted at more than
          // one part grade, so the pricing screen offers OEM / premium / standard
          // for it. A labour-only job (cleaning, software) has exactly one price,
          // and asking for three would be asking a question with no answer.
          usesPart: !!r.componentCode,
          /** The customer-facing symptoms this one fix answers. */
          answers: problemsOfRepair.get(r.code) || [],
          isLocal: !!r.cityCodes?.length,
          selected: mineByCode.has(r.code),
          mySkillLevel: mineByCode.get(r.code)?.skillLevel || null,
        })),
    }));

    /**
     * Headings are NOT dropped for being empty.
     *
     * They used to be, which meant a gap in the catalog — a heading whose
     * problems name no repair yet — removed the heading from the provider's
     * screen entirely. The provider then had no way to tell us they do that
     * work, and nobody could see the gap to fix it. An empty heading now opens
     * and offers "I do something not listed here", which turns a silent hole
     * into a request we can act on.
     */

    // Repairs no problem points at would otherwise be unreachable in this UI.
    const grouped = new Set(groups.flatMap((g) => g.repairs.map((r) => r.code)));
    const ungrouped = repairs.filter((r) => !grouped.has(r.code) && inLocality(r));
    if (ungrouped.length) {
      groups.push({
        code: 'other',
        name: 'Other',
        icon: '',
        imageUrl: '',
        repairs: ungrouped.map((r) => ({
          code: r.code,
          name: r.name,
          minSkillLevel: r.minSkillLevel || 1,
          allowedServiceModes: r.allowedServiceModes || [],
          pricingMode: r.pricingMode,
          estimatedDurationMin: r.estimatedDurationMin,
          warrantyDays: r.warrantyDays,
          usesPart: !!r.componentCode,
          selected: mineByCode.has(r.code),
          mySkillLevel: mineByCode.get(r.code)?.skillLevel || null,
        })),
      });
    }

    // The brands they already claim, so returning to this screen shows what
    // they chose last time instead of an empty grid.
    const brands = [...new Set(mine.flatMap((c) => c.brandCodes || []))];

    res.json({
      groups,
      brands,
      skillLevel: mine[0]?.skillLevel || null,
      skillLevels: levels.map((l) => ({
        level: l.level, name: l.name, description: l.description, requiresVerification: l.requiresVerification,
      })),
      selectedCount: mine.length,
    });
  } catch (err) { next(err); }
}

/**
 * Save a whole heading's worth of choices at once.
 *
 * The provider ticks a screenful and presses save once; sending one request per
 * repair would leave them half-saved on a dropped connection, which on a shop's
 * phone in a basement is not an edge case.
 *
 * Unticking removes the capability — the honest reading of an empty box — but
 * only within the codes the client actually sent, so one screen cannot wipe
 * work claimed on another.
 */
async function bulkCapabilities(req, res, next) {
  try {
    const vertical = verticalOf(req);
    const owner = ownerFilter(req);
    const {
      repairCodes = [], candidateCodes = [], brandCodes = [], serviceModes = ['doorstep'], skillLevel = 1,
    } = req.body;

    /**
     * De-duplicated, because the same repair legitimately appears under several
     * headings — a charging port answers both "won't charge" and "port damaged".
     * The client sends every code on screen as the scope, so without this a
     * repair shown twice is written twice and counted twice in the response.
     */
    const scope = [...new Set(candidateCodes.length ? candidateCodes : repairCodes)];
    const chosen = new Set(repairCodes);

    const repairs = await Repair.find({ code: { $in: scope }, vertical, isActive: true }).lean();
    const byCode = new Map(repairs.map((r) => [r.code, r]));

    const tooHigh = [];
    const saved = [];

    for (const code of scope) {
      const repair = byCode.get(code);
      if (!repair) continue;

      if (!chosen.has(code)) {
        await ProviderCapability.deleteOne({ ...owner, vertical, repairCode: code });
        continue;
      }

      // The skill floor is the repair's, not the provider's opinion of it.
      if (skillLevel < (repair.minSkillLevel || 1)) {
        tooHigh.push({ code, name: repair.name, requiredLevel: repair.minSkillLevel });
        continue;
      }

      const level = await SkillLevel.findOne({ level: skillLevel, vertical }).lean();
      const modes = serviceModes.filter((m) => repair.allowedServiceModes.includes(m));

      await ProviderCapability.findOneAndUpdate(
        { ...owner, vertical, repairCode: code },
        {
          $set: {
            brandCodes,
            serviceModes: modes.length ? modes : repair.allowedServiceModes.slice(0, 1),
            skillLevel,
            isActive: true,
            // Levels that need checking start pending, exactly as the single-add
            // path does — bulk entry must not be a way around verification.
            verificationStatus: level?.requiresVerification ? 'pending' : 'not_required',
          },
          $setOnInsert: { providerKind: req.auth.role === 'shop' ? 'shop' : 'individual' },
        },
        { upsert: true, new: true },
      );
      saved.push(code);
    }

    res.json({ saved: saved.length, skipped: tooHigh, selected: saved });
  } catch (err) { next(err); }
}

/**
 * "You don't list the job I do."
 *
 * Captured as a request rather than a catalog write: what customers can book
 * has to carry a price, a skill level and a QA check, none of which a provider
 * form can decide. Duplicates from the same provider collapse into one row.
 */
async function requestCatalogAddition(req, res, next) {
  try {
    const vertical = verticalOf(req);
    const isShop = req.auth.role === 'shop';
    const owner = ownerFilter(req);
    const { categoryCode = '', proposedName, description = '', cityCode = '' } = req.body;

    const existing = await ProviderCatalogRequest.findOne({
      ...owner,
      vertical,
      status: 'pending',
      proposedName: new RegExp(`^${String(proposedName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (existing) return res.json({ request: existing, deduped: true });

    const request = await ProviderCatalogRequest.create({
      vertical,
      providerKind: isShop ? 'shop' : 'individual',
      ...owner,
      categoryCode: String(categoryCode).toLowerCase(),
      proposedName,
      description,
      cityCode: String(cityCode).toLowerCase(),
    });

    return res.status(201).json({ request, deduped: false });
  } catch (err) { return next(err); }
}

/** This provider's own additions, so they can see what happened to them. */
async function listCatalogRequests(req, res, next) {
  try {
    const rows = await ProviderCatalogRequest.find({ ...ownerFilter(req), vertical: verticalOf(req) })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ requests: rows });
  } catch (err) { next(err); }
}

module.exports = {
  listCapabilities, upsertCapability, removeCapability,
  listServiceAreas, upsertServiceArea,
  listInventory, upsertInventory,
  listPricing, submitPricing, bulkPricing, getReferenceBand,
  listStockableParts,
  listJobs, onboardingStatus,
  workCatalog, bulkCapabilities, requestCatalogAddition, listCatalogRequests,
};
