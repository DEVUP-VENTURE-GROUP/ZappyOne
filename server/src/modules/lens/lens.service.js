const config = require('../../config');
const logger = require('../../core/logger');
const s3 = require('../../core/storage/s3');
const { getCorpus } = require('../search/search.corpus');
const { liveLinesAt } = require('../search/search.service');
const LensScan = require('./lens-scan.model');

/**
 * What the model may choose from: live services and their specific problems,
 * limited to what's served at the customer's location. Codes are the search
 * index ids, and each carries the path that opens the right booking flow.
 */
async function getCatalog(location) {
  const [corpus, here] = await Promise.all([getCorpus(), liveLinesAt(location?.lat, location?.lng)]);
  return corpus
    .filter((e) => (e.type === 'service' || e.type === 'problem') && (!here || here.codes.has(e.lineCode)))
    .map((e) => ({
      code: e.code, name: e.title, category: e.subtitle, description: '',
      path: e.path, lineCode: e.lineCode, type: e.type, isPopular: e.isPopular,
    }));
}

/** Client requests a presigned PUT; uploads the photo straight to S3. */
async function getUploadTarget({ userId, contentType }) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(contentType)) {
    throw Object.assign(new Error('Only JPEG, PNG, or WebP images are supported.'), { status: 400, code: 'BAD_IMAGE_TYPE' });
  }
  return s3.getUploadUrl({ folder: 'lens', contentType, userId });
}

/** Keep only matches whose code exists in the catalog; clamp the rest. */
function validateMatches(rawMatches, catalogByCode) {
  if (!Array.isArray(rawMatches)) return [];
  const seen = new Set();
  const out = [];
  for (const m of rawMatches) {
    const code = String(m?.service_code || '').trim();
    const cat = catalogByCode.get(code);
    if (!cat || seen.has(code)) continue;
    seen.add(code);
    out.push({
      serviceCode: code,
      lineCode: cat.lineCode,
      name: cat.name,
      category: cat.category,
      path: cat.path,
      confidence: Math.max(0, Math.min(1, Number(m.confidence) || 0)),
      severity: ['low', 'moderate', 'high'].includes(m.severity) ? m.severity : 'unknown',
      issueSummary: String(m.issue_summary || '').slice(0, 240),
      notesForWorker: String(m.notes_for_worker || '').slice(0, 500),
    });
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out.slice(0, 3);
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

  const catalog = await getCatalog(location);
  if (!catalog.length) {
    throw Object.assign(new Error('Nothing is bookable at this location yet.'), { status: 409, code: 'NOTHING_LIVE_HERE' });
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
  // Demand is counted per service line, the same unit Home and search record.
  const topServiceCode = matches[0]?.lineCode || null;
  const imageQuality = modelFailed ? 'unclear' : (parsed?.image_quality || 'good');

  // Always-present popular services — shown when we have no/low-confidence match.
  const fallbacks = buildFallbacks(catalog);
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

/** When the photo can't be matched: services live here, the popular ones first. */
function buildFallbacks(catalog, n = 4) {
  return catalog
    .filter((c) => c.type === 'service')
    .sort((a, b) => Number(b.isPopular) - Number(a.isPopular))
    .slice(0, n)
    .map((c) => ({
      serviceCode: c.code, lineCode: c.lineCode, name: c.name, category: c.category, path: c.path,
      confidence: null, severity: 'unknown', issueSummary: '', notesForWorker: '', fromFallback: true,
    }));
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
