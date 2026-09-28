const mongoose = require('mongoose');
const Shop = require('./shop.model');
const Worker = require('../worker/worker.model');
const Order = require('../order/order.model');
const { RepairBooking } = require('../repair/models/booking.model');
// The same split the settlement run uses, so what a shop is shown and what
// it is paid can never drift apart.
const { splitFor } = require('../repair/services/settlement.service');
const s3Service = require('../../core/storage/s3');
const { istParts } = require('../../core/time/ist');

/**
 * The S3 bucket is fully private — a raw stored key is never viewable
 * directly. Cover/gallery photos are shown to customers browsing shops (not
 * just the owner), so — like event theme images — we resolve them to a
 * time-limited signed GET URL at the API boundary instead of a private
 * per-owner streaming route.
 */

/**
 * Whether a shop is open right now, in the shape a customer screen needs.
 *
 * Computed here rather than in the browser because opening hours are a promise
 * the platform makes — two clients disagreeing about whether a shop is open is
 * a booking someone drives to for nothing.
 *
 * `openNow: null` means the shop has not stated its hours. Screens should say
 * "hours not listed" rather than guessing either way.
 */
function withOpenState(shop) {
  if (!shop) return shop;

  const hours = shop.hours || [];
  if (!hours.length) return { ...shop, openNow: null, todayHours: null };

  /*
   * India's clock, never the server's.
   *
   * Production runs UTC, so `new Date().getDay()/.getHours()` compared a shop's
   * IST opening hours against a UTC wall clock — 09:00-21:00 became 14:30-02:30
   * in real terms. Shops read as shut all morning and open after midnight, and
   * owners reported it as the shop closing itself on refresh.
   */
  const now = istParts();
  const today = hours.find((h) => h.day === now.day) || null;

  const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };

  let openNow = false;
  if (today && !today.isClosed) {
    const open = toMinutes(today.opensAt);
    const close = toMinutes(today.closesAt);
    const minutes = now.minutesOfDay;
    if (open != null && close != null) {
      // A close time before the open time is an overnight shift, which is
      // ordinary for repair shops beside night markets.
      openNow = close > open
        ? minutes >= open && minutes < close
        : minutes >= open || minutes < close;
    }
  }

  return {
    ...shop,
    openNow,
    todayHours: today && !today.isClosed ? { opensAt: today.opensAt, closesAt: today.closesAt } : null,
  };
}

async function resolveShopImages(shop) {
  if (!shop) return shop;
  async function resolve(val) {
    if (!val || val.startsWith('http')) return val;
    try { return await s3Service.getViewUrl(val); } catch { return val; }
  }
  shop.coverImageUrl = await resolve(shop.coverImageUrl);
  if (Array.isArray(shop.galleryImages)) {
    shop.galleryImages = await Promise.all(shop.galleryImages.map(resolve));
  }
  return shop;
}

/**
 * Nearby, bookable shops for a given service — the "Nearby Shops" browse
 * screen. Only shops that pass `isDiscoverable()` can ever appear here; the
 * query encodes the same gate directly (can't call an instance method inside
 * an aggregation $match) so it stays correct if the two ever drift, but
 * they're written to match on purpose.
 */
async function findNearbyShops({ lat, lng, service, radiusKm = 10, limit = 20 }) {
  const query = {
    isActive: true,
    isBlocked: false,
    'kyc.status': 'approved',
    services: { $exists: true, $not: { $size: 0 } },
    'address.location.coordinates': { $exists: true },
  };
  if (service) query.services = service;

  const shops = await Shop.find(query)
    .where('address.location').near({
      center: { type: 'Point', coordinates: [lng, lat] },
      maxDistance: radiusKm * 1000, // metres
    })
    .limit(limit)
    .select('businessName category services address coverImageUrl rating reviewCount completedJobs yearsActive hours')
    .lean();

  const withImages = await Promise.all(shops.map(resolveShopImages));
  return withImages.map(withOpenState);
}

/** Full shop profile for a customer-facing shop page. */
async function getShopProfile(shopId) {
  const shop = await Shop.findOne({ _id: shopId, isBlocked: false }).lean();
  if (!shop || shop.kyc?.status !== 'approved') return null;
  return withOpenState(await resolveShopImages(shop));
}

/**
 * Update the parts of a shop's own profile it's allowed to self-edit.
 * KYC document fields are deliberately excluded — those only change via
 * submitKyc, which re-triggers admin review.
 */
/**
 * What a shop may change about itself.
 *
 * This list is the ONLY thing that actually persists — the route's Joi schema
 * merely decides what is allowed through the door. The two drifted: `hours` was
 * accepted by the schema, sent by the profile screen, and then dropped here, so
 * opening hours could never be saved. A shop that edited only its timings got
 * an empty patch and the server's "Nothing to update" error, which is exactly
 * what it looked like from the outside: pressing Update did nothing.
 *
 * Keep this in step with the schema in shop.routes.js.
 */
const PROFILE_FIELDS = [
  'businessName', 'category', 'services', 'address', 'hours', 'coverImageUrl',
  'galleryImages', 'bio', 'yearsActive', 'isActive',
];
async function updateProfile(shopId, patch) {
  const set = {};
  for (const key of PROFILE_FIELDS) {
    if (patch[key] !== undefined) set[key] = patch[key];
  }
  if (Object.keys(set).length === 0) {
    throw Object.assign(new Error('Nothing to update'), { status: 400 });
  }
  const shop = await Shop.findByIdAndUpdate(shopId, { $set: set }, { new: true, runValidators: true });
  if (!shop) throw Object.assign(new Error('Shop not found'), { status: 404 });
  // Saving new hours must move the badge immediately, not on the next reload.
  return withOpenState(await resolveShopImages(shop.toObject()));
}

/**
 * Owner adds a worker to their roster. Reuses the EXISTING Worker model and
 * its own KYC flow entirely — a shop worker is a real, individually-verified
 * Worker, just tagged with `shopId`. If the phone is already a worker
 * anywhere else, this links the EXISTING record rather than creating a
 * duplicate (matches the rest of the codebase's "phone is the identity"
 * convention for User/Worker/Shop).
 */
async function addWorkerToShop(shopId, { phone, name, skills }) {
  let worker = await Worker.findOne({ phone });

  if (worker) {
    if (worker.shopId && String(worker.shopId) !== String(shopId)) {
      throw Object.assign(
        new Error('This phone number is already registered to a different shop.'),
        { status: 409, code: 'WORKER_ALREADY_AT_ANOTHER_SHOP' },
      );
    }
    // Adding a number must not take over someone's independent account (and lock
    // them out of Rakshak); moving an independent worker into a shop goes via support.
    if (!worker.shopId) {
      throw Object.assign(
        new Error('This number already has its own ZappyOne worker account. Ask them to contact support to join your shop.'),
        { status: 409, code: 'WORKER_IS_INDEPENDENT' },
      );
    }
    worker.shopId = shopId;
    if (Array.isArray(skills) && skills.length) worker.skills = [...new Set([...worker.skills, ...skills])];
    await worker.save();
    return { worker, isNew: false };
  }

  if (!name) {
    throw Object.assign(
      new Error('New worker requires a name'),
      { status: 400, code: 'WORKER_DETAILS_REQUIRED' },
    );
  }

  /**
   * A technician inherits what the SHOP is approved for.
   *
   * They used to be added by ticking a hardcoded skill list — "Screen
   * Replacement", "Laptop Motherboard", "CCTV Install" — shown in full to every
   * shop, so a phone-repair shop was asked to pick laptop and CCTV skills for
   * someone who will only ever touch phones.
   *
   * Under the provider-first model that list is the wrong question entirely.
   * What a technician may work on is decided by the shop's approved services
   * and its repair capabilities, not by a per-person checklist typed at the
   * moment of hiring — and repair jobs reach them by being ASSIGNED by the
   * owner, not by skill matching. So the shop's own services are copied down,
   * and an explicit list is honoured only if a caller still sends one.
   */
  const shop = await Shop.findById(shopId).select('services').lean();
  const inherited = Array.isArray(skills) && skills.length
    ? skills
    : (shop?.services || []);

  worker = await Worker.create({
    phone, name, shopId,
    skills: inherited,
    kyc: { status: 'not_submitted' }, // the worker still completes their OWN KYC before going online
  });
  return { worker, isNew: true };
}

async function listShopWorkers(shopId) {
  return Worker.find({ shopId })
    .select('name phone skills rating totalJobs completedJobs isOnline isAvailable kyc.status createdAt')
    .lean();
}

/**
 * What a shop's technician sees at the top of their panel: who they work for,
 * and the jobs they finished. Values are what the customer paid the shop — the
 * shop pays its own staff, so ZappyOne never states anyone's personal pay.
 */
async function shopWorkerSummary(workerId) {
  const worker = await Worker.findById(workerId).select('shopId').lean();
  if (!worker?.shopId) throw Object.assign(new Error('You are not on a shop team'), { status: 404, code: 'NOT_A_SHOP_WORKER' });

  const { listBookings } = require('../admin-portal/bookings.source');
  const { istDayStart, istWeekStart } = require('../../core/time/ist');
  const dayStart = istDayStart();
  const weekStart = istWeekStart();
  const [shop, { rows }] = await Promise.all([
    Shop.findById(worker.shopId).select('businessName ownerName phone').lean(),
    // Jobs created up to two weeks earlier can still complete this week.
    listBookings({ workerId, from: new Date(weekStart.getTime() - 14 * 86_400_000), limit: 5000, perSourceLimit: 2000 }),
  ]);

  const done = rows.filter((r) => r.statusBucket === 'completed' && r.completedAt);
  const tally = (since) => {
    const own = done.filter((r) => new Date(r.completedAt) >= since);
    return { jobs: own.length, valuePaise: own.reduce((sum, r) => sum + (r.totalPaise || 0), 0) };
  };
  return {
    shop: shop && { name: shop.businessName, ownerName: shop.ownerName, phone: shop.phone },
    today: tally(dayStart),
    week: tally(weekStart),
  };
}

async function removeWorkerFromShop(shopId, workerId) {
  const worker = await Worker.findOne({ _id: workerId, shopId });
  if (!worker) throw Object.assign(new Error('Worker not found on this shop'), { status: 404 });
  worker.shopId = null;
  await worker.save();
  return worker;
}

/**
 * Shop-level earnings — sums the SAME `earnings.workerPaise` the individual
 * worker earnings screen reads (worker.service.js's getEarnings), across
 * every worker tagged to this shop, for orders routed to this shop
 * (`preferredShopId`) OR completed by one of its workers regardless of route
 * (a shop worker picked up via ordinary Express dispatch still earns the shop
 * owner's oversight, even if the booking wasn't shop-initiated).
 */
/**
 * What this shop actually earned in a window.
 *
 * Three bugs lived here, and together they showed a working shop ₹0:
 *
 *   1. ONLY ORDERS WERE COUNTED. The entire repair business — phones, laptops,
 *      two- and four-wheelers, which is most of what a shop now does — was
 *      invisible. A shop that repaired ten phones today saw nothing.
 *
 *   2. NO WORKERS MEANT NO EARNINGS. It returned zeros early when the shop had
 *      no workers on its roster, but a repair booking can be assigned to the
 *      SHOP itself. An owner working their own bench earned nothing on screen.
 *
 *   3. THE FALLBACK WAS A MAGIC NUMBER. `pricing.total * 80` silently assumed
 *      an 80% provider share, which contradicts the configured commission and
 *      would quietly misreport every payout the day that rate changed.
 *
 * Repair earnings now come from `splitFor` — the same function that performs
 * the actual settlement — so what a shop is SHOWN and what it is PAID cannot
 * drift apart.
 */
async function getShopEarnings(shopId, range = 'today') {
  let since;
  if (range === 'today') since = new Date(new Date().setHours(0, 0, 0, 0));
  else if (range === 'week') since = new Date(Date.now() - 7 * 86400 * 1000);
  else since = new Date(Date.now() - 30 * 86400 * 1000);

  const sid = mongoose.Types.ObjectId.createFromHexString(String(shopId));
  const workerIds = (await Worker.find({ shopId: sid }).select('_id').lean()).map((w) => w._id);

  /* Legacy order flow */
  const [orderAgg] = workerIds.length
    ? await Order.aggregate([
      { $match: { workerId: { $in: workerIds }, status: 'completed', completedAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          jobs: { $sum: 1 },
          // Only the recorded figure. A booking with no snapshotted earnings
          // contributes nothing rather than an invented share.
          earningsPaise: { $sum: { $ifNull: ['$earnings.workerPaise', 0] } },
        },
      },
    ])
    : [];

  /* Repair flow: the shop's own jobs AND its workers' */
  const repairs = await RepairBooking.find({
    $or: [{ shopId: sid }, ...(workerIds.length ? [{ workerId: { $in: workerIds } }] : [])],
    status: 'COMPLETED',
    completedAt: { $gte: since },
  }).select('priceSnapshot completedAt').lean();

  /**
   * A 7-day earnings series for the dashboard chart.
   *
   * Always the last 7 days regardless of the range asked for, so the chart is
   * stable while the headline number follows the range — the same shape the
   * worker dashboard uses, so both screens read alike.
   */
  const weekStart = new Date(new Date().setHours(0, 0, 0, 0) - 13 * 86400 * 1000);
  const byDay = new Map();
  for (let i = 0; i < 14; i++) {
    const d = new Date(weekStart.getTime() + i * 86400 * 1000);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  const addDay = (when, paise) => {
    if (!when) return;
    const key = new Date(when).toISOString().slice(0, 10);
    if (byDay.has(key)) byDay.set(key, byDay.get(key) + paise);
  };
  if (workerIds.length) {
    const dailyOrders = await Order.aggregate([
      { $match: { workerId: { $in: workerIds }, status: 'completed', completedAt: { $gte: weekStart } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } }, paise: { $sum: { $ifNull: ['$earnings.workerPaise', 0] } } } },
    ]);
    for (const d of dailyOrders) if (byDay.has(d._id)) byDay.set(d._id, byDay.get(d._id) + d.paise);
  }
  for (const b of repairs) addDay(b.completedAt, splitFor(b).providerPaise);

  const dailyBreakdown = [...byDay.entries()].map(([date, paise]) => ({
    date,
    earningsPaise: Math.round(paise),
  }));

  const repairPaise = repairs.reduce((sum, b) => sum + splitFor(b).providerPaise, 0);

  const earningsPaise = Math.round((orderAgg?.earningsPaise || 0) + repairPaise);

  return {
    range,
    jobs: (orderAgg?.jobs || 0) + repairs.length,
    earningsPaise,
    earningsRupees: Math.round(earningsPaise / 100),
    workerCount: workerIds.length,
    /** Split out so a shop can see where the money came from. */
    breakdown: {
      orders: { jobs: orderAgg?.jobs || 0, earningsPaise: Math.round(orderAgg?.earningsPaise || 0) },
      repairs: { jobs: repairs.length, earningsPaise: Math.round(repairPaise) },
    },
    /** Last 7 days, for the dashboard trend chart. */
    dailyBreakdown,
  };
}

module.exports = {
  findNearbyShops,
  getShopProfile,
  updateProfile,
  addWorkerToShop,
  listShopWorkers,
  shopWorkerSummary,
  removeWorkerFromShop,
  getShopEarnings,
  resolveShopImages,
  /**
   * The open/closed rule, exported so NOBODY recomputes it.
   *
   * The shop dashboard had its own copy running on the browser's clock while
   * customers saw this one running on the server's. Two answers to "are you
   * open" is one too many: an owner on a device with the wrong timezone was
   * shown "Open" while every customer was shown "Closed".
   */
  withOpenState,
  /** Test alias, kept so existing suites keep reading the rule directly. */
  __withOpenState: withOpenState,
};
