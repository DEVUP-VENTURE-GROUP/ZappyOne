const pricingService = require('./pricing.service');

async function getConfig(req, res, next) {
  try {
    const cfg = await pricingService.getActiveConfig();
    res.json({ pricing: cfg });
  } catch (err) { next(err); }
}

async function adminUpdateConfig(req, res, next) {
  try {
    const updated = await pricingService.updateActiveConfig(req.body, req.auth.sub);
    res.json({ pricing: updated });
  } catch (err) { next(err); }
}

/**
 * Surge Transparency — returns live demand/supply data for a location.
 * This is the data that powers the customer-facing "why is it expensive?" explainer
 * and the worker-facing "your area is surging" feed.
 */
async function getSurgeInfo(req, res, next) {
  try {
    const { redis } = require('../../config/redis');
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng required' });
    }

    const cfg = await pricingService.getActiveConfig();
    const { multiplier: surge, factors: surgeFactors } = await pricingService.computeSurgeBreakdown(lat, lng, cfg);

    /* Raw demand/supply from same bucket used by computeSurge */
    const bucket = `${Math.round(lat * 50) / 50}:${Math.round(lng * 50) / 50}`;
    const [demandRaw, supplyRaw] = await Promise.all([
      redis.get(`demand:${bucket}`).then(v => Number(v) || 0),
      redis.scard(`supply:${bucket}`).then(v => Number(v) || 0),
    ]);

    /* Surge history — last 3 hours at 15-min resolution from Redis time-series */
    const historyKeys = [];
    for (let i = 11; i >= 0; i--) {
      const ts = Math.floor((Date.now() - i * 15 * 60000) / (15 * 60000));
      historyKeys.push(`surge:hist:${bucket}:${ts}`);
    }
    const histRaw = await Promise.all(historyKeys.map(k => redis.get(k).catch(() => null)));
    const history = histRaw.map((v, i) => ({
      minutesAgo: i * 15,
      surge: v ? parseFloat(v) : 1.0,
    })).reverse();

    /* Record current surge into history */
    const nowTs = Math.floor(Date.now() / (15 * 60000));
    await redis.setex(`surge:hist:${bucket}:${nowTs}`, 7200, String(surge)).catch(() => {});

    /* Estimate minutes until surge clears (rough: demand decays ~30% every 5 min naturally) */
    let etaToClearMin = null;
    if (surge > 1.0 && demandRaw > 0) {
      const ratio = demandRaw / Math.max(supplyRaw, 1);
      etaToClearMin = ratio < 1.5 ? 5 : ratio < 2.5 ? 10 : ratio < 4 ? 20 : 30;
    }

    /* Human-readable reason */
    let reason = null;
    if (surge >= 2.0) reason = `Very high demand (${demandRaw} requests) with only ${supplyRaw} workers online`;
    else if (surge >= 1.5) reason = `High demand — ${demandRaw} active requests, ${supplyRaw} workers available`;
    else if (surge >= 1.2) reason = `Moderate demand spike in your area`;
    else reason = 'Normal demand — standard pricing applies';

    res.json({
      surge,
      surgeEnabled: cfg.surgeEnabled,
      surgeFactors,
      demand: demandRaw,
      supply: supplyRaw,
      ratio: supplyRaw > 0 ? Math.round((demandRaw / supplyRaw) * 10) / 10 : null,
      reason,
      etaToClearMin,
      history,
      isNormalPricing: surge <= 1.0,
    });
  } catch (err) { next(err); }
}

module.exports = { getConfig, adminUpdateConfig, getSurgeInfo };
