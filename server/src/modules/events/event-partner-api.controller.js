const mongoose = require('mongoose');
const EventTheme   = require('./event-theme.model');
const EventPartner = require('./event-partner.model');
const EventBooking = require('./event-booking.model');
const EventCategory = require('./event-category.model');
const logger = require('../../core/logger');

/* Profile */

async function getMe(req, res, next) {
  try {
    const partner = await EventPartner.findById(req.auth.sub).lean();
    if (!partner) return res.status(404).json({ error: 'Partner not found' });
    res.json({ partner });
  } catch (e) { next(e); }
}

const KYC_MANDATORY = ['aadharFront', 'aadharBack', 'panCard', 'liveSelfie'];
const KYC_OPTIONAL  = ['gstCertificate', 'businessRegistration'];
const KYC_DOC_FIELDS = [...KYC_MANDATORY, ...KYC_OPTIONAL];

async function updateMe(req, res, next) {
  try {
    const PROFILE_ALLOWED = ['bio', 'portfolioImages', 'yearsExperience', 'cities', 'serviceRadiusKm', 'profilePhotoKey', 'ownerName', 'businessName'];
    const patch = {};
    for (const k of PROFILE_ALLOWED) { if (req.body[k] !== undefined) patch[k] = req.body[k]; }

    // Structured KYC document fields
    const kycPatch = {};
    for (const k of KYC_DOC_FIELDS) {
      if (req.body[k] !== undefined) kycPatch[`kyc.${k}`] = req.body[k];
    }
    if (req.body.gstNumber !== undefined) kycPatch['kyc.gstNumber'] = req.body.gstNumber;
    if (req.body.panNumber  !== undefined) kycPatch['kyc.panNumber']  = req.body.panNumber;

    // Legacy single doc append
    const legacyDoc = req.body.kycDocument;

    const current = await EventPartner.findById(req.auth.sub).select('kyc').lean();
    const mergedKyc = { ...current?.kyc, ...Object.fromEntries(Object.entries(kycPatch).map(([k, v]) => [k.replace('kyc.', ''), v])) };

    // Auto-set pending when all mandatory docs are present (and not already approved)
    const mandatoryFilled = KYC_MANDATORY.every(k => mergedKyc[k]);
    const currentStatus   = current?.kyc?.status;
    if (Object.keys(kycPatch).length > 0 && mandatoryFilled && currentStatus !== 'approved') {
      kycPatch['kyc.status'] = 'pending';
    }

    const update = { $set: { ...patch, ...kycPatch } };
    if (legacyDoc) update.$addToSet = { 'kyc.documents': legacyDoc };

    const partner = await EventPartner.findByIdAndUpdate(req.auth.sub, update, { new: true }).lean();
    res.json({ partner });
  } catch (e) { next(e); }
}

/* Themes */

async function getMyThemes(req, res, next) {
  try {
    const s3Service = require('../../core/storage/s3');
    const themes = await EventTheme.find({ partnerId: req.auth.sub })
      .sort({ createdAt: -1 })
      .populate('categoryId', 'name slug emoji')
      .lean();
    await Promise.all(themes.map(async t => {
      if (t.coverImage && !t.coverImage.startsWith('https://')) {
        try { t.coverImage = await s3Service.getViewUrl(t.coverImage); } catch {}
      }
      if (Array.isArray(t.gallery)) {
        t.gallery = await Promise.all(t.gallery.map(async k =>
          k && !k.startsWith('https://') ? s3Service.getViewUrl(k).catch(() => k) : k
        ));
      }
    }));
    res.json({ themes });
  } catch (e) { next(e); }
}

async function createTheme(req, res, next) {
  try {
    const partner = await EventPartner.findById(req.auth.sub).select('kyc.status').lean();
    if (partner?.kyc?.status !== 'approved') {
      return res.status(403).json({ error: 'KYC approval required before uploading themes', code: 'KYC_REQUIRED' });
    }
    const theme = await EventTheme.create({
      ...req.body,
      partnerId: req.auth.sub,
      status: 'pending', // always pending — admin must approve
    });
    logger.info({ partnerId: req.auth.sub, themeId: theme._id }, '[PARTNER] Theme submitted for review');
    res.status(201).json({ theme });
  } catch (e) { next(e); }
}

async function updateTheme(req, res, next) {
  try {
    const theme = await EventTheme.findOne({ _id: req.params.id, partnerId: req.auth.sub });
    if (!theme) return res.status(404).json({ error: 'Theme not found' });
    if (!['pending', 'rejected'].includes(theme.status)) {
      return res.status(409).json({ error: 'Live themes cannot be edited. Contact admin for changes.', code: 'THEME_LIVE' });
    }
    const ALLOWED = ['title', 'description', 'coverImage', 'gallery', 'videoUrl', 'startingPricePaise', 'includedItems', 'setupDurationMinutes', 'setupAreaSqft', 'guestCapacity', 'cities', 'tags', 'categoryId'];
    for (const k of ALLOWED) { if (req.body[k] !== undefined) theme[k] = req.body[k]; }
    if (theme.status === 'rejected') theme.status = 'pending'; // auto-resubmit
    await theme.save();
    res.json({ theme });
  } catch (e) { next(e); }
}

async function deleteTheme(req, res, next) {
  try {
    const theme = await EventTheme.findOne({ _id: req.params.id, partnerId: req.auth.sub });
    if (!theme) return res.status(404).json({ error: 'Theme not found' });
    if (['approved', 'featured'].includes(theme.status)) {
      return res.status(409).json({ error: 'Cannot delete a live theme. Hide it instead or contact admin.' });
    }
    await theme.deleteOne();
    res.json({ ok: true });
  } catch (e) { next(e); }
}

/* Bookings */

async function getMyBookings(req, res, next) {
  try {
    const { status, page = 1 } = req.query;
    const q = { partnerId: req.auth.sub };
    if (status) q.status = status;
    const limit = 15;
    const [bookings, total] = await Promise.all([
      EventBooking.find(q).select('-startCode').sort({ eventDate: 1 }).skip((page - 1) * limit).limit(limit)
        .populate('userId', 'name phone').populate('themeId', 'title coverImage').lean(),
      EventBooking.countDocuments(q),
    ]);
    res.json({ bookings, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
}

async function declineBooking(req, res, next) {
  try {
    const { reason } = req.body;
    const booking = await EventBooking.findOne({ _id: req.params.id, partnerId: req.auth.sub, status: 'confirmed' });
    if (!booking) return res.status(404).json({ error: 'Booking not found or cannot be declined at this stage' });

    const { paidPaiseOf } = require('./event.service');
    const refundPaise = paidPaiseOf(booking);
    booking.status = 'cancelled';
    booking.cancellationReason = reason || 'Partner unavailable';
    booking.cancelledBy = 'partner';
    booking.refundPaise = refundPaise;
    booking.refundStatus = refundPaise > 0 ? 'pending' : 'none';
    booking.statusHistory.push({ status: 'cancelled', meta: { reason, cancelledBy: 'partner', refundPaise } });
    await booking.save();
    if (refundPaise > 0) {
      await require('../payment/payment.service').refundEventPayments({ bookingId: booking._id, reason: 'Partner cancelled' });
    }
    require('../jobs/job-events').announce('event', booking, 'cancelled').catch(() => {});

    // Notify user — full refund on partner cancellation
    try {
      const ns = require('../notification/notification.service');
      ns.notify({
        recipient: { kind: 'user', id: String(booking.userId) },
        type: 'event_booking_cancelled',
        title: '⚠️ Booking Cancelled by Partner',
        body: `Sorry, your event partner had to cancel. A full refund will be processed.`,
        deepLink: `/events/bookings/${booking._id}`,
        data: { bookingId: String(booking._id), refund: 'full' },
      }).catch(() => {});
    } catch {}

    res.json({ ok: true, bookingId: String(booking._id) });
  } catch (e) { next(e); }
}

async function updateBookingStatus(req, res, next) {
  try {
    const { status } = req.body;
    const ALLOWED_TRANSITIONS = {
      confirmed:        ['partner_assigned'],
      partner_assigned: ['in_progress'],
      in_progress:      ['completed'],
    };

    const booking = await EventBooking.findOne({ _id: req.params.id, partnerId: req.auth.sub });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const allowed = ALLOWED_TRANSITIONS[booking.status] || [];
    if (!allowed.includes(status)) {
      return res.status(409).json({ error: `Cannot transition from ${booking.status} to ${status}` });
    }
    await require('../jobs/start-code').assertStartCode('event', booking, status, req.body.code);

    booking.status = status;
    booking.statusHistory.push({ status, meta: { updatedBy: 'partner' } });
    await booking.save();
    require('../jobs/job-events').announce('event', booking, status).catch(() => {});

    if (status === 'completed') {
      // The commission agreed when this booking was made, not a number fixed in code.
      const commissionPct = booking.pricing.platformCommissionPct ?? 15;
      const netPaise = Math.round((booking.pricing.totalPaise || 0) * (100 - commissionPct) / 100);
      await EventPartner.updateOne({ _id: req.auth.sub }, {
        $inc: { completedEvents: 1, totalEarningsPaise: netPaise },
      });
      EventTheme.updateOne({ _id: booking.themeId }, { $inc: { bookingCount: 1 } }).catch(() => {});

      // Notify user
      try {
        const ns = require('../notification/notification.service');
        ns.notify({
          recipient: { kind: 'user', id: String(booking.userId) },
          type: 'event_completed', title: '🎉 Event completed!',
          body: 'Your event decoration is done. We hope you loved it! Leave a review.',
          data: { bookingId: String(booking._id) },
        }).catch(() => {});
      } catch { /* non-blocking */ }
    }

    res.json({ booking });
  } catch (e) { next(e); }
}

/* Calendar */

async function getCalendar(req, res, next) {
  try {
    const [partner, bookings] = await Promise.all([
      EventPartner.findById(req.auth.sub).select('blockedDates').lean(),
      EventBooking.find({
        partnerId: req.auth.sub,
        status: { $in: ['confirmed', 'partner_assigned', 'in_progress'] },
        eventDate: { $gte: new Date() },
      }).select('eventDate eventTimeSlot status themeId').populate('themeId', 'title').lean(),
    ]);
    res.json({ blockedDates: partner?.blockedDates || [], bookings });
  } catch (e) { next(e); }
}

async function blockDate(req, res, next) {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });
    await EventPartner.updateOne({ _id: req.auth.sub }, { $addToSet: { blockedDates: new Date(date) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
}

async function unblockDate(req, res, next) {
  try {
    const d = new Date(req.params.date);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    await EventPartner.updateOne({ _id: req.auth.sub }, { $pull: { blockedDates: { $gte: start, $lt: end } } });
    res.json({ ok: true });
  } catch (e) { next(e); }
}

/* Earnings */

async function getEarnings(req, res, next) {
  try {
    const pid = new mongoose.Types.ObjectId(req.auth.sub);

    const [summary, monthly, recent] = await Promise.all([
      EventBooking.aggregate([
        { $match: { partnerId: pid, status: 'completed' } },
        { $group: { _id: null, grossPaise: { $sum: '$pricing.totalPaise' }, count: { $sum: 1 } } },
      ]),
      EventBooking.aggregate([
        { $match: { partnerId: pid, status: 'completed' } },
        { $group: {
          _id: { year: { $year: '$updatedAt' }, month: { $month: '$updatedAt' } },
          grossPaise: { $sum: '$pricing.totalPaise' }, count: { $sum: 1 },
        }},
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 6 },
      ]),
      EventBooking.find({ partnerId: req.auth.sub, status: 'completed' })
        .sort({ updatedAt: -1 }).limit(10)
        .populate('themeId', 'title').lean(),
    ]);

    const gross = summary[0]?.grossPaise || 0;
    const platformPct = 0.15;
    const platform = Math.round(gross * platformPct);
    const net = gross - platform;

    res.json({
      grossPaise: gross, platformPaise: platform, netPaise: net,
      totalJobs: summary[0]?.count || 0,
      monthly, recent,
    });
  } catch (e) { next(e); }
}

/* Dashboard Overview */

async function getOverview(req, res, next) {
  try {
    const pid = req.auth.sub;
    const now  = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const next7 = new Date(today.getTime() + 7 * 86_400_000);

    const [partner, themes, upcoming, pending, totalEarned] = await Promise.all([
      EventPartner.findById(pid).select('businessName rating completedEvents kyc.status').lean(),
      EventTheme.countDocuments({ partnerId: pid }),
      EventBooking.countDocuments({ partnerId: pid, eventDate: { $gte: today, $lte: next7 }, status: { $in: ['confirmed', 'partner_assigned'] } }),
      EventBooking.countDocuments({ partnerId: pid, status: 'confirmed' }),
      EventBooking.aggregate([
        { $match: { partnerId: new mongoose.Types.ObjectId(pid), status: 'completed' } },
        { $group: { _id: null, t: { $sum: '$pricing.totalPaise' } } },
      ]),
    ]);

    const gross = totalEarned[0]?.t || 0;
    res.json({
      partner,
      stats: {
        themes, upcomingEvents: upcoming, pendingConfirmations: pending,
        netEarningsPaise: Math.round(gross * 0.85),
      },
    });
  } catch (e) { next(e); }
}

/* Categories (for theme upload form) */

async function getCategories(req, res, next) {
  try {
    res.json({ categories: await EventCategory.find({ isActive: true }).sort({ sortOrder: 1 }).lean() });
  } catch (e) { next(e); }
}

async function streamMyKycDoc(req, res, next) {
  try {
    const partner = await EventPartner.findById(req.auth.sub).select('kyc').lean();
    if (!partner) return res.status(404).json({ error: 'Partner not found' });
    const key = partner.kyc?.documents?.[Number(req.params.idx)];
    if (!key) return res.status(404).json({ error: 'Document not found' });
    const s3Service = require('../../core/storage/s3');
    await s3Service.streamToResponse(key, res);
  } catch (e) {
    if (e?.name === 'NoSuchKey') return res.status(404).json({ error: 'File not found in storage' });
    next(e);
  }
}

const KYC_FIELD_ALLOWLIST = ['aadharFront','aadharBack','panCard','liveSelfie','gstCertificate','businessRegistration'];
async function streamMyKycField(req, res, next) {
  try {
    const { fieldName } = req.params;
    if (!KYC_FIELD_ALLOWLIST.includes(fieldName)) return res.status(400).json({ error: 'Invalid field' });
    const partner = await EventPartner.findById(req.auth.sub).select('kyc').lean();
    if (!partner) return res.status(404).json({ error: 'Not found' });
    const key = partner.kyc?.[fieldName];
    if (!key) return res.status(404).json({ error: 'Document not uploaded' });
    const s3Service = require('../../core/storage/s3');
    await s3Service.streamToResponse(key, res);
  } catch (e) {
    if (e?.name === 'NoSuchKey') return res.status(404).json({ error: 'File not found in storage' });
    next(e);
  }
}

module.exports = {
  getMe, updateMe,
  getMyThemes, createTheme, updateTheme, deleteTheme,
  getMyBookings, updateBookingStatus, declineBooking,
  getCalendar, blockDate, unblockDate,
  getEarnings, getOverview, getCategories,
  streamMyKycDoc, streamMyKycField,
};
