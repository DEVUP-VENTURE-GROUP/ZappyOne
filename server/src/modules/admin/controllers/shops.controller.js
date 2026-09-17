const Shop = require('../../shop/shop.model');
const auditService = require('../audit.service');

async function listShops(req, res, next) {
  try {
    const { q, kycStatus, blocked, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (q) {
      filter.$or = [
        { businessName: new RegExp(q, 'i') },
        { ownerName: new RegExp(q, 'i') },
        { phone: new RegExp(q, 'i') },
      ];
    }
    if (kycStatus) filter['kyc.status'] = kycStatus;
    if (blocked !== undefined) filter.isBlocked = blocked === 'true';

    const [shops, total] = await Promise.all([
      Shop.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean(),
      Shop.countDocuments(filter),
    ]);
    res.json({ shops, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
}

async function listKycPending(req, res, next) {
  try {
    const shops = await Shop.find({ 'kyc.status': 'pending_review' }).sort({ 'kyc.submittedAt': 1 }).lean();
    res.json({ shops });
  } catch (err) { next(err); }
}

async function getShop(req, res, next) {
  try {
    const shop = await Shop.findById(req.params.id).lean();
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    res.json({ shop });
  } catch (err) { next(err); }
}

async function approveKyc(req, res, next) {
  try {
    const before = await Shop.findById(req.params.id).select('kyc').lean();
    if (!before) return res.status(404).json({ error: 'Shop not found' });

    const shop = await Shop.findByIdAndUpdate(
      req.params.id,
      { $set: { 'kyc.status': 'approved', 'kyc.reviewedAt': new Date(), 'kyc.reviewedBy': req.auth.sub, 'kyc.reviewNote': null } },
      { new: true },
    );

    await auditService.fromRequest(req, 'admin.shop_kyc_approve', { kind: 'shop', id: req.params.id }, before.kyc, shop.kyc);

    try {
      const notifService = require('../../notification/notification.service');
      await notifService.notify({
        recipient: { kind: 'shop', id: req.params.id },
        type: 'shop_kyc_approved',
        title: '✅ Shop verified!',
        body: 'Your shop is verified. Complete your profile (services, address) to start appearing in Nearby Shops.',
        deepLink: '/shop/profile',
        data: { kycStatus: 'approved' },
      });
    } catch { /* non-fatal */ }

    res.json({ shop });
  } catch (err) { next(err); }
}

async function rejectKyc(req, res, next) {
  try {
    const before = await Shop.findById(req.params.id).select('kyc').lean();
    if (!before) return res.status(404).json({ error: 'Shop not found' });
    const { reason } = req.body;

    const shop = await Shop.findByIdAndUpdate(
      req.params.id,
      { $set: { 'kyc.status': 'rejected', 'kyc.reviewedAt': new Date(), 'kyc.reviewedBy': req.auth.sub, 'kyc.reviewNote': reason || null } },
      { new: true },
    );

    await auditService.fromRequest(req, 'admin.shop_kyc_reject', { kind: 'shop', id: req.params.id }, before.kyc, shop.kyc);

    try {
      const notifService = require('../../notification/notification.service');
      await notifService.notify({
        recipient: { kind: 'shop', id: req.params.id },
        type: 'shop_kyc_rejected',
        title: 'Shop verification needs attention',
        body: reason || 'Your shop verification was rejected. Please review and resubmit.',
        deepLink: '/shop/kyc',
        data: { kycStatus: 'rejected' },
      });
    } catch { /* non-fatal */ }

    res.json({ shop });
  } catch (err) { next(err); }
}

/**
 * Which shop KYC docs exist. Actual images stream via kycStreamDoc — bucket
 * is private, so the client never gets a raw S3 key. Mirrors the worker
 * admin KYC doc pattern (workers.controller.js's kycDocUrls/kycStreamDoc).
 */
async function kycDocUrls(req, res, next) {
  try {
    const shop = await Shop.findById(req.params.id).select('kyc businessName phone').lean();
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    const { kyc } = shop;
    res.json({
      docs: {
        hasOwnerId: !!kyc?.ownerIdUrl,
        hasShopPhoto: !!kyc?.shopPhotoUrl,
        hasSelfie: !!kyc?.selfieUrl,
        hasBusinessRegistration: !!kyc?.businessRegistrationUrl,
        hasGstCertificate: !!kyc?.gstCertificateUrl,
      },
      gstNumber: kyc?.gstNumber ?? null,
      panNumber: kyc?.panNumber ?? null,
    });
  } catch (err) { next(err); }
}

async function kycStreamDoc(req, res, next) {
  try {
    const shop = await Shop.findById(req.params.id).select('kyc').lean();
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    const { docType } = req.params;
    const ALLOWED_DOC_TYPES = ['ownerId', 'shopPhoto', 'selfie', 'businessRegistration', 'gstCertificate'];
    if (!ALLOWED_DOC_TYPES.includes(docType)) {
      return res.status(400).json({ error: 'Invalid document type' });
    }
    const kyc = shop.kyc ?? {};
    const keyMap = {
      ownerId: kyc.ownerIdUrl,
      shopPhoto: kyc.shopPhotoUrl,
      selfie: kyc.selfieUrl,
      businessRegistration: kyc.businessRegistrationUrl,
      gstCertificate: kyc.gstCertificateUrl,
    };
    const key = keyMap[docType];
    if (!key) return res.status(404).json({ error: `No ${docType} document on file` });

    const s3Service = require('../../../utils/s3.service');
    await s3Service.streamToResponse(key, res);
  } catch (err) {
    if (err?.name === 'NoSuchKey') return res.status(404).json({ error: 'Document not found in storage' });
    next(err);
  }
}

async function blockShop(req, res, next) {
  try {
    const before = await Shop.findById(req.params.id).select('isBlocked').lean();
    if (!before) return res.status(404).json({ error: 'Shop not found' });
    const shop = await Shop.findByIdAndUpdate(req.params.id, { $set: { isBlocked: !!req.body.blocked } }, { new: true });

    await auditService.fromRequest(
      req,
      req.body.blocked ? 'admin.shop_block' : 'admin.shop_unblock',
      { kind: 'shop', id: req.params.id },
      { isBlocked: before.isBlocked },
      { isBlocked: shop.isBlocked },
    );
    res.json({ shop });
  } catch (err) { next(err); }
}

module.exports = { listShops, listKycPending, getShop, approveKyc, rejectKyc, blockShop, kycDocUrls, kycStreamDoc };
