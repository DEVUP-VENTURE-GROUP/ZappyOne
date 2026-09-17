const config = require('../../config');
const logger = require('../../utils/logger');
const { redis } = require('../../config/redis');
const s3 = require('../../utils/s3.service');
const ServiceCatalog = require('../service/service-catalog.model');
const pricingService = require('../pricing/pricing.service');
const LensScan = require('./lens-scan.model');

const CATALOG_CACHE_KEY = 'lens:catalog:v1';
const CATALOG_TTL = 600; // 10 min

/** Active catalog, Redis-cached. Shape kept compact for the model prompt. */
async function getCatalog() {
  try {
    const cached = await redis.get(CATALOG_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch { /* cache miss is fine */ }

  const docs = await ServiceCatalog.find({ isActive: true })
    .select('code name category description priceRangeMinPaise priceRangeMaxPaise')
    .lean();
  const catalog = docs.map((d) => ({
    code: d.code,
    name: d.name,
    category: d.category,
    description: d.description || '',
    // Paise, unconverted — the display layer turns it into rupees, and a
    // number converted this early gets stored in the wrong unit.
    priceMin: d.priceRangeMinPaise ?? null,
    priceMax: d.priceRangeMaxPaise ?? null,
  }));
  try { await redis.setex(CATALOG_CACHE_KEY, CATALOG_TTL, JSON.stringify(catalog)); } catch { /* noop */ }
  return catalog;
}

/** Client requests a presigned PUT; uploads the photo straight to S3. */
async function getUploadTarget({ userId, contentType }) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(contentType)) {
    throw Object.assign(new Error('Only JPEG, PNG, or WebP images are supported.'), { status: 400, code: 'BAD_IMAGE_TYPE' });
  }
  return s3.getUploadUrl({ folder: 'lens', contentType, userId });
}

/** Keep only matches whose code exists in the catalog; enrich + clamp. */
function validateMatches(rawMatches, catalogByCode) {
  if (!Array.isArray(rawMatches)) return [];
  const seen = new Set();
  const out = [];
  for (const m of rawMatches) {
    const code = String(m?.service_code || '').toLowerCase().trim();
    const cat = catalogByCode.get(code);
    if (!cat || seen.has(code)) continue;
    seen.add(code);
    out.push({
      serviceCode: code,
      name: cat.name,
      category: cat.category,
      confidence: Math.max(0, Math.min(1, Number(m.confidence) || 0)),
      severity: ['low', 'moderate', 'high'].includes(m.severity) ? m.severity : 'unknown',
      issueSummary: String(m.issue_summary || '').slice(0, 240),
      notesForWorker: String(m.notes_for_worker || '').slice(0, 500),
      priceHintMin: cat.priceMin,
      priceHintMax: cat.priceMax,
      quote: { total: null, currency: 'INR', etaMinutes: null, surge: null },
    });
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out.slice(0, 3);
}

/** Real quote from the pricing engine for the top match (best-effort). */
async function attachQuote(match, location, userId) {
  if (!match || !location || location.lat == null || location.lng == null) return;
  try {
    const q = await pricingService.quote({
      origin: { lat: location.lat, lng: location.lng },
      dest: { lat: location.lat + 0.00045, lng: location.lng }, // ~50m nominal, same as booking
      service: match.serviceCode,
      userId,
      priority: 'normal',
    });
    if (q) {
      match.quote = {
        // The quote carries both; take the paise one.
        total: q.paise?.total ?? null,
        currency: q.currency || 'INR',
        etaMinutes: q.etaMinutes ?? null,
        surge: q.surgeMultiplier ?? null,
      };
    }
  } catch (err) {
    logger.warn({ err: err.message, service: match.serviceCode }, 'ZappyLens quote failed — using price hint');
  }
}

/** Fire-and-forget geo + demand telemetry. Never throws into the request path. */
async function recordTelemetry({ scan }) {
  try {
    const { resolveGeo } = require('../telemetry/telemetry.geo');
    const { SearchEvent } = require('../telemetry/telemetry.model');
    let geo = {};
    if (scan.location?.lat != null && scan.location?.lng != null) {
      geo = (await resolveGeo(scan.location.lat, scan.location.lng)) || {};
      if (geo.district || geo.city || geo.state) {
        await LensScan.updateOne(
          { _id: scan._id },
          { district: geo.district ?? null, city: geo.city ?? null, state: geo.state ?? null }
        );
      }
    }
    await SearchEvent.create({
      userId: scan.userId,
      userType: 'user',
      category: scan.topServiceCode || scan.detectedObject || 'unknown',
      query: scan.detectedObject || null,
      lat: scan.location?.lat ?? null,
      lng: scan.location?.lng ?? null,
      district: geo.district ?? null,
      city: geo.city ?? null,
      state: geo.state ?? null,
      result: scan.result, // 'served' | 'no_service' → feeds Unmet-Demand dashboards
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'ZappyLens telemetry failed (non-fatal)');
  }
}

/**
 * Analyze one or more uploaded images: diagnose → map to catalog → real quote →
 * persist → telemetry. Tiered: fast model first, escalate to the smart model
 * only when the fast pass is unsure.
 */
async function analyze({ userId, imageKeys, location }) {
  const started = Date.now();
  const { analyzeImage } = require('./openrouter.service');

  const catalog = await getCatalog();
  if (!catalog.length) {
    throw Object.assign(new Error('Service catalog is empty.'), { status: 503, code: 'CATALOG_EMPTY' });
  }
  const catalogByCode = new Map(catalog.map((c) => [c.code, c]));

  // Presign short-lived GET URLs; the model fetches them directly (no base64).
  const imageUrls = await Promise.all(imageKeys.map((k) => s3.getViewUrl(k, 300)));

  // Run the model. On hard failure (timeout/upstream) we DON'T error to the
  // user — we degrade to popular fallbacks so the screen always has something
  // bookable. ZappyLens never shows a dead-end.
  let parsed = null, model = '', matches = [], escalated = false, modelFailed = false;
  try {
    const first = await analyzeImage({ imageUrls, catalog, model: config.lens.modelFast });
    parsed = first.parsed; model = first.model;
    matches = validateMatches(parsed?.matches, catalogByCode);

    // Escalate when unsure: nothing valid, or top confidence below threshold.
    const topConf = matches[0]?.confidence ?? 0;
    if (matches.length === 0 || topConf < config.lens.confidenceThreshold) {
      try {
        const smart = await analyzeImage({ imageUrls, catalog, model: config.lens.modelSmart });
        const smartMatches = validateMatches(smart.parsed?.matches, catalogByCode);
        if (smartMatches.length && (smartMatches[0].confidence >= topConf || matches.length === 0)) {
          parsed = smart.parsed; matches = smartMatches; model = smart.model; escalated = true;
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'ZappyLens escalation failed — keeping fast result');
      }
    }
  } catch (err) {
    modelFailed = true;
    logger.warn({ err: err.message }, 'ZappyLens model failed — serving popular fallbacks');
  }

  const isServiceable = matches.length > 0;
  const result = isServiceable ? 'served' : 'no_service';
  const topServiceCode = matches[0]?.serviceCode || null;
  const imageQuality = modelFailed ? 'unclear' : (parsed?.image_quality || 'good');

  // Real quote for the top match.
  if (isServiceable) await attachQuote(matches[0], location, userId);

  // Always-present popular services — shown when we have no/low-confidence match.
  const fallbacks = buildFallbacks(catalog, catalogByCode);
  const hint = computeHint({ isServiceable, imageQuality, modelFailed });

  const scan = await LensScan.create({
    userId,
    imageKeys,
    location: location || { lat: null, lng: null },
    detectedObject: String(parsed?.detected_object || '').slice(0, 200),
    isServiceable,
    matches,
    topServiceCode,
    result,
    imageQuality,
    hint,
    model,
    escalated,
    latencyMs: Date.now() - started,
  });

  // Best-effort, do not block the response.
  recordTelemetry({ scan });

  return {
    scanId: String(scan._id),
    detectedObject: scan.detectedObject,
    isServiceable,
    result,
    topServiceCode,
    imageQuality,
    hint,
    matches,
    fallbacks,   // popular bookable services — never an empty screen
  };
}

// Popular, high-demand services to surface when the scan is unclear/unmatched.
const PRIORITY_FALLBACK_CODES = [
  'screen_replacement', 'puncture', 'car_wash', 'laptop_slow',
  'bike_service', 'battery_replacement', 'cctv_install', 'car_detailing',
];
function toCard(c) {
  return {
    serviceCode: c.code, name: c.name, category: c.category,
    confidence: null, severity: 'unknown', issueSummary: '', notesForWorker: '',
    priceHintMin: c.priceMin, priceHintMax: c.priceMax,
    quote: { total: null, currency: 'INR', etaMinutes: null, surge: null },
    fromFallback: true,
  };
}
function buildFallbacks(catalog, catalogByCode, n = 4) {
  const chosen = [];
  const usedCat = new Set();
  const add = (c) => {
    if (!c || chosen.length >= n || chosen.find((x) => x.code === c.code)) return;
    chosen.push(c); usedCat.add(c.category);
  };
  for (const code of PRIORITY_FALLBACK_CODES) { if (chosen.length >= n) break; add(catalogByCode.get(code)); }
  for (const c of catalog) { if (chosen.length >= n) break; if (!usedCat.has(c.category)) add(c); } // variety
  for (const c of catalog) { if (chosen.length >= n) break; add(c); }                               // pad
  return chosen.map(toCard);
}
function computeHint({ isServiceable, imageQuality, modelFailed }) {
  if (modelFailed) return "We couldn't analyze that photo just now — here are popular services you can book.";
  if (isServiceable) {
    if (imageQuality === 'blurry') return 'Best read below — the photo was a little blurry, so retake for a more exact match if needed.';
    if (imageQuality === 'dark')   return "Best read below — it was a bit dark, but here's what we found.";
    return null;
  }
  if (imageQuality === 'blurry')       return 'That looked a bit blurry — retake in better focus, or pick a popular service below.';
  if (imageQuality === 'dark')         return 'That was a little dark — try better lighting, or pick a service below.';
  if (imageQuality === 'not_relevant') return "That doesn't look like something we service — here's what people usually book.";
  return "We couldn't pin down an exact match — here are popular services to get you started.";
}

/** Owner-scoped scan read (for the booking page to hydrate notes + photo). */
async function getScan({ scanId, userId }) {
  const scan = await LensScan.findById(scanId).lean();
  if (!scan || String(scan.userId) !== String(userId)) return null;
  const imageUrls = await Promise.all((scan.imageKeys || []).map((k) => s3.getViewUrl(k, 3600).catch(() => null)));
  return { ...scan, scanId: String(scan._id), imageUrls: imageUrls.filter(Boolean) };
}

module.exports = { getUploadTarget, analyze, getScan, getCatalog };
