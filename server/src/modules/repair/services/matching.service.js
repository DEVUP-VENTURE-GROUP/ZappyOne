const mongoose = require('mongoose');
const { ProviderCapability } = require('../models/capability.model');
const { ProviderServiceArea } = require('../models/config.model');
const { ProviderInventory } = require('../models/inventory.model');
const { Part, PartQuality } = require('../models/part.model');
const { Repair } = require('../models/repair.model');
const Worker = require('../../worker/worker.model');
const Shop = require('../../shop/shop.model');
const s3Service = require('../../../core/storage/s3');
const pricingService = require('./pricing.service');
const { haversineKm } = require('../../../core/geo/distance');

/**
 * The point at which a provider stops being offered cash work.
 *
 * Set at the wallet's soft limit rather than its hard floor, so they are
 * stopped while the debt is still clearable rather than at the moment the
 * ledger refuses them.
 */



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
const STAFF_CAPABILITY = { covers: () => true, skillLevel: 1, estimatedDurationMin: null };

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
  // A booking for later: workers whose hours cover it, online or not (jobs/work-hours).
  scheduledAt = null,
}) {
  const hoursRule = require('../../jobs/work-hours');
  const later = hoursRule.isLater(scheduledAt);
  const cfg = await pricingService.getConfig(vertical);
  const repair = await Repair.findOne({ code: repairCode, vertical, isActive: true }).lean();
  if (!repair) return { recommended: null, providers: [], rejected: [], reason: 'unknown_repair' };

  if (!repair.allowedServiceModes.includes(serviceMode)) {
    return { recommended: null, providers: [], rejected: [], reason: 'service_mode_not_allowed' };
  }

  // A partner at its capacity (shop/partner.service) is not offered more until one finishes.
  const found = await findServiceableProviders({ lat, lng, pincode, cityCode, serviceMode });
  // ZappyOne staff on duty reach the customer through their hub, not a drawn service area (workforce/staff).
  if (serviceMode !== 'workshop' && !later && typeof lat === 'number') {
    for (const st of await require('../../workforce/staff').onDutyNear({ lat, lng }).catch(() => [])) {
      const had = found.find((f) => f.workerId === st.workerId);
      if (had) had.staff = true;
      else found.push({ owner: `w:${st.workerId}`, shopId: null, workerId: st.workerId, distanceKm: st.km, areaId: null, workshopLocation: null, staff: true });
    }
  }
  const full = await require('../../shop/partner.service').atCapacity(found.filter((x) => x.shopId).map((x) => x.shopId));
  const serviceable = found.filter((x) => !x.shopId || !full.has(String(x.shopId)));
  if (!serviceable.length) return { recommended: null, providers: [], rejected: [], reason: 'no_provider_in_area' };

  // One read for the grade catalog, rather than one per provider per grade.
  const qualities = await PartQuality.find({ isActive: true }).lean();
  const qualityByCode = new Map(qualities.map((q) => [q.code, q]));

  const rejected = [];
  const candidates = [];

  // Asked once for everyone, not once per provider: who is really there now
  // (worker/presence) and who is under their dues limit (worker-dues).
  const workerIdsHere = serviceable.filter((x) => x.workerId).map((x) => x.workerId);
  // Verified for THIS service, not only as a person or shop: identity approval
  // alone never brings work (onboarding/eligibility, per-service enrolment).
  const line = await require('../../jobs/kinds').KINDS.repair.line({ vertical });
  const approvedHere = line
    ? new Set((await require('../../onboarding/eligibility').approvedProviders(line)).map((p) => p.id))
    : null;
  const [liveSet, workingSet, freeSet] = await Promise.all([
    require('../../worker/presence').liveIds(workerIdsHere),
    require('../../worker/worker-dues.service').filterWorkingWorkers(workerIdsHere),
    // Free / mid-job with room for one more / at their cap (jobs/workload).
    require('../../jobs/workload').classify(workerIdsHere),
  ]);

  // Every provider is checked at the same time: each check is several reads,
  // and one after another they added up to seconds on the customer's screen.
  await Promise.all(serviceable.map(async (s) => {
    const ownerFilter = s.shopId
      ? { shopId: new mongoose.Types.ObjectId(s.shopId) }
      : { workerId: new mongoose.Types.ObjectId(s.workerId) };
    const label = s.shopId ? `shop:${s.shopId}` : `worker:${s.workerId}`;

    // Staff on a fixed-price job need no capability row: ZappyOne trains them and prices it at the standard.
    const capability = await ProviderCapability.findOne({
      ...ownerFilter,
      repairCode,
      isActive: true,
    }) || (s.staff && repair.pricingMode === 'fixed' ? STAFF_CAPABILITY : null);

    if (!capability) { rejected.push({ label, reason: 'no_capability' }); return; }
    if (!capability.covers({ brandCode, modelCode, qualityCode, serviceMode })) {
      rejected.push({ label, reason: 'capability_scope' }); return;
    }
    if ((capability.skillLevel || 1) < (repair.minSkillLevel || 1)) {
      rejected.push({ label, reason: 'insufficient_skill' }); return;
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
      rejected.push({ label, reason: 'no_approved_price' }); return;
    }

    const inv = await checkInventory({ shopId: s.shopId, workerId: s.workerId, repair, brandCode, modelCode, qualityCode });
    if (inv.needsPart && !inv.inStock) { rejected.push({ label, reason: inv.reason || 'out_of_stock' }); return; }

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
        .select('businessName rating reviewCount completedJobs isActive isBlocked kyc coverImageUrl address.location services hours dispatchStats')
        .lean()
      : await Worker.findById(s.workerId)
        .select('name rating reviewCount completedJobs penalties isBlocked kyc isOnline wallet profilePhotoKey workHours dispatchStats')
        .lean();

    if (!profile) { rejected.push({ label, reason: 'profile_missing' }); return; }
    if (profile.isBlocked) { rejected.push({ label, reason: 'blocked' }); return; }
    // A shop that is not live (no pin, no approved service, closed by its hours…) gets no work.
    if (s.shopId && !require('../../shop/shop.service').isLive(profile)) { rejected.push({ label, reason: 'shop_not_live' }); return; }
    // Now: only someone really there (worker/presence). Later: whoever's hours cover it (jobs/work-hours).
    if (!s.shopId && !hoursRule.availableFor(profile, scheduledAt, { live: liveSet.has(String(s.workerId)) })) {
      rejected.push({ label, reason: later ? 'outside_hours' : 'offline' }); return;
    }
    if (profile.kyc?.status !== 'approved') { rejected.push({ label, reason: 'kyc_not_approved' }); return; }
    if (approvedHere && !approvedHere.has(String(s.shopId || s.workerId))) {
      rejected.push({ label, reason: 'service_not_approved' }); return;
    }

    /**
     * A technician deep in commission debt is not given more cash work.
     *
     * On a cash job they collect the whole amount and owe us the
     * commission afterwards. Someone already at the floor cannot absorb
     * another debit, so handing them the job books revenue we will never
     * see. They keep every other kind of work; only cash is withheld,
     * and only until they clear.
     */
    // The real wallet and the limit set in Economics (worker-dues), not a cached figure.
    if (!s.shopId && !workingSet.has(String(s.workerId))) {
      rejected.push({ label, reason: 'dues_pending' });
      return;
    }
    // At their cap: not listed. Mid-job with room for one more: listed only if
    // nobody free can come (decided below), arriving after their current job.
    // Busy right now does not matter for a booking later.
    const busy = !later && !s.shopId && !freeSet.free.has(String(s.workerId));
    if (busy && !freeSet.busy.has(String(s.workerId))) {
      rejected.push({ label, reason: 'busy' });
      return;
    }

    const quality = qualityCode ? qualityByCode.get(qualityCode) || null : null;

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
      // From the provider's base pin, as the booking prices it (create.js), so the
      // journey fee on the card is the one on the bill; distanceKm may later be
      // replaced by the road distance from where they are now, for arrival.
      journeyKm: s.distanceKm,
      price,
      totalPaise: price?.totalPaise ?? null,
      // Every grade this provider will do it at — what makes the list a
      // marketplace rather than a column of identical-looking numbers (§70).
      priceOptions: gradeOptions,
      warrantyDays: price?.warrantyDays ?? repair.warrantyDays ?? 0,
      // How long the repair itself takes (not how soon they arrive: arrivalMinutes, below).
      etaMinutes: capability.estimatedDurationMin || price?.estimatedDurationMin || repair.estimatedDurationMin,
      durationMinutes: capability.estimatedDurationMin || price?.estimatedDurationMin || repair.estimatedDurationMin,
      skillLevel: capability.skillLevel || 1,
      qualityRank: quality?.rank ?? 0,
      // No reviews yet reads as new (null), never a default five stars; ranking treats it as neutral.
      rating: profile.reviewCount ? profile.rating : null,
      completedJobs: profile.completedJobs ?? 0,
      jobsToday: require('../../jobs/fairness').statsOf(profile).jobsToday,
      penalties: profile.penalties || null,
      stockScore: inv.stockScore,
      partId: inv.partId || null,
      serviceMode,
      ...(s.staff && { staff: true }),
      // Mid-way through another job: can reach this one only after it.
      ...(busy && { busy: true, availableInMinutes: require('../../jobs/workload').BUSY_EXTRA_MIN }),
    });
  }));

  // Anyone free means the busy are left out; with nobody free they are the
  // honest answer, shown with their later arrival.
  if (candidates.some((c) => !c.busy)) {
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      if (candidates[i].busy) { rejected.push({ label: `worker:${candidates[i].workerId}`, reason: 'busy' }); candidates.splice(i, 1); }
    }
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

  // How soon each can be at the door (jobs/arrival), when someone comes to the customer.
  if (serviceMode !== 'workshop' && !later && typeof lat === 'number') {
    const est = await require('../../jobs/arrival').forProviders(
      candidates.map((c) => ({ kind: c.shopId ? 'shop' : 'worker', id: String(c.shopId || c.workerId), busyMin: c.busy ? c.availableInMinutes : 0 })),
      { lat, lng },
    ).catch(() => new Map());
    for (const c of candidates) {
      const e = est.get(`${c.shopId ? 'shop' : 'worker'}:${c.shopId || c.workerId}`);
      if (e) Object.assign(c, { arrivalMinutes: e.minutes, arrivalWithinPromise: e.withinPromise, arrivalSource: e.source, ...(e.km != null && { distanceKm: e.km }) });
    }
  }

  // Kept their arrival promises lately (jobs/promise): part of the ranking, neutral when too few visits.
  const kept = await require('../../jobs/promise').onTimeRates(candidates.map((c) => c.shopId || c.workerId)).catch(() => new Map());
  for (const c of candidates) c.onTimeRate = kept.get(String(c.shopId || c.workerId)) ?? null;

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
  // Speed is how soon they are at the door when we know it; otherwise how long the job takes.
  const speedOf = (c) => c.arrivalMinutes ?? c.etaMinutes;
  const etas = candidates.map(speedOf).filter((e) => e != null);
  const minEta = etas.length ? Math.min(...etas) : 0;
  const maxEta = etas.length ? Math.max(...etas) : 0;
  const maxWarranty = Math.max(...candidates.map((c) => c.warrantyDays || 0), 1);
  const maxQuality = Math.max(...candidates.map((c) => c.qualityRank || 0), 1);
  const today = candidates.map((c) => c.jobsToday || 0);
  const minToday = today.length ? Math.min(...today) : 0;
  const maxToday = today.length ? Math.max(...today) : 0;

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
        eta: invNormalise(speedOf(c), minEta, maxEta) * (w.eta ?? 1),
        distance: invNormalise(c.distanceKm, minDist, maxDist) * (w.distance ?? 1),
        rating: normalise(c.rating ?? 4, 1, 5) * (w.rating ?? 1),
        completionRate: normalise(Math.min(c.completedJobs, 100), 0, 100) * (w.completionRate ?? 1),
        cancellationRate: invNormalise(cancelRate, 0, 1) * (w.cancellationRate ?? 1),
        responseTime: normalise(acceptance, 0, 1) * (w.responseTime ?? 1),
        skillLevel: normalise(c.skillLevel, 1, 4) * (w.skillLevel ?? 1),
        inventory: (c.stockScore ?? 1) * (w.inventory ?? 1),
        onTime: (c.onTimeRate ?? 0.8) * (w.onTime ?? 1),
        // Fewer jobs today ranks higher, so work spreads and someone new is not starved (jobs/fairness).
        fairShare: invNormalise(c.jobsToday || 0, minToday, maxToday) * (w.fairShare ?? 1),
      };

      const score = Object.values(parts).reduce((a, b) => a + b, 0);
      // `parts` is retained for admin debugging but must not be exposed to
      // customers — §71 says the weighting is not for public consumption.
      return { ...c, score: Math.round(score * 1000) / 1000, _scoreParts: parts };
    })
    .sort((a, b) => b.score - a.score);
}

/** Strip internal scoring before anything customer-facing is serialised. */
// The customer never picks one staff member: all on-duty staff become one "ZappyOne pro" option, and dispatch gives the job to the fair nearest (jobs/fast-assign, jobs/fairness). Partners stay listed by name.
function poolStaff({ recommended, providers }) {
  const free = providers.filter((p) => p.staff && !p.busy);
  // All staff mid-job: still one option, arriving after their current job.
  const staff = free.length ? free : providers.filter((p) => p.staff);
  if (!staff.length) return { recommended, providers: providers.filter((p) => !p.staff) };
  const soonest = [...staff].sort((a, b) => (a.arrivalMinutes ?? Infinity) - (b.arrivalMinutes ?? Infinity) || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))[0];
  const pool = {
    ...soonest,
    zappyPool: true, staff: undefined, shopId: null, workerId: null, imageUrl: null,
    name: 'ZappyOne pro', staffCount: staff.length, rating: null, completedJobs: undefined, jobsToday: undefined, onTimeRate: undefined,
    zappyRecommended: true,
  };
  return { recommended: pool, providers: [pool, ...providers.filter((p) => !p.staff)] };
}

function toPublic(provider) {
  if (!provider) return null;
  const { _scoreParts, score, price, penalties, ...rest } = provider;
  return rest;
}

/**
 * Who can come and inspect a device when no repair is chosen yet.
 *
 * An inspection has no repair to price, so findProviders (which matches on a
 * repair's price) has nobody to return. Anyone verified for this line who does
 * at least one job in this vertical and covers the address can look at it:
 * nearest first, never someone blocked, unverified, or at their dues limit.
 */
async function findInspectors({ vertical, lat, lng, cityCode = null, includeOffline = false }) {
  const areas = await findServiceableProviders({ lat, lng, cityCode, serviceMode: 'doorstep' });
  if (!areas.length) return [];

  const workerIds = areas.filter((a) => a.workerId).map((a) => a.workerId);
  const shopIds = areas.filter((a) => a.shopId).map((a) => a.shopId);
  const [caps, workers, shops, line] = await Promise.all([
    ProviderCapability.find({
      vertical, isActive: true,
      $or: [{ workerId: { $in: workerIds } }, { shopId: { $in: shopIds } }],
    }).select('workerId shopId').lean(),
    Worker.find({ _id: { $in: workerIds } }).select('isBlocked kyc rating').lean(),
    Shop.find({ _id: { $in: shopIds } }).select('isBlocked isActive kyc rating address.location services hours').lean(),
    require('../../jobs/kinds').KINDS.repair.line({ vertical }),
  ]);
  const can = new Set(caps.map((c) => String(c.workerId || c.shopId)));
  const approved = line
    ? new Set((await require('../../onboarding/eligibility').approvedProviders(line)).map((p) => String(p.id)))
    : null;
  const working = await require('../../worker/worker-dues.service').filterWorkingWorkers(workerIds);
  const { free, busy } = await require('../../jobs/workload').classify(workerIds);
  const live = await require('../../worker/presence').liveIds(workerIds);
  const profile = new Map([...workers, ...shops].map((p) => [String(p._id), p]));

  return areas
    .filter((a) => {
      const id = String(a.workerId || a.shopId);
      const p = profile.get(id);
      if (!p || p.isBlocked || p.isActive === false || !can.has(id)) return false;
      if (a.shopId && !require('../../shop/shop.service').isLive(p)) return false;
      if (approved && !approved.has(id)) return false;
      if (a.shopId) return true;
      // Offline workers only when asked (the come-online wave), never for an offer.
      return working.has(id) && (free.has(id) || busy.has(id)) && (includeOffline || live.has(id));
    })
    // Mid-job workers only when nobody free can look at it.
    .filter((a, _, all) => !a.workerId || free.has(String(a.workerId))
      || !all.some((x) => x.workerId && free.has(String(x.workerId))))
    .map((a) => ({ ...a, live: !!a.shopId || live.has(String(a.workerId)) }))
    .sort((x, y) => (x.distanceKm ?? 99) - (y.distanceKm ?? 99) || (profile.get(String(y.workerId || y.shopId))?.rating || 0) - (profile.get(String(x.workerId || x.shopId))?.rating || 0));
}

module.exports = {
  poolStaff,
  candidateAreas,
  findProviders,
  findInspectors,
  findServiceableProviders,
  checkInventory,
  rank,
  toPublic,
  _internals: { haversineKm, normalise, invNormalise },
};
