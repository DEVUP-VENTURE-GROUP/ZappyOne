const EventConfig  = require('./event-config.model');
const EventCategory = require('./event-category.model');
const EventTheme   = require('./event-theme.model');
const EventPartner = require('./event-partner.model');
const EventBooking = require('./event-booking.model');
const EventSaved   = require('./event-saved.model');
const { redis }    = require('../../config/redis');
const logger       = require('../../core/logger');

const s3Service = require('../../core/storage/s3');

const CFG_KEY = 'events:config';
const CFG_TTL = 60;

// Resolves S3 keys → presigned view URLs (24h) for coverImage + gallery.
// Safe to call on already-resolved https:// URLs (no-op).
async function resolveThemeImages(theme) {
  if (!theme) return theme;
  async function resolve(val) {
    if (!val || val.startsWith('https://')) return val;
    try { return await s3Service.getViewUrl(val); } catch { return val; }
  }
  theme.coverImage = await resolve(theme.coverImage);
  if (Array.isArray(theme.gallery)) {
    theme.gallery = await Promise.all(theme.gallery.map(resolve));
  }
  return theme;
}

async function resolveThemeListImages(themes) {
  if (!themes?.length) return themes;
  return Promise.all(themes.map(resolveThemeImages));
}

// Config

async function getActiveConfig() {
  const cached = await redis.get(CFG_KEY).catch(() => null);
  if (cached) return JSON.parse(cached);
  const cfg = await EventConfig.findOne({ isActive: true }).lean();
  const result = cfg || defaultConfig();
  redis.set(CFG_KEY, JSON.stringify(result), 'EX', CFG_TTL).catch(() => {});
  return result;
}

function defaultConfig() {
  return {
    advancePaymentPct: 20, platformCommissionPct: 15, travelFeePerKmPaise: 0,
    cancellationPolicy: [
      { daysBeforeEvent: 7, refundPct: 100 },
      { daysBeforeEvent: 3, refundPct: 50  },
      { daysBeforeEvent: 1, refundPct: 25  },
      { daysBeforeEvent: 0, refundPct: 0   },
    ],
    minAdvanceBookingHours: 24, maxAdvanceBookingDays: 365,
    sameDayBookingEnabled: false, videoEnabled: true, bookingEnabled: true,
  };
}

// Categories

async function listCategories() {
  const rows = await EventCategory.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  return s3Service.signDocsMedia(rows);
}

// Themes

async function listThemes({ categorySlug, city, budgetMaxPaise, guestCount, page = 1, sort = 'trending', search } = {}) {
  const q = { status: { $in: ['approved', 'featured'] } };
  if (categorySlug) {
    const cat = await EventCategory.findOne({ slug: categorySlug }).select('_id').lean();
    if (cat) q.categoryId = cat._id;
  }
  if (city)           q.cities = city.toLowerCase();
  if (budgetMaxPaise) q.startingPricePaise = { $lte: Number(budgetMaxPaise) };
  if (guestCount)     { q['guestCapacity.min'] = { $lte: Number(guestCount) }; q['guestCapacity.max'] = { $gte: Number(guestCount) }; }
  if (search)         q.$text = { $search: search };

  const sortMap = {
    trending:   { isTrending: -1, bookingCount: -1, rating: -1 },
    price_asc:  { startingPricePaise: 1 },
    price_desc: { startingPricePaise: -1 },
    rating:     { rating: -1, reviewCount: -1 },
    newest:     { createdAt: -1 },
  };

  const limit = 20;
  const [themes, total] = await Promise.all([
    EventTheme.find(q).sort(sortMap[sort] || sortMap.trending).skip((page - 1) * limit).limit(limit)
      .populate('categoryId', 'name slug emoji')
      .populate('partnerId', 'businessName rating completedEvents')
      .lean(),
    EventTheme.countDocuments(q),
  ]);
  await resolveThemeListImages(themes);
  return { themes, total, page, pages: Math.ceil(total / limit) };
}

async function getTheme(themeId, userId = null) {
  const theme = await EventTheme.findOne({ _id: themeId, status: { $in: ['approved', 'featured'] } })
    .populate('categoryId', 'name slug emoji')
    .populate('partnerId', 'businessName rating completedEvents bio portfolioImages yearsExperience')
    .lean();
  if (!theme) throw Object.assign(new Error('Theme not found'), { status: 404 });

  let isSaved = false;
  if (userId) {
    const redisSaved = await redis.sismember(`events:saved:${userId}`, String(themeId)).catch(() => 0);
    isSaved = !!redisSaved;
    if (!isSaved) {
      isSaved = !!(await EventSaved.findOne({ userId, themeId }).select('_id').lean().catch(() => null));
    }
  }
  await resolveThemeImages(theme);
  return { ...theme, isSaved };
}

// Save / Unsave

async function toggleSave(userId, themeId) {
  const exists = await EventTheme.findById(themeId).select('_id').lean();
  if (!exists) throw Object.assign(new Error('Theme not found'), { status: 404 });

  const key = `events:saved:${userId}`;
  const alreadySaved = await redis.sismember(key, String(themeId)).catch(() => 0);

  // Check MongoDB as source of truth (handles Redis flush scenario)
  const dbSaved = !alreadySaved
    ? await EventSaved.findOne({ userId, themeId }).lean()
    : null;
  const isSaved = alreadySaved || !!dbSaved;

  if (isSaved) {
    // Unsave — remove from both Redis and MongoDB
    await Promise.all([
      redis.srem(key, String(themeId)).catch(() => {}),
      EventSaved.deleteOne({ userId, themeId }).catch(() => {}),
      EventTheme.updateOne({ _id: themeId }, { $inc: { saveCount: -1 } }).catch(() => {}),
    ]);
    return { saved: false };
  }

  // Save — write to both Redis (fast path) and MongoDB (durable)
  await Promise.all([
    redis.sadd(key, String(themeId)).catch(() => {}),
    EventSaved.findOneAndUpdate({ userId, themeId }, { userId, themeId }, { upsert: true, new: true }).catch(() => {}),
    EventTheme.updateOne({ _id: themeId }, { $inc: { saveCount: 1 } }).catch(() => {}),
  ]);
  return { saved: true };
}

async function getSavedThemes(userId) {
  // Seed Redis from MongoDB if Redis is empty (handles Redis restart)
  const key = `events:saved:${userId}`;
  let ids = await redis.smembers(key).catch(() => []);

  if (!ids.length) {
    // Restore from MongoDB
    const dbSaves = await EventSaved.find({ userId }).select('themeId').lean();
    ids = dbSaves.map(s => String(s.themeId));
    if (ids.length) {
      redis.sadd(key, ...ids).catch(() => {});
    }
  }

  if (!ids.length) return [];
  const themes = await EventTheme.find({ _id: { $in: ids }, status: { $in: ['approved', 'featured'] } })
    .populate('categoryId', 'name slug emoji').lean();
  await resolveThemeListImages(themes);
  return themes;
}

// Booking

async function createBooking({ userId, themeId, eventDate, eventTimeSlot, address, guestCount, notes, roomPhotos }) {
  const cfg = await getActiveConfig();
  if (!cfg.bookingEnabled) throw Object.assign(new Error('Event bookings are temporarily unavailable'), { status: 503 });

  const theme = await EventTheme.findOne({ _id: themeId, status: { $in: ['approved', 'featured'] } })
    .populate('partnerId').lean();
  if (!theme) throw Object.assign(new Error('Theme not found or unavailable'), { status: 404 });

  const partner = theme.partnerId;
  if (!partner || !partner.isActive || partner.isBlocked) {
    throw Object.assign(new Error('This theme is not currently available'), { status: 409 });
  }

  // Lead time guard
  const eventDateObj = new Date(eventDate);
  const hoursUntil = (eventDateObj - Date.now()) / 3_600_000;
  if (hoursUntil < cfg.minAdvanceBookingHours) {
    throw Object.assign(
      new Error(`Events require at least ${cfg.minAdvanceBookingHours}h advance booking`),
      { status: 409, code: 'BOOKING_TOO_SOON' }
    );
  }
  const maxDays = cfg.maxAdvanceBookingDays > 0 ? cfg.maxAdvanceBookingDays : 365;
  if (hoursUntil > maxDays * 24) {
    throw Object.assign(new Error('Booking date is too far in the future'), { status: 409 });
  }

  // Partner blocked-date check — compare date-only in UTC to avoid timezone issues
  const eventDateStr = eventDateObj.toISOString().split('T')[0];
  const isBlocked = partner.blockedDates?.some(
    (d) => new Date(d).toISOString().split('T')[0] === eventDateStr
  );
  if (isBlocked) throw Object.assign(new Error('Partner is unavailable on this date'), { status: 409, code: 'DATE_BLOCKED' });

  // Double-booking: same partner, date, slot
  const conflict = await EventBooking.findOne({
    partnerId: partner._id,
    eventDate: eventDateObj,
    eventTimeSlot,
    status: { $in: ['confirmed', 'partner_assigned', 'in_progress'] },
  }).lean();
  if (conflict) throw Object.assign(new Error('This time slot is not available'), { status: 409, code: 'SLOT_TAKEN' });

  const totalPaise   = theme.startingPricePaise;
  const advancePaise = Math.round(totalPaise * cfg.advancePaymentPct / 100);

  const booking = await EventBooking.create({
    userId, themeId, partnerId: partner._id,
    eventDate: eventDateObj, eventTimeSlot,
    address, guestCount: guestCount || 1, notes, roomPhotos: roomPhotos || [],
    pricing: {
      totalPaise, advancePaise,
      remainingPaise: totalPaise - advancePaise,
      platformCommissionPct: cfg.platformCommissionPct,
      advancePaymentPct: cfg.advancePaymentPct,
    },
    statusHistory: [{ status: 'pending_payment' }],
  });

  return { booking, advancePaise, totalPaise, remainingPaise: totalPaise - advancePaise };
}

async function getUserBookings(userId, page = 1) {
  const limit = 10;
  const [bookings, total] = await Promise.all([
    EventBooking.find({ userId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('themeId', 'title coverImage startingPricePaise')
      .lean(),
    EventBooking.countDocuments({ userId }),
  ]);
  return { bookings, total, page, pages: Math.ceil(total / limit) };
}

async function getBooking(bookingId, userId) {
  const booking = await EventBooking.findOne({ _id: bookingId, userId })
    .populate('themeId', 'title coverImage gallery includedItems excludedItems setupDurationMinutes')
    .populate('partnerId', 'businessName rating bio portfolioImages completedEvents')
    .lean();
  if (!booking) throw Object.assign(new Error('Booking not found'), { status: 404 });

  // Reveal partner contact only after booking is confirmed — prevents commission bypass
  const REVEAL_STATUSES = ['confirmed', 'partner_assigned', 'in_progress', 'completed'];
  if (REVEAL_STATUSES.includes(booking.status) && booking.partnerId) {
    const partner = await require('./event-partner.model').findById(booking.partnerId._id).select('phone email').lean();
    if (partner) {
      booking.partnerId = { ...booking.partnerId, phone: partner.phone };
    }
  }
  return booking;
}

// Cancellation

function getRefundPct(cfg, eventDate) {
  const daysUntil = (new Date(eventDate) - Date.now()) / 86_400_000;
  const sorted = [...cfg.cancellationPolicy].sort((a, b) => b.daysBeforeEvent - a.daysBeforeEvent);
  for (const tier of sorted) {
    if (daysUntil >= tier.daysBeforeEvent) return tier.refundPct;
  }
  return 0;
}

async function cancelBooking(bookingId, userId, reason) {
  const booking = await EventBooking.findOne({ _id: bookingId, userId }).lean();
  if (!booking) throw Object.assign(new Error('Booking not found'), { status: 404 });
  if (['completed', 'cancelled'].includes(booking.status)) {
    throw Object.assign(new Error('Cannot cancel this booking'), { status: 409 });
  }

  const cfg = await getActiveConfig();
  const refundPct   = getRefundPct(cfg, booking.eventDate);
  const paidPaise   = booking.advancePayment.status === 'paid' ? booking.pricing.advancePaise : 0;
  const refundPaise = Math.round(paidPaise * refundPct / 100);

  await EventBooking.updateOne({ _id: bookingId }, {
    $set: { status: 'cancelled', cancellationReason: reason, cancelledBy: 'user', refundPaise, refundStatus: refundPaise > 0 ? 'pending' : 'none' },
    $push: { statusHistory: { status: 'cancelled', meta: { reason, refundPaise } } },
  });

  try {
    const ns = require('../notification/notification.service');
    ns.notify({
      recipient: { kind: 'user', id: String(userId) },
      type: 'event_booking_cancelled', title: 'Booking cancelled',
      body: refundPaise > 0
        ? `Refund of ₹${Math.round(refundPaise / 100)} will be processed shortly`
        : 'No refund per our cancellation policy',
      data: { bookingId: String(bookingId) },
    }).catch(() => {});
  } catch { /* non-blocking */ }

  return { refundPaise, refundPct };
}

// Review

async function submitReview(bookingId, userId, { rating, review }) {
  if (rating < 1 || rating > 5) throw Object.assign(new Error('Rating must be 1–5'), { status: 400 });
  const booking = await EventBooking.findOne({ _id: bookingId, userId, status: 'completed' }).lean();
  if (!booking) throw Object.assign(new Error('Can only review completed bookings'), { status: 409 });
  if (booking.reviewedAt) throw Object.assign(new Error('Already reviewed'), { status: 409 });

  await EventBooking.updateOne({ _id: bookingId }, { $set: { userRating: rating, userReview: review, reviewedAt: new Date() } });

  // Update theme moving-average rating
  const theme = await EventTheme.findById(booking.themeId).select('rating reviewCount').lean();
  if (theme) {
    const newCount  = theme.reviewCount + 1;
    const newRating = ((theme.rating * theme.reviewCount) + rating) / newCount;
    await EventTheme.updateOne({ _id: booking.themeId }, { $set: { rating: Math.round(newRating * 10) / 10, reviewCount: newCount } });
  }

  // Update partner moving-average rating
  const reviews = await EventBooking.find({ partnerId: booking.partnerId, userRating: { $exists: true } }).select('userRating').lean();
  if (reviews.length) {
    const avg = reviews.reduce((s, b) => s + b.userRating, 0) / reviews.length;
    await EventPartner.updateOne({ _id: booking.partnerId }, { $set: { rating: Math.round(avg * 10) / 10, reviewCount: reviews.length } });
  }
  return { ok: true };
}

// Admin

async function adminListThemes({ status, page = 1, search } = {}) {
  const q = {};
  if (status) q.status = status;
  if (search) q.title  = { $regex: search, $options: 'i' };
  const limit = 20;
  const [themes, total] = await Promise.all([
    EventTheme.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('categoryId', 'name slug').populate('partnerId', 'businessName').lean(),
    EventTheme.countDocuments(q),
  ]);
  await resolveThemeListImages(themes);
  return { themes, total, page, pages: Math.ceil(total / limit) };
}

async function adminUpdateThemeStatus(themeId, patch) {
  const update = {};
  if (patch.status    !== undefined) update.status    = patch.status;
  if (patch.adminNote !== undefined) update.adminNote = patch.adminNote;
  if (patch.isTrending !== undefined) update.isTrending = patch.isTrending;
  if (patch.startingPricePaise !== undefined) {
    const p = Math.round(Number(patch.startingPricePaise));
    if (p > 0) update.startingPricePaise = p;
  }
  const prevTheme = await EventTheme.findById(themeId).select('status categoryId').lean();
  if (!prevTheme) throw Object.assign(new Error('Theme not found'), { status: 404 });

  const theme = await EventTheme.findByIdAndUpdate(themeId, { $set: update }, { new: true }).lean();

  // Maintain denormalized themeCount on category
  const wasLive = ['approved', 'featured'].includes(prevTheme.status);
  const isNowLive = ['approved', 'featured'].includes(patch.status);
  if (!wasLive && isNowLive) {
    EventCategory.updateOne({ _id: theme.categoryId }, { $inc: { themeCount: 1 } }).catch(() => {});
  } else if (wasLive && !isNowLive && patch.status) {
    EventCategory.updateOne({ _id: theme.categoryId }, { $inc: { themeCount: -1 } }).catch(() => {});
  }
  return theme;
}

async function adminListBookings({ status, page = 1 } = {}) {
  const q = {};
  if (status) q.status = status;
  const limit = 20;
  const [bookings, total] = await Promise.all([
    EventBooking.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('userId', 'name phone').populate('themeId', 'title').populate('partnerId', 'businessName').lean(),
    EventBooking.countDocuments(q),
  ]);
  return { bookings, total, page, pages: Math.ceil(total / limit) };
}

async function adminListPartners({ page = 1 } = {}) {
  const limit = 20;
  const [partners, total] = await Promise.all([
    EventPartner.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    EventPartner.countDocuments(),
  ]);
  return { partners, total, page, pages: Math.ceil(total / limit) };
}

async function adminCreatePartner(data, adminId) {
  return EventPartner.create({ ...data, createdBy: adminId });
}

async function adminUpdatePartner(partnerId, patch) {
  const p = await EventPartner.findByIdAndUpdate(partnerId, { $set: patch }, { new: true }).lean();
  if (!p) throw Object.assign(new Error('Partner not found'), { status: 404 });
  return p;
}

async function adminGetConfig() {
  const cfg = await EventConfig.findOne({ isActive: true }).lean();
  return cfg || defaultConfig();
}

async function adminUpdateConfig(patch, adminId) {
  const { _id, __v, ...safe } = patch;
  // Clamp fields that would silently break booking if set to 0
  if (safe.maxAdvanceBookingDays !== undefined && safe.maxAdvanceBookingDays < 1) safe.maxAdvanceBookingDays = 365;
  if (safe.minAdvanceBookingHours !== undefined && safe.minAdvanceBookingHours < 1) safe.minAdvanceBookingHours = 2;
  const cfg = await EventConfig.findOneAndUpdate(
    {},
    { $set: { ...safe, isActive: true, updatedBy: adminId } },
    { upsert: true, new: true }
  ).lean();
  await redis.del(CFG_KEY).catch(() => {});
  return cfg;
}

async function adminGetAnalytics() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const [
    totalBookings, confirmedBookings, totalThemes, totalPartners,
    revenue, topThemes, categoryBreakdown, topCities, weeklyTrend, partnerPerformance,
  ] = await Promise.all([
    EventBooking.countDocuments(),
    EventBooking.countDocuments({ status: { $in: ['confirmed', 'partner_assigned', 'in_progress', 'completed'] } }),
    EventTheme.countDocuments({ status: { $in: ['approved', 'featured'] } }),
    EventPartner.countDocuments({ isActive: true, 'kyc.status': 'approved' }),

    // Revenue from paid advance payments
    EventBooking.aggregate([
      { $match: { 'advancePayment.status': 'paid' } },
      { $group: { _id: null, total: { $sum: '$pricing.advancePaise' } } },
    ]),

    // Top 10 themes by bookings
    EventTheme.find({ status: { $in: ['approved', 'featured'] } })
      .sort({ bookingCount: -1 }).limit(10)
      .populate('categoryId', 'name emoji').lean(),

    // Bookings by category
    EventBooking.aggregate([
      { $lookup: { from: 'eventthemes', localField: 'themeId', foreignField: '_id', as: 't' } },
      { $unwind: { path: '$t', preserveNullAndEmptyArrays: false } },
      { $lookup: { from: 'eventcategories', localField: 't.categoryId', foreignField: '_id', as: 'c' } },
      { $unwind: { path: '$c', preserveNullAndEmptyArrays: false } },
      { $group: { _id: '$c.name', count: { $sum: 1 }, emoji: { $first: '$c.emoji' } } },
      { $sort: { count: -1 } },
    ]),

    // Top cities by booking volume
    EventBooking.aggregate([
      { $group: { _id: '$address.city', count: { $sum: 1 } } },
      { $match: { _id: { $ne: null } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),

    // Weekly booking trend (last 7 days by day)
    EventBooking.aggregate([
      { $match: { createdAt: { $gte: weekAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]),

    // Partner performance: top 10 by completed events
    EventPartner.find({ 'kyc.status': 'approved', isActive: true })
      .sort({ completedEvents: -1 }).limit(10)
      .select('businessName completedEvents rating reviewCount totalEarningsPaise').lean(),
  ]);

  // Conversion rate = confirmed / total (avoid division by 0)
  const conversionRate = totalBookings > 0
    ? Math.round((confirmedBookings / totalBookings) * 100)
    : 0;

  return {
    totalBookings, confirmedBookings, conversionRate,
    totalThemes, totalPartners,
    totalRevenuePaise: revenue[0]?.total || 0,
    topThemes, categoryBreakdown, topCities, weeklyTrend, partnerPerformance,
  };
}

async function adminListCategories() {
  return EventCategory.find().sort({ sortOrder: 1 }).lean();
}

async function adminUpsertCategory(data) {
  const { slug, ...rest } = data;
  return EventCategory.findOneAndUpdate({ slug }, { $set: rest }, { upsert: true, new: true }).lean();
}

module.exports = {
  getActiveConfig, listCategories, listThemes, getTheme, toggleSave, getSavedThemes,
  createBooking, getUserBookings, getBooking, cancelBooking, submitReview,
  adminListThemes, adminUpdateThemeStatus, adminListBookings,
  adminListPartners, adminCreatePartner, adminUpdatePartner,
  adminGetConfig, adminUpdateConfig, adminGetAnalytics,
  adminListCategories, adminUpsertCategory,
};
