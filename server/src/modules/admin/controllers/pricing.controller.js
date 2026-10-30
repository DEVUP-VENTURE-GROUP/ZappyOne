const Order = require('../../order/order.model');
const { redis } = require('../../../config/redis');
const auditService = require('../audit.service');

async function toggleDispatch(req, res, next) {
  try {
    const pricingService = require('../../pricing/pricing.service');
    const { dispatchEnabled } = req.body;
    await pricingService.updateActiveConfig({ dispatchEnabled }, req.auth.sub);
    await auditService.fromRequest(
      req,
      'admin.dispatch_toggle',
      { kind: 'system', id: null },
      null,
      { dispatchEnabled },
    );
    const activeOrderCount = await Order.countDocuments({
      status: { $in: ['created', 'searching'] },
    });
    res.json({
      dispatchEnabled,
      activeOrderCount,
      message: dispatchEnabled
        ? 'Dispatch enabled — queued orders will resume processing'
        : `Dispatch paused — ${activeOrderCount} order(s) will re-queue every 60s until re-enabled`,
    });
  } catch (err) {
    next(err);
  }
}

async function updateToggles(req, res, next) {
  try {
    const pricingService = require('../../pricing/pricing.service');
    const updated = await pricingService.updateActiveConfig(
      req.body,
      req.auth.sub,
    );
    await auditService.fromRequest(
      req,
      'admin.toggles_update',
      { kind: 'system', id: null },
      null,
      req.body,
    );
    res.json({ pricing: updated });
  } catch (err) {
    next(err);
  }
}

async function getPricingConfig(req, res, next) {
  try {
    const raw = await redis.get('config:pricing');
    res.json(raw ? JSON.parse(raw) : {});
  } catch (err) {
    next(err);
  }
}

async function setPricingConfig(req, res, next) {
  try {
    const pricingService = require('../../pricing/pricing.service');
    const beforeRaw = await redis.get('config:pricing');
    const before = beforeRaw ? JSON.parse(beforeRaw) : {};
    // Write display snapshot (used by admin UI reads) with short TTL matching the pricing engine
    await redis.set('config:pricing', JSON.stringify(req.body), 'EX', 120);
    // Also push through updateActiveConfig so MongoDB + config:pricing:active stay in sync
    await pricingService.updateActiveConfig(req.body, req.auth.sub);
    await auditService.fromRequest(
      req,
      'admin.pricing_config_update',
      { kind: 'system', id: null },
      before,
      req.body,
    );
    res.json({ ok: true, config: req.body });
  } catch (err) {
    next(err);
  }
}

async function getCancellationConfig(req, res, next) {
  try {
    const cancellationService = require('../../order/cancellation.service');
    const cfg = await cancellationService.getConfig();
    res.json({ config: cfg });
  } catch (err) {
    next(err);
  }
}

async function updateCancellationConfig(req, res, next) {
  try {
    const cancellationService = require('../../order/cancellation.service');
    const before = await cancellationService.getConfig();
    const updated = await cancellationService.updateConfig(
      req.body,
      req.auth.sub,
    );
    await auditService.fromRequest(
      req,
      'admin.cancellation_config_update',
      { kind: 'system', id: null },
      before,
      req.body,
    );
    res.json({ config: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  toggleDispatch,
  updateToggles,
  getPricingConfig,
  setPricingConfig,
  getCancellationConfig,
  updateCancellationConfig,
};
