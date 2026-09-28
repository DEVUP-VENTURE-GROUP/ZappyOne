const { ProviderPricing } = require('../../models/pricing.model');
const { ApprovalRequest } = require('../../models/governance.model');
const { Part } = require('../../models/part.model');
const { Repair } = require('../../models/repair.model');
const pricingService = require('../../services/pricing.service');
const { verticalOf } = require('../../vertical');
const { ownerOf, ownerFilter } = require('./owner');

/** Provider prices: submitted, scored against the reference band, never live unchecked. */

/* Pricing (§12, §68) */

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

module.exports = {
  listPricing,
  applyPriceSubmission,
  submitPricing,
  bulkPricing,
  getReferenceBand,
  listStockableParts,
};
