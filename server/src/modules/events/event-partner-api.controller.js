const mongoose = require('mongoose');
const EventTheme   = require('./event-theme.model');
const EventPartner = require('./event-partner.model');
const EventBooking = require('./event-booking.model');
const EventCategory = require('./event-category.model');
const logger = require('../../core/logger');
const s3Service = require('../../core/storage/s3');

/** Sign an S3 key for viewing; leaves full URLs alone. */
const signKey = (k) => (k && !String(k).startsWith('https://') ? s3Service.getViewUrl(k).catch(() => null) : Promise.resolve(k || null));

/** What a package may be created or edited with: nothing a partner should not set (status, rating, counts). */
const THEME_FIELDS = ['title', 'description', 'coverImage', 'gallery', 'videoUrl', 'startingPricePaise', 'includedItems', 'excludedItems',
  'setupDurationMinutes', 'setupAreaSqft', 'guestCapacity', 'cities', 'tags', 'categoryId'];
function pickTheme(body) {
  const out = {};
  for (const k of THEME_FIELDS) if (body[k] !== undefined) out[k] = body[k];
  if (out.videoUrl && /^https?:/i.test(out.videoUrl)) delete out.videoUrl; // uploads only, never pasted links
  if (Array.isArray(out.cities)) out.cities = out.cities.map((c) => String(c).trim().toLowerCase()).filter(Boolean);
  return out;
}

// Partner's share of a booking at the rate frozen on it; our platform fee is never theirs.
const { PARTNER_GROSS, PARTNER_NET, partnerGrossOf, partnerNetOf } = require('./event-money');

/* Profile */

async function getMe(req, res, next) {
  try {
    const partner = await EventPartner.findById(req.auth.sub).lean();
    if (!partner) return res.status(404).json({ error: 'Partner not found' });
    partner.profilePhotoUrl = await signKey(partner.profilePhotoKey);
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
    const themes = await EventTheme.find({ partnerId: req.auth.sub })
      .sort({ createdAt: -1 })
      .populate('categoryId', 'name slug emoji')
      .lean();
    await Promise.all(themes.map(async t => {
      // Keys travel alongside the signed URLs so an edit saves keys, never expiring links.
      t.coverKey = t.coverImage;
      t.videoKey = t.videoUrl || null;
      t.galleryKeys = t.gallery || [];
      if (t.coverImage && !t.coverImage.startsWith('https://')) {
        try { t.coverImage = await s3Service.getViewUrl(t.coverImage); } catch {}
      }
      t.videoUrl = await signKey(t.videoUrl);
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
      ...pickTheme(req.body),
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
    Object.assign(theme, pickTheme(req.body));
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
    // "upcoming" = accepted or being set up; everything else is a single status.
    if (status === 'upcoming') q.status = { $in: ['partner_assigned', 'in_progress'] };
    else if (status) q.status = status;
    const limit = 15;
    const [bookings, total] = await Promise.all([
      EventBooking.find(q).select('-startCode -statusHistory')
        // Finished and cancelled read newest first; work still to do reads soonest first.
        .sort({ eventDate: ['completed', 'cancelled'].includes(status) || !status ? -1 : 1 })
        .skip((page - 1) * limit).limit(limit)
        // The list needs a name and a place; phone and full address are on the booking itself.
        .populate('userId', 'name').populate('themeId', 'title coverImage').lean(),
      EventBooking.countDocuments(q),
    ]);
    res.json({ bookings, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
}

/** One booking, everything the partner needs on the day; never the start code. */
async function getMyBooking(req, res, next) {
  try {
    const b = await EventBooking.findOne({ _id: req.params.id, partnerId: req.auth.sub })
      .select('-startCode').populate('userId', 'name phone').populate('themeId', 'title coverImage includedItems setupDurationMinutes').lean();
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    // Contact details only once the booking is the partner's to do.
    if (!['confirmed', 'partner_assigned', 'in_progress', 'completed'].includes(b.status) && b.userId) b.userId.phone = null;
    b.roomPhotos = (await Promise.all((b.roomPhotos || []).map(signKey))).filter(Boolean);
    b.setupPhotos = {
      before: (await Promise.all((b.setupPhotos?.before || []).map(signKey))).filter(Boolean),
      after: (await Promise.all((b.setupPhotos?.after || []).map(signKey))).filter(Boolean),
    };
    if (b.themeId?.coverImage) b.themeId.coverImage = await signKey(b.themeId.coverImage);
    b.payout = { commissionPct: b.pricing?.platformCommissionPct ?? 10, grossPaise: partnerGrossOf(b.pricing), netPaise: partnerNetOf(b.pricing) };
    res.json({ booking: b });
  } catch (e) { next(e); }
}

/**
 * Before/after photos of the setup. "Before" once the team is assigned,
 * "after" once the work is under way; the finished photos are the proof the
 * customer sees and what completing the booking requires.
 */
async function addSetupPhotos(req, res, next) {
  try {
    const { stage, keys } = req.body;
    const OK = { before: ['partner_assigned', 'in_progress'], after: ['in_progress', 'completed'] };
    const b = await EventBooking.findOne({ _id: req.params.id, partnerId: req.auth.sub }).select('status setupPhotos');
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (!OK[stage].includes(b.status)) {
      return res.status(409).json({
        error: stage === 'before' ? 'Add "before" photos once you are assigned' : 'Add finished photos once the setup has started',
        code: 'WRONG_STAGE',
      });
    }
    const current = b.setupPhotos?.[stage] || [];
    if (current.length + keys.length > 10) return res.status(400).json({ error: 'Up to 10 photos per stage' });
    b.set(`setupPhotos.${stage}`, [...current, ...keys]);
    await b.save();
    res.json({ ok: true, count: current.length + keys.length });
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
    // Finished means the customer can see it finished.
    if (status === 'completed' && !(booking.setupPhotos?.after || []).length) {
      return res.status(409).json({ error: 'Add at least one photo of the finished setup before completing', code: 'PROOF_REQUIRED' });
    }

    booking.status = status;
    booking.statusHistory.push({ status, meta: { updatedBy: 'partner' } });
    await booking.save();
    require('../jobs/job-events').announce('event', booking, status).catch(() => {});

    if (status === 'completed') {
      // The commission agreed when this booking was made, not a number fixed in code.
      const netPaise = partnerNetOf(booking.pricing);
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
    const done = { partnerId: pid, status: 'completed' };
    const { getActiveConfig } = require('./event.service');

    const [summary, monthly, recent, upcoming, cfg] = await Promise.all([
      EventBooking.aggregate([
        { $match: done },
        { $group: { _id: null, grossPaise: { $sum: PARTNER_GROSS }, netPaise: { $sum: PARTNER_NET }, count: { $sum: 1 } } },
      ]),
      EventBooking.aggregate([
        { $match: done },
        { $group: {
          _id: { year: { $year: '$eventDate' }, month: { $month: '$eventDate' } },
          grossPaise: { $sum: PARTNER_GROSS }, netPaise: { $sum: PARTNER_NET }, count: { $sum: 1 },
        } },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 6 },
      ]),
      EventBooking.find(done).sort({ eventDate: -1 }).limit(15).select('eventDate pricing themeId').populate('themeId', 'title').lean(),
      EventBooking.aggregate([
        { $match: { partnerId: pid, status: { $in: ['confirmed', 'partner_assigned', 'in_progress'] } } },
        { $group: { _id: null, netPaise: { $sum: PARTNER_NET }, count: { $sum: 1 } } },
      ]),
      getActiveConfig(),
    ]);

    const gross = summary[0]?.grossPaise || 0;
    const net = Math.round(summary[0]?.netPaise || 0);
    res.json({
      grossPaise: gross, platformPaise: gross - net, netPaise: net,
      totalJobs: summary[0]?.count || 0,
      // The rate new bookings are made at; each past booking keeps its own.
      commissionPct: cfg.platformCommissionPct ?? 10,
      upcomingNetPaise: Math.round(upcoming[0]?.netPaise || 0),
      upcomingCount: upcoming[0]?.count || 0,
      monthly: monthly.map((m) => ({ ...m, netPaise: Math.round(m.netPaise) })),
      recent: recent.map((b) => {
        return {
          _id: b._id, eventDate: b.eventDate, title: b.themeId?.title || 'Event',
          grossPaise: partnerGrossOf(b.pricing), commissionPct: b.pricing?.platformCommissionPct ?? 10, netPaise: partnerNetOf(b.pricing),
        };
      }),
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
        { $group: { _id: null, net: { $sum: PARTNER_NET } } },
      ]),
    ]);

    res.json({
      partner,
      stats: {
        themes, upcomingEvents: upcoming, pendingConfirmations: pending,
        netEarningsPaise: Math.round(totalEarned[0]?.net || 0),
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
  getMyBookings, getMyBooking, addSetupPhotos, updateBookingStatus, declineBooking,
  getCalendar, blockDate, unblockDate,
  getEarnings, getOverview, getCategories,
  streamMyKycDoc, streamMyKycField,
};
