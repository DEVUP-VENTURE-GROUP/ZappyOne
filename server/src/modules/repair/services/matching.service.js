const mongoose = require('mongoose');
const { ProviderCapability } = require('../models/capability.model');
const { ProviderServiceArea } = require('../models/config.model');
const { ProviderInventory } = require('../models/inventory.model');
const { Part, PartQuality } = require('../models/part.model');
const { Repair } = require('../models/repair.model');
const Worker = require('../../worker/worker.model');
const Shop = require('../../shop/shop.model');
const s3Service = require('../../../utils/s3.service');
const pricingService = require('./pricing.service');

/**
 * The point at which a provider stops being offered cash work.
 *
 * Set at the wallet's soft limit rather than its hard floor, so they are
 * stopped while the debt is still clearable rather than at the moment the
 * ledger refuses them.
 */
const DUES_BLOCK_PAISE = -20000;   // -₹200



/**
 * Provider discovery and ranking (§19, §20, §71).
 *
 * Two stages, deliberately separated:
 *
 *   ELIGIBILITY is boolean and non-negotiable. A provider who cannot legally or
 *   physically do the job is removed, never merely down-ranked. Capability,
 *   service area, approved pricing, skill level and stock all gate here — a
 *   cheap provider without the part is not a cheap option, it is a failed job.
 *
 *   RANKING is a weighted score over the survivors. Weights come from config,
 *   so "Zappy Recommended" can be retuned by an admin without a deploy, and is
 *   explicitly NOT just the cheapest (§20).
 *
 * Every scored dimension is normalised to 0..1 where 1 is better, so weights
 * stay comparable and a new dimension cannot accidentally dominate because it
 * happens to be measured in a larger unit.
 */

const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Normalise so that LOWER raw values score HIGHER (price, distance, ETA). */
function invNormalise(value, min, max) {
  if (value == null) return 0.5;
  if (max <= min) return 1;
  const clamped = Math.min(Math.max(value, min), max);
  return 1 - (clamped - min) / (max - min);
}

/** Normalise so that HIGHER raw values score higher (rating, warranty). */
function normalise(value, min, max) {
  if (value == null) return 0.5;
  if (max <= min) return 1;
  const clamped = Math.min(Math.max(value, min), max);
  return (clamped - min) / (max - min);
}

/**
 * Providers whose declared service area covers this point.
 *
 * Pincode is checked before geometry because a provider who explicitly listed a
 * pincode has made a stronger commitment than one who merely falls inside a
 * radius, and radius circles routinely spill across areas they do not serve.
 */
let radiusCache = { km: 0, at: 0 };

/** Largest radius any active area covers, cached for a minute: it bounds the geo query. */
async function maxAreaRadiusKm() {
  if (Date.now() - radiusCache.at < 60000) return radiusCache.km;
  const [row] = await ProviderServiceArea.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: null, km: { $max: '$radiusKm' } } },
  ]);
  radiusCache = { km: row?.km || 0, at: Date.now() };
  return radiusCache.km;
}

/** Service areas that could cover a point: within the widest radius, or listing its pincode. */
async function candidateAreas({ lat, lng, pincode = null, extra = {} }) {
  const maxKm = await maxAreaRadiusKm();
  return ProviderServiceArea.find({
    isActive: true,
    ...extra,
    $or: [
      ...(pincode ? [{ pincodes: pincode }] : []),
      { center: { $geoWithin: { $centerSphere: [[Number(lng), Number(lat)], maxKm / EARTH_RADIUS_KM] } } },
    ],
  }).lean();
}

async function findServiceableProviders({ lat, lng, pincode = null, cityCode = null, serviceMode }) {
  const areas = await candidateAreas({
    lat, lng, pincode,
    extra: { serviceModes: serviceMode, ...(cityCode ? { cityCode } : {}) },
  });

  const out = [];
  for (const area of areas) {
    let covered = false;
    let distanceKm = null;

    if (pincode && area.pincodes?.length && area.pincodes.includes(pincode)) {
      covered = true;
    }

    const coords = area.center?.coordinates;
    if (coords?.length === 2) {
      distanceKm = haversineKm(lat, lng, coords[1], coords[0]);
      if (distanceKm <= (area.radiusKm || 0)) covered = true;
    }

    if (!covered) continue;

    /*
     * One entry per PROVIDER, not per area row. A shop with two overlapping
     * areas (a home area and a wider one, say) used to be listed twice — two
     * identical cards in the customer's list, and a doubled "N shops nearby".
     * Keep the nearer area: it decides the travel fee and the distance shown.
     */
    const owner = area.shopId ? `s:${area.shopId}` : `w:${area.workerId}`;
    const prev = out.find((o) => o.owner === owner);
    if (prev) {
      if (distanceKm != null && (prev.distanceKm == null || distanceKm < prev.distanceKm)) {
        Object.assign(prev, { distanceKm, areaId: area._id, workshopLocation: area.workshopLocation });
      }
      continue;
    }
    out.push({
      owner,
      shopId: area.shopId ? String(area.shopId) : null,
      workerId: area.workerId ? String(area.workerId) : null,
      distanceKm,
      areaId: area._id,
      workshopLocation: area.workshopLocation,
    });
  }
  return out;
}

/** Does this provider hold (or claim to hold) the part this repair consumes? */
/**
 * Whether this provider can get the part — and how confident we are.
 *
 * The crucial distinction is between a provider who DECLARED they have none and
 * one who never declared anything at all. Only the first is out of stock.
 *
 * Providers now quote a single final price with the part included, and are no
 * longer asked to keep a stock list at all. Treating silence as "out of stock"
 * would therefore exclude every provider from every screen and battery job —
 * the entire business — because nobody would ever have a row to be counted.
 * So silence is neutral: they sourced the part when they set the price, and
 * that is their side of the bargain to keep.
 *
 * A provider who DOES keep stock still earns the top score, because a part on
 * the shelf is a faster repair and deserves to rank first.
 */
async function checkInventory({ shopId, workerId, repair, brandCode, modelCode, qualityCode }) {
  const requirement = (repair.partRequirements || []).find((p) => p.required);
  // Software/cleaning jobs consume nothing — stock is not a gate for them.
  if (!requirement) return { needsPart: false, inStock: true, stockScore: 1 };

  const parts = await Part.find({
    componentCode: requirement.componentCode,
    brandCode,
    isActive: true,
    ...(qualityCode ? { qualityCode } : {}),
    $or: [{ compatibleModelCodes: modelCode }, { compatibleModelCodes: { $size: 0 } }],
  }).select('_id').lean();

  // We have not catalogued this part. That is OUR gap, not the provider's, and
  // punishing them for it would empty the list for a repair they can do today.
  if (!parts.length) {
    return { needsPart: true, inStock: true, stockScore: 0.6, reason: 'part_not_catalogued' };
  }

  const owner = shopId
    ? { shopId: new mongoose.Types.ObjectId(shopId) }
    : { workerId: new mongoose.Types.ObjectId(workerId) };

  const stock = await ProviderInventory.find({
    ...owner,
    partId: { $in: parts.map((p) => p._id) },
  }).lean();

  // Never told us either way — they are sourcing it themselves.
  if (!stock.length) return { needsPart: true, inStock: true, stockScore: 0.6, reason: 'not_tracked' };

  const usable = stock.filter((s) => (s.quantity || 0) - (s.reserved || 0) > 0);
  if (usable.length) return { needsPart: true, inStock: true, stockScore: 1, partId: usable[0].partId };

  const onOrder = stock.some((s) => s.onOrder);
  // They keep a stock list and it says zero — that is a real answer, so it is
  // believed. On-order only delays, so it is ranked down rather than out.
  return { needsPart: true, inStock: onOrder, stockScore: onOrder ? 0.3 : 0, reason: onOrder ? 'on_order' : 'out_of_stock' };
}

/**
 * Full eligibility + ranking pass.
 *
 * Returns `{ recommended, providers, rejected }` — `rejected` carries the
 * reason each provider was excluded, which is what makes "no providers found"
 * debuggable by ops instead of a silent empty list.
 */
async function findProviders({
  vertical = 'mobile',
  repairCode,
  brandCode,
  modelCode,
  qualityCode = null,
  serviceMode = 'doorstep',
  lat,
  lng,
  pincode = null,
  cityCode = null,
  limit = null,
}) {
  const cfg = await pricingService.getConfig(vertical);
  const repair = await Repair.findOne({ code: repairCode, vertical, isActive: true }).lean();
  if (!repair) return { recommended: null, providers: [], rejected: [], reason: 'unknown_repair' };

  if (!repair.allowedServiceModes.includes(serviceMode)) {
    return { recommended: null, providers: [], rejected: [], reason: 'service_mode_not_allowed' };
  }

  const serviceable = await findServiceableProviders({ lat, lng, pincode, cityCode, serviceMode });
  if (!serviceable.length) return { recommended: null, providers: [], rejected: [], reason: 'no_provider_in_area' };

  // One read for the grade catalog, rather than one per provider per grade.
  const qualities = await PartQuality.find({ isActive: true }).lean();
  const qualityByCode = new Map(qualities.map((q) => [q.code, q]));

  const rejected = [];
  const candidates = [];

  for (const s of serviceable) {
    const ownerFilter = s.shopId
      ? { shopId: new mongoose.Types.ObjectId(s.shopId) }
      : { workerId: new mongoose.Types.ObjectId(s.workerId) };
    const label = s.shopId ? `shop:${s.shopId}` : `worker:${s.workerId}`;

    const capability = await ProviderCapability.findOne({
      ...ownerFilter,
      repairCode,
      isActive: true,
    });

    if (!capability) { rejected.push({ label, reason: 'no_capability' }); continue; }
    if (!capability.covers({ brandCode, modelCode, qualityCode, serviceMode })) {
      rejected.push({ label, reason: 'capability_scope' }); continue;
    }
    if ((capability.skillLevel || 1) < (repair.minSkillLevel || 1)) {
      rejected.push({ label, reason: 'insufficient_skill' }); continue;
    }

    const priceCtx = { vertical, repairCode, brandCode, modelCode, qualityCode, serviceMode, cityCode };

    /**
     * When the customer has already chosen a part grade, price that grade and
     * nothing else. When they have not — the usual case at the provider list —
     * resolve every grade the provider offers, so the card can show the real
     * choice instead of one number that hides it.
     */
    const priceOptions = qualityCode
      ? []
      : await pricingService.resolveProviderPriceOptions(priceCtx, { shopId: s.shopId, workerId: s.workerId });

    const price = qualityCode
      ? await pricingService.resolveProviderPrice(priceCtx, { shopId: s.shopId, workerId: s.workerId })
      : priceOptions[0] || await pricingService.resolveProviderPrice(priceCtx, { shopId: s.shopId, workerId: s.workerId });

    // Diagnosis-first jobs are quoted after inspection, so a missing price is
    // expected there and must not exclude an otherwise capable provider.
    if (!price && repair.pricingMode !== 'diagnosis_required') {
      rejected.push({ label, reason: 'no_approved_price' }); continue;
    }

    const inv = await checkInventory({ shopId: s.shopId, workerId: s.workerId, repair, brandCode, modelCode, qualityCode });
    if (inv.needsPart && !inv.inStock) { rejected.push({ label, reason: inv.reason || 'out_of_stock' }); continue; }

    /*
     * `coverImageUrl` / `profilePhotoKey` are selected because the customer's
     * provider card shows them.
     *
     * Reported from production as "the logo never updates": it was never
     * FETCHED. A shop could upload a photo, see it saved on its own profile,
     * and still be a grey placeholder to every customer — because the field the
     * card reads was not in this projection at all. Nothing about the upload
     * was broken; the picture simply never travelled this far.
     */
    const profile = s.shopId
      ? await Shop.findById(s.shopId)
        .select('businessName rating reviewCount completedJobs isActive isBlocked kyc coverImageUrl')
        .lean()
      : await Worker.findById(s.workerId)
        .select('name rating completedJobs penalties isBlocked kyc isOnline wallet profilePhotoKey')
        .lean();

    if (!profile) { rejected.push({ label, reason: 'profile_missing' }); continue; }
    if (profile.isBlocked) { rejected.push({ label, reason: 'blocked' }); continue; }
    if (profile.kyc?.status !== 'approved') { rejected.push({ label, reason: 'kyc_not_approved' }); continue; }

    /**
     * A technician deep in commission debt is not given more cash work.
     *
     * On a cash job they collect the whole amount and owe us the
     * commission afterwards. Someone already at the floor cannot absorb
     * another debit, so handing them the job books revenue we will never
     * see. They keep every other kind of work; only cash is withheld,
     * and only until they clear.
     */
    if (!s.shopId && (profile.wallet?.balancePaise ?? 0) <= DUES_BLOCK_PAISE) {
      rejected.push({ label, reason: 'dues_pending' });
      continue;
    }

    const quality = qualityCode ? await PartQuality.findOne({ code: qualityCode }).lean() : null;

    // Grade names and warranties come from the PartQuality rows, never from a
    // hardcoded list — a grade admin adds tomorrow has to appear here by itself.
    const gradeOptions = priceOptions.length
      ? priceOptions.map((o) => {
        const meta = o.qualityCode ? qualityByCode.get(o.qualityCode) : null;
        return {
          qualityCode: o.qualityCode,
          label: meta?.name || (o.qualityCode ? o.qualityCode : 'Any part grade'),
          isGenuine: !!meta?.isGenuine,
          rank: meta?.rank ?? 0,
          totalPaise: o.totalPaise,
          warrantyDays: o.warrantyDays || meta?.defaultWarrantyDays || repair.warrantyDays || 0,
        };
      })
      : [];

    candidates.push({
      shopId: s.shopId,
      workerId: s.workerId,
      name: profile.businessName || profile.name || 'Provider',
      /**
       * A signed URL, not the stored key.
       *
       * The bucket is private, so handing the raw S3 key to a browser renders a
       * broken image — which looks identical to "no logo" and is why this was
       * read as a caching problem. Signing fails soft: a provider without a
       * usable photo is a provider with no photo, never a broken card.
       */
      imageUrl: await s3Service.signMedia(s.shopId ? profile.coverImageUrl : profile.profilePhotoKey),
      distanceKm: s.distanceKm,
      price,
      totalPaise: price?.totalPaise ?? null,
      // Every grade this provider will do it at — what makes the list a
      // marketplace rather than a column of identical-looking numbers (§70).
      priceOptions: gradeOptions,
      warrantyDays: price?.warrantyDays ?? repair.warrantyDays ?? 0,
      etaMinutes: capability.estimatedDurationMin || price?.estimatedDurationMin || repair.estimatedDurationMin,
      skillLevel: capability.skillLevel || 1,
      qualityRank: quality?.rank ?? 0,
      rating: profile.rating ?? null,
      completedJobs: profile.completedJobs ?? 0,
      penalties: profile.penalties || null,
      stockScore: inv.stockScore,
      partId: inv.partId || null,
      serviceMode,
    });
  }

  if (!candidates.length) {
    /*
     * "No technicians" was the only thing the customer ever heard, and the
     * screen then offered to change the location — even when three shops sat
     * inside the radius and the real answer was that none of them had listed
     * THIS repair. The cause is known here, so it travels: how many providers
     * cover the address, and the commonest reason they were not offered.
     * Counts only — which shop failed which check never leaves the server.
     */
    const reasonCounts = rejected.reduce((acc, r) => {
      acc[r.reason] = (acc[r.reason] || 0) + 1;
      return acc;
    }, {});
    const primaryReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    return {
      recommended: null,
      providers: [],
      rejected,
      reason: 'no_eligible_provider',
      nearbyCount: serviceable.length,
      primaryReason,
      repairName: repair.name,
    };
  }

  const ranked = rank(candidates, cfg);
  const capped = ranked.slice(0, limit || cfg.maxProvidersShown || 10);

  return {
    recommended: capped[0] ? { ...capped[0], zappyRecommended: true } : null,
    providers: capped,
    rejected,
    reason: null,
  };
}

/**
 * Weighted ranking. Bounds are taken from the candidate set itself so the score
 * reflects the real spread of what is on offer here and now, rather than an
 * absolute scale that would flatten to nothing in a market where every provider
 * charges roughly the same.
 */
function rank(candidates, cfg) {
  const w = cfg.rankingWeights || {};
  const prices = candidates.map((c) => c.totalPaise).filter((p) => p != null);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const dists = candidates.map((c) => c.distanceKm).filter((d) => d != null);
  const minDist = dists.length ? Math.min(...dists) : 0;
  const maxDist = dists.length ? Math.max(...dists) : 0;
  const etas = candidates.map((c) => c.etaMinutes).filter((e) => e != null);
  const minEta = etas.length ? Math.min(...etas) : 0;
  const maxEta = etas.length ? Math.max(...etas) : 0;
  const maxWarranty = Math.max(...candidates.map((c) => c.warrantyDays || 0), 1);
  const maxQuality = Math.max(...candidates.map((c) => c.qualityRank || 0), 1);

  return candidates
    .map((c) => {
      const offers = c.penalties?.totalOffers || 0;
      const rejects = c.penalties?.totalRejects || 0;
      const cancels = c.penalties?.totalCancels || 0;
      const acceptance = offers > 0 ? 1 - rejects / offers : 0.6;
      const cancelRate = c.completedJobs > 0 ? cancels / c.completedJobs : 0;

      const parts = {
        price: invNormalise(c.totalPaise, minPrice, maxPrice) * (w.price ?? 1),
        partQuality: normalise(c.qualityRank, 0, maxQuality) * (w.partQuality ?? 1),
        warranty: normalise(c.warrantyDays, 0, maxWarranty) * (w.warranty ?? 1),
        eta: invNormalise(c.etaMinutes, minEta, maxEta) * (w.eta ?? 1),
        distance: invNormalise(c.distanceKm, minDist, maxDist) * (w.distance ?? 1),
        rating: normalise(c.rating ?? 4, 1, 5) * (w.rating ?? 1),
        completionRate: normalise(Math.min(c.completedJobs, 100), 0, 100) * (w.completionRate ?? 1),
        cancellationRate: invNormalise(cancelRate, 0, 1) * (w.cancellationRate ?? 1),
        responseTime: normalise(acceptance, 0, 1) * (w.responseTime ?? 1),
        skillLevel: normalise(c.skillLevel, 1, 4) * (w.skillLevel ?? 1),
        inventory: (c.stockScore ?? 1) * (w.inventory ?? 1),
      };

      const score = Object.values(parts).reduce((a, b) => a + b, 0);
      // `parts` is retained for admin debugging but must not be exposed to
      // customers — §71 says the weighting is not for public consumption.
      return { ...c, score: Math.round(score * 1000) / 1000, _scoreParts: parts };
    })
    .sort((a, b) => b.score - a.score);
}

/** Strip internal scoring before anything customer-facing is serialised. */
function toPublic(provider) {
  if (!provider) return null;
  const { _scoreParts, score, price, penalties, ...rest } = provider;
  return rest;
}

module.exports = {
  candidateAreas,
  findProviders,
  findServiceableProviders,
  checkInventory,
  rank,
  toPublic,
  _internals: { haversineKm, normalise, invNormalise },
};
