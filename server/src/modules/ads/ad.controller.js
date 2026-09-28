const adService = require('./ad.service');
const AdWallet  = require('./ad-wallet.model');

// Public / user-facing

async function getActive(req, res, next) {
  try {
    const audience = req.auth?.role === 'worker' ? 'workers' : 'users';
    const ads = await adService.getActiveAds({ audience, limit: 8 });
    res.json({ ads });
  } catch (err) { next(err); }
}

/** GET /api/ads/placement/:placement?city=&category=&q= */
async function getByPlacement(req, res, next) {
  try {
    const { placement } = req.params;
    const { city, category, q, limit = 3 } = req.query;
    const ads = await adService.getAdsByPlacement({
      placement,
      city,
      categoryId: category,
      keywords:   q,
      userId:     req.auth?.sub,
      limit:      Math.min(Number(limit) || 3, 10),
    });
    res.json({ ads });
  } catch (err) { next(err); }
}

async function impression(req, res, next) {
  try {
    await adService.recordImpression(req.params.id, {
      userId:    req.auth?.sub,
      ip:        req.ip,
      ua:        req.headers['user-agent'],
      placement: req.body?.placement,
      meta:      req.body?.meta,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function click(req, res, next) {
  try {
    const result = await adService.recordClick(req.params.id, {
      userId:    req.auth?.sub,
      ip:        req.ip,
      ua:        req.headers['user-agent'],
      placement: req.body?.placement,
      meta:      req.body?.meta,
    });
    res.json(result);
  } catch (err) { next(err); }
}

// Self-serve advertiser (event_partner)

async function myList(req, res, next) {
  try {
    const result = await adService.advertiserList(req.auth.sub, {
      page: Number(req.query.page) || 1,
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function myCreate(req, res, next) {
  try {
    const advertiser = {
      id:   req.auth.sub,
      kind: req.auth.role === 'event_partner' ? 'event_partner' : 'external',
      name: req.body._advertiserName || '',
    };
    delete req.body._advertiserName;
    const ad = await adService.advertiserCreate(req.body, advertiser);
    res.status(201).json({ ad });
  } catch (err) { next(err); }
}

async function myUpdate(req, res, next) {
  try {
    const ad = await adService.advertiserUpdate(req.params.id, req.auth.sub, req.body);
    if (!ad) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ ad });
  } catch (err) { next(err); }
}

async function myAnalytics(req, res, next) {
  try {
    const ad = await require('./ad.model').findOne({ _id: req.params.id, 'advertiser.id': req.auth.sub }).lean();
    if (!ad) return res.status(404).json({ error: 'Campaign not found' });
    const analytics = await adService.getCampaignAnalytics(req.params.id, Number(req.query.days) || 7);
    res.json({ ad, analytics });
  } catch (err) { next(err); }
}

// Advertiser wallet

async function myWallet(req, res, next) {
  try {
    const wallet = await adService.getWallet(req.auth.sub);
    res.json({ wallet });
  } catch (err) { next(err); }
}

async function createTopUpOrder(req, res, next) {
  try {
    const amountPaise = Number(req.body.amountPaise);
    if (!Number.isInteger(amountPaise) || amountPaise < 10000) {
      return res.status(400).json({ error: 'Minimum top-up is ₹100', code: 'TOPUP_MIN' });
    }

    const crypto   = require('crypto');
    const cashfree = require('../payment/cashfree.client');
    const config   = require('../../config');

    // Resolve advertiser contact for Cashfree's required customer_phone
    let customer = { id: String(req.auth.sub), phone: '9999999999', email: 'noreply@zappy.in' };
    try {
      const Advertiser = req.auth.role === 'partner'
        ? require('../partner/partner.model')
        : require('../user/user.model');
      const doc = await Advertiser.findById(req.auth.sub).select('name phone email businessName').lean();
      customer = {
        id:    String(req.auth.sub),
        phone: doc?.phone || '9999999999',
        email: doc?.email || 'noreply@zappy.in',
        name:  doc?.name || doc?.businessName || undefined,
      };
    } catch { /* fail open */ }

    const cfOrderId = `zpy_adwlt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const cfOrder = await cashfree.createOrder({
      orderId:     cfOrderId,
      amountPaise,
      customer,
      tags: { purpose: 'ad_wallet_topup', advertiserId: String(req.auth.sub), kind: req.auth.role },
    });

    // Store the pending top-up in Redis so verify can confirm it
    const { redis } = require('../../config/redis');
    await redis.set(
      `adtopup:${cfOrderId}`,
      JSON.stringify({ advertiserId: String(req.auth.sub), advertiserKind: req.auth.role, amountPaise }),
      'EX', 3600 // 1h TTL — if not verified in 1h, discard
    );

    res.status(201).json({
      cfOrderId,
      paymentSessionId: cfOrder.payment_session_id,
      amountPaise,
      currency: 'INR',
      cashfreeEnv: config.cashfree.env,
    });
  } catch (err) { next(err); }
}

async function verifyTopUp(req, res, next) {
  try {
    const { cfOrderId, cfPaymentId } = req.body;
    if (!cfOrderId || !cfPaymentId) {
      return res.status(400).json({ error: 'cfOrderId and cfPaymentId required' });
    }

    const cashfree = require('../payment/cashfree.client');
    const { redis } = require('../../config/redis');

    // Retrieve pending top-up meta
    const raw = await redis.get(`adtopup:${cfOrderId}`);
    if (!raw) return res.status(404).json({ error: 'Top-up session expired or not found', code: 'SESSION_EXPIRED' });
    const { advertiserId, advertiserKind, amountPaise } = JSON.parse(raw);

    // Only the advertiser who created the order can verify it
    if (advertiserId !== String(req.auth.sub)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Confirm with Cashfree API
    let payments;
    try {
      payments = await cashfree.getOrderPayments(cfOrderId);
    } catch {
      return res.status(502).json({ error: 'Could not verify payment with gateway' });
    }
    const successful = Array.isArray(payments)
      ? payments.find((p) => p.payment_status === 'SUCCESS' && String(p.cf_payment_id) === String(cfPaymentId))
      : null;
    if (!successful) {
      return res.status(400).json({ error: 'Payment not confirmed by gateway', code: 'PAYMENT_NOT_CONFIRMED' });
    }

    // Idempotency — check Redis lock to prevent double-credit
    const idempKey = `adtopup:applied:${cfPaymentId}`;
    const claimed  = await redis.set(idempKey, '1', 'NX', 'EX', 86400);
    if (!claimed) {
      return res.json({ ok: true, alreadyApplied: true });
    }

    await adService.topUpWallet({
      advertiserId,
      advertiserKind,
      amountPaise,
      ref: cfPaymentId,
    });

    // Clean up the pending session key
    redis.del(`adtopup:${cfOrderId}`).catch(() => {});

    const logger = require('../../utils/logger');
    logger.info({ advertiserId, amountPaise, cfPaymentId }, '[AdWallet] Top-up applied');

    res.json({ ok: true, amountPaise, amountRupees: Math.round(amountPaise / 100) });
  } catch (err) { next(err); }
}

// Admin

async function adminList(req, res, next) {
  try {
    const { status, audience, page = 1 } = req.query;
    const result = await adService.listAll({ status, audience, page: Number(page) });
    res.json(result);
  } catch (err) { next(err); }
}

async function adminCreate(req, res, next) {
  try {
    const ad = await adService.create({ ...req.body, createdBy: req.auth.sub, status: req.body.status || 'active' });
    res.status(201).json({ ad });
  } catch (err) { next(err); }
}

async function adminUpdate(req, res, next) {
  try {
    const ad = await adService.update(req.params.id, req.body);
    if (!ad) return res.status(404).json({ error: 'Not found' });
    // Bust cache on status change
    if (req.body.status) {
      const { redis } = require('../../config/redis');
      await redis.keys('ads:p:*').then(ks => ks.length && redis.del(...ks)).catch(() => {});
    }
    res.json({ ad });
  } catch (err) { next(err); }
}

async function adminDelete(req, res, next) {
  try {
    await adService.remove(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function adminApprove(req, res, next) {
  try {
    const ad = await adService.adminApprove(req.params.id, req.auth.sub);
    if (!ad) return res.status(404).json({ error: 'Not found' });
    res.json({ ad });
  } catch (err) { next(err); }
}

async function adminReject(req, res, next) {
  try {
    const ad = await adService.adminReject(req.params.id, req.body.note || 'Rejected by admin');
    res.json({ ad });
  } catch (err) { next(err); }
}

async function adminCampaignAnalytics(req, res, next) {
  try {
    const analytics = await adService.getCampaignAnalytics(req.params.id, Number(req.query.days) || 7);
    res.json(analytics);
  } catch (err) { next(err); }
}

async function adminAllWallets(req, res, next) {
  try {
    const page  = Number(req.query.page) || 1;
    const limit = 20;
    const [wallets, total] = await Promise.all([
      AdWallet.find().sort({ lifetimeSpentPaise: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AdWallet.countDocuments(),
    ]);
    res.json({ wallets, total, page });
  } catch (err) { next(err); }
}

async function adminAdjustWallet(req, res, next) {
  try {
    const { advertiserId, amountPaise, note } = req.body;
    const wallet = await adService.topUpWallet({ advertiserId, amountPaise, ref: 'admin_adjustment' });
    res.json({ wallet });
  } catch (err) { next(err); }
}

module.exports = {
  // Public
  getActive, getByPlacement, impression, click,
  // Self-serve
  myList, myCreate, myUpdate, myAnalytics,
  myWallet, createTopUpOrder, verifyTopUp,
  // Admin
  adminList, adminCreate, adminUpdate, adminDelete,
  adminApprove, adminReject, adminCampaignAnalytics,
  adminAllWallets, adminAdjustWallet,
};
