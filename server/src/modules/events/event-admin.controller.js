const svc = require('./event.service');
const EventPartner = require('./event-partner.model');
const EventTheme   = require('./event-theme.model');

async function listThemes(req, res, next) {
  try { res.json(await svc.adminListThemes({ status: req.query.status, page: Number(req.query.page) || 1, search: req.query.search })); } catch (e) { next(e); }
}

async function updateThemeStatus(req, res, next) {
  try { res.json({ theme: await svc.adminUpdateThemeStatus(req.params.id, req.body) }); } catch (e) { next(e); }
}

async function listBookings(req, res, next) {
  try { res.json(await svc.adminListBookings({ status: req.query.status, page: Number(req.query.page) || 1 })); } catch (e) { next(e); }
}

async function listPartners(req, res, next) {
  try { res.json(await svc.adminListPartners({ page: Number(req.query.page) || 1 })); } catch (e) { next(e); }
}

async function createPartner(req, res, next) {
  try { res.status(201).json({ partner: await svc.adminCreatePartner(req.body, req.auth.sub) }); } catch (e) { next(e); }
}

async function updatePartner(req, res, next) {
  try { res.json({ partner: await svc.adminUpdatePartner(req.params.id, req.body) }); } catch (e) { next(e); }
}

async function getConfig(req, res, next) {
  try { res.json(await svc.adminGetConfig()); } catch (e) { next(e); }
}

async function updateConfig(req, res, next) {
  try { res.json(await svc.adminUpdateConfig(req.body, req.auth.sub)); } catch (e) { next(e); }
}

async function getAnalytics(req, res, next) {
  try { res.json(await svc.adminGetAnalytics()); } catch (e) { next(e); }
}

async function listCategories(req, res, next) {
  try { res.json({ categories: await svc.adminListCategories() }); } catch (e) { next(e); }
}

async function upsertCategory(req, res, next) {
  try { res.json({ category: await svc.adminUpsertCategory(req.body) }); } catch (e) { next(e); }
}

/* Partner KYC actions */

async function getPartner(req, res, next) {
  try {
    const partner = await EventPartner.findById(req.params.id).lean();
    if (!partner) return res.status(404).json({ error: 'Partner not found' });
    const themeCount = await EventTheme.countDocuments({ partnerId: partner._id });
    res.json({ partner: { ...partner, themeCount } });
  } catch (e) { next(e); }
}

async function approvePartnerKyc(req, res, next) {
  try {
    const partner = await EventPartner.findByIdAndUpdate(
      req.params.id,
      { $set: { 'kyc.status': 'approved', 'kyc.reviewedAt': new Date(), 'kyc.reviewNote': req.body.note || '' } },
      { new: true }
    ).lean();
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    // Notify partner
    try {
      const ns = require('../notification/notification.service');
      ns.notify({
        recipient: { kind: 'event_partner', id: String(partner._id) },
        type: 'kyc_approved',
        title: '✅ KYC Approved!',
        body: 'Your KYC has been approved. You can now upload themes.',
        data: { partnerId: String(partner._id) },
      }).catch(() => {});
    } catch {}

    res.json({ partner });
  } catch (e) { next(e); }
}

async function rejectPartnerKyc(req, res, next) {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Rejection reason required' });
    const partner = await EventPartner.findByIdAndUpdate(
      req.params.id,
      { $set: { 'kyc.status': 'rejected', 'kyc.reviewedAt': new Date(), 'kyc.reviewNote': reason } },
      { new: true }
    ).lean();
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    try {
      const ns = require('../notification/notification.service');
      ns.notify({
        recipient: { kind: 'event_partner', id: String(partner._id) },
        type: 'kyc_rejected',
        title: '❌ KYC Rejected',
        body: `Your KYC was rejected: ${reason}. Please re-submit with correct documents.`,
        data: { partnerId: String(partner._id) },
      }).catch(() => {});
    } catch {}

    res.json({ partner });
  } catch (e) { next(e); }
}

// Stream KYC document by array index (event partners store docs[] array of S3 keys)
async function streamPartnerKycDoc(req, res, next) {
  try {
    const partner = await EventPartner.findById(req.params.id).select('kyc').lean();
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const idx = Number(req.params.idx);
    const key = partner.kyc?.documents?.[idx];
    if (!key) return res.status(404).json({ error: 'Document not found' });

    const s3Service = require('../../core/storage/s3');
    await s3Service.streamToResponse(key, res);
  } catch (e) {
    if (e?.name === 'NoSuchKey') return res.status(404).json({ error: 'File not found in storage' });
    next(e);
  }
}

const KYC_FIELD_ALLOWLIST = ['aadharFront','aadharBack','panCard','liveSelfie','gstCertificate','businessRegistration'];
async function streamPartnerKycField(req, res, next) {
  try {
    const { fieldName } = req.params;
    if (!KYC_FIELD_ALLOWLIST.includes(fieldName)) return res.status(400).json({ error: 'Invalid field' });
    const partner = await EventPartner.findById(req.params.id).select('kyc').lean();
    if (!partner) return res.status(404).json({ error: 'Partner not found' });
    const key = partner.kyc?.[fieldName];
    if (!key) return res.status(404).json({ error: 'Document not uploaded' });
    const s3Service = require('../../core/storage/s3');
    await s3Service.streamToResponse(key, res);
  } catch (e) {
    if (e?.name === 'NoSuchKey') return res.status(404).json({ error: 'File not found in storage' });
    next(e);
  }
}

async function cancelBooking(req, res, next) {
  try {
    const EventBooking = require('./event-booking.model');
    const { reason } = req.body;
    const booking = await EventBooking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (['completed', 'cancelled'].includes(booking.status)) {
      return res.status(409).json({ error: 'Cannot cancel a completed or already-cancelled booking' });
    }
    const { paidPaiseOf } = require('./event.service');
    const refundPaise = paidPaiseOf(booking);
    booking.status = 'cancelled';
    booking.cancellationReason = reason || 'Cancelled by admin';
    booking.cancelledBy = 'admin';
    booking.refundPaise = refundPaise;
    booking.refundStatus = refundPaise > 0 ? 'pending' : 'none';
    booking.statusHistory.push({ status: 'cancelled', meta: { reason, cancelledBy: 'admin', refundPaise } });
    await booking.save();
    if (refundPaise > 0) {
      await require('../payment/payment.service').refundEventPayments({ bookingId: booking._id, reason: `Cancelled by ZappyOne: ${reason || ''}`.trim() });
    }
    require('../jobs/job-events').announce('event', booking, 'cancelled').catch(() => {});

    try {
      const ns = require('../notification/notification.service');
      ns.notify({
        recipient: { kind: 'user', id: String(booking.userId) },
        type: 'event_booking_cancelled',
        title: 'Booking Cancelled',
        body: `ZappyOne cancelled this booking${reason ? `: ${reason}` : ''}.${refundPaise > 0 ? ' Everything you paid is being refunded.' : ''}`,
        data: { bookingId: String(booking._id) },
      }).catch(() => {});
    } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
}

// Partner streams their own KYC docs
async function streamOwnKycDoc(req, res, next) {
  try {
    const partner = await EventPartner.findById(req.params.id).select('kyc').lean();
    if (!partner) return res.status(404).json({ error: 'Not found' });
    const idx = Number(req.params.idx);
    const key = partner.kyc?.documents?.[idx];
    if (!key) return res.status(404).json({ error: 'Document not found' });
    const s3Service = require('../../core/storage/s3');
    await s3Service.streamToResponse(key, res);
  } catch (e) {
    if (e?.name === 'NoSuchKey') return res.status(404).json({ error: 'File not found in storage' });
    next(e);
  }
}

async function blockPartner(req, res, next) {
  try {
    const { block = true, reason } = req.body;
    const partner = await EventPartner.findByIdAndUpdate(
      req.params.id,
      { $set: { isBlocked: !!block } },
      { new: true }
    ).lean();
    if (!partner) return res.status(404).json({ error: 'Partner not found' });
    res.json({ partner });
  } catch (e) { next(e); }
}

module.exports = {
  listThemes, updateThemeStatus, listBookings, cancelBooking,
  listPartners, getPartner, createPartner, updatePartner,
  approvePartnerKyc, rejectPartnerKyc, streamPartnerKycDoc, streamPartnerKycField, streamOwnKycDoc, blockPartner,
  getConfig, updateConfig, getAnalytics, listCategories, upsertCategory,
};
