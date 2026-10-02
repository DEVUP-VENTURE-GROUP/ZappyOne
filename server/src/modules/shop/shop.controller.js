const Shop = require('./shop.model');
const shopService = require('./shop.service');

// Own profile

async function getMe(req, res, next) {
  try {
    const shop = await Shop.findById(req.auth.sub).lean();
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    /*
     * `openNow` is computed HERE, from India's clock, and sent to the owner —
     * the identical value customers are given. The dashboard used to work it
     * out itself in the browser, so the two could disagree about whether the
     * shop was trading.
     */
    res.json({ shop: shopService.withOpenState(await shopService.resolveShopImages(shop)) });
  } catch (err) { next(err); }
}

async function updateProfile(req, res, next) {
  try {
    const shop = await shopService.updateProfile(req.auth.sub, req.body);
    res.json({ shop });
  } catch (err) { next(err); }
}

// KYC — simpler v1 shape than worker's (submit → admin approve/reject →
// resubmit on rejection). No change-request/suspension machinery yet; add it
// if shop KYC abuse turns out to need it, same as worker's did.

async function getKycStatus(req, res, next) {
  try {
    const shop = await Shop.findById(req.auth.sub).select('kyc').lean();
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    res.json({ kyc: shop.kyc || { status: 'not_submitted' } });
  } catch (err) { next(err); }
}

async function submitKyc(req, res, next) {
  try {
    const shop = await Shop.findById(req.auth.sub).select('kyc').lean();
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    if (shop.kyc?.status === 'pending_review') {
      return res.status(409).json({ error: 'KYC already submitted and under review', code: 'KYC_PENDING' });
    }
    if (shop.kyc?.status === 'approved') {
      return res.status(409).json({ error: 'Shop is already verified', code: 'KYC_ALREADY_APPROVED' });
    }
    if (shop.kyc?.status === 'suspended') {
      return res.status(403).json({ error: 'KYC submissions suspended. Contact support.', code: 'KYC_SUSPENDED' });
    }

    const { ownerIdUrl, shopPhotoUrl, selfieUrl, gstCertificateUrl, businessRegistrationUrl, gstNumber, panNumber } = req.body;
    if (!ownerIdUrl || !shopPhotoUrl || !selfieUrl) {
      return res.status(400).json({ error: 'Owner ID, shop photo and selfie are required', code: 'KYC_DOCS_REQUIRED' });
    }

    await Shop.updateOne({ _id: req.auth.sub }, {
      $set: {
        'kyc.status': 'pending_review',
        'kyc.ownerIdUrl': ownerIdUrl,
        'kyc.shopPhotoUrl': shopPhotoUrl,
        'kyc.selfieUrl': selfieUrl,
        'kyc.gstCertificateUrl': gstCertificateUrl || undefined,
        'kyc.businessRegistrationUrl': businessRegistrationUrl || undefined,
        'kyc.gstNumber': gstNumber || undefined,
        'kyc.panNumber': panNumber || undefined,
        'kyc.submittedAt': new Date(),
        'kyc.reviewedAt': null,
        'kyc.reviewNote': null,
      },
    });
    res.json({ ok: true, status: 'pending_review' });
  } catch (err) { next(err); }
}

// Owner's worker roster

async function addWorker(req, res, next) {
  try {
    const result = await shopService.addWorkerToShop(req.auth.sub, req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function listWorkers(req, res, next) {
  try {
    const workers = await shopService.listShopWorkers(req.auth.sub);
    res.json({ workers });
  } catch (err) { next(err); }
}

async function removeWorker(req, res, next) {
  try {
    const worker = await shopService.removeWorkerFromShop(req.auth.sub, req.params.workerId);
    res.json({ worker });
  } catch (err) { next(err); }
}

async function getEarnings(req, res, next) {
  try {
    const earnings = await shopService.getShopEarnings(req.auth.sub, req.query.range);
    res.json(earnings);
  } catch (err) { next(err); }
}

// Customer-facing discovery — public-ish (any authenticated user)

async function listNearby(req, res, next) {
  try {
    const { lat, lng, service, radiusKm } = req.query;
    if (lat == null || lng == null) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }
    const { shops, services } = await shopService.findNearbyShops({
      lat: Number(lat), lng: Number(lng), service,
      radiusKm: radiusKm ? Number(radiusKm) : undefined,
    });
    res.json({ shops, services });
  } catch (err) { next(err); }
}

async function getPublicProfile(req, res, next) {
  try {
    const shop = await shopService.getShopProfile(req.params.id);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    res.json({ shop });
  } catch (err) { next(err); }
}

module.exports = {
  getMe, updateProfile, getKycStatus, submitKyc,
  addWorker, listWorkers, removeWorker, getEarnings,
  listNearby, getPublicProfile,
};
