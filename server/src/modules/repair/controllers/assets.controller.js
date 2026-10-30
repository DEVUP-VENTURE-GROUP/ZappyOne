const Brand = require('../../service/brand.model');
const DeviceModel = require('../../service/device-model.model');
const { RepairBooking } = require('../models/booking.model');
const s3Service = require('../../../core/storage/s3');
const { CustomerAsset } = require('../models/customer-asset.model');

/** Saved assets: the customer's own devices and vehicles, with their history. */

/* Saved assets — "my tank", "my phone", "my car" (§27) */

/**
 * The customer's saved things, with the real catalog names attached.
 *
 * Names are resolved on read rather than stored, so a tank type renamed in
 * admin is renamed here too and an asset can never describe a model that no
 * longer exists.
 */
async function listMyAssets(req, res, next) {
  try {
    const filter = { userId: req.auth.sub, isArchived: false };
    if (req.query.vertical) filter.vertical = String(req.query.vertical).toLowerCase();

    const assets = await CustomerAsset.find(filter).sort({ updatedAt: -1 }).lean();
    if (!assets.length) return res.json({ assets: [] });

    const [brands, models] = await Promise.all([
      Brand.find({ code: { $in: assets.map((a) => a.brandCode) } }).select('code name').lean(),
      DeviceModel.find({ code: { $in: assets.map((a) => a.modelCode).filter(Boolean) } })
        .select('code name').lean(),
    ]);
    const brandName = new Map(brands.map((b) => [b.code, b.name]));
    const modelName = new Map(models.map((m) => [m.code, m.name]));

    /*
     * Last service is READ off the bookings, never stored on the asset — a
     * copy would drift the first time a booking was cancelled or backdated.
     */
    const lastByKey = new Map();
    const bookings = await RepairBooking.find({
      userId: req.auth.sub, status: 'COMPLETED',
    }).select('vertical brandCode modelCode completedAt repairCode').sort({ completedAt: -1 }).lean();
    for (const b of bookings) {
      const key = `${b.vertical}|${b.brandCode}|${b.modelCode}`;
      if (!lastByKey.has(key)) lastByKey.set(key, b);
    }

    const signed = await s3Service.signDocsMedia(assets);

    res.json({
      assets: signed.map((a) => {
        const last = lastByKey.get(`${a.vertical}|${a.brandCode}|${a.modelCode}`);
        return {
          ...a,
          brandName: brandName.get(a.brandCode) || a.brandCode,
          modelName: modelName.get(a.modelCode) || a.modelCode || null,
          // The customer's own stated date is a fallback for work done before
          // they ever used Zappy; a real booking always wins.
          lastServicedAt: last?.completedAt || a.lastServicedAt || null,
          lastRepairCode: last?.repairCode || null,
        };
      }),
    });
  } catch (err) { next(err); }
}

async function createMyAsset(req, res, next) {
  try {
    const { lat, lng, address, ...rest } = req.body;
    const asset = await CustomerAsset.create({
      ...rest,
      userId: req.auth.sub,
      photos: (req.body.photos || []).map((v) => s3Service.keyFromMedia(v)).filter(Boolean),
      location: lat != null && lng != null
        ? { type: 'Point', coordinates: [lng, lat], address: address || '' }
        : undefined,
    });
    res.status(201).json({ asset });
  } catch (err) { next(err); }
}

async function updateMyAsset(req, res, next) {
  try {
    const { lat, lng, address, ...rest } = req.body;
    const patch = { ...rest };
    if (req.body.photos) {
      patch.photos = req.body.photos.map((v) => s3Service.keyFromMedia(v)).filter(Boolean);
    }
    if (lat != null && lng != null) {
      patch.location = { type: 'Point', coordinates: [lng, lat], address: address || '' };
    }

    // Scoped by userId — an id alone must never be enough to edit someone
    // else's asset (§37, IDOR).
    const asset = await CustomerAsset.findOneAndUpdate(
      { _id: req.params.id, userId: req.auth.sub },
      { $set: patch },
      { new: true },
    ).lean();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json({ asset });
  } catch (err) { next(err); }
}

/** Archived, not deleted — bookings reference what it was. */
async function archiveMyAsset(req, res, next) {
  try {
    const asset = await CustomerAsset.findOneAndUpdate(
      { _id: req.params.id, userId: req.auth.sub },
      { $set: { isArchived: true } },
      { new: true },
    ).lean();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/** Every completed job on one asset — the service history in §27. */
async function getAssetHistory(req, res, next) {
  try {
    const asset = await CustomerAsset.findOne({ _id: req.params.id, userId: req.auth.sub }).lean();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const bookings = await RepairBooking.find({
      userId: req.auth.sub,
      vertical: asset.vertical,
      brandCode: asset.brandCode,
      ...(asset.modelCode ? { modelCode: asset.modelCode } : {}),
      status: { $in: ['COMPLETED', 'CANCELLED'] },
    })
      .select('reference status repairCode addOns priceSnapshot completedAt createdAt rating')
      .sort({ completedAt: -1, createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ asset, bookings });
  } catch (err) { next(err); }
}

module.exports = {
  listMyAssets,
  createMyAsset,
  updateMyAsset,
  archiveMyAsset,
  getAssetHistory,
};
