/**
 * Pet Services HTTP layer.
 *
 * Every handler re-derives price, ownership and status server-side (§54).
 * Nothing about money, a pet's identity or a booking's state is trusted from
 * the request body — it is either read from the database or computed here.
 */

const PetPassport = require('../service/pet-passport.model');
const {
  Breed, PetServiceCategory, PetServiceVariant, PetServiceAddon, PetServicePackage, PetServiceArea,
} = require('./models/catalog.model');
const { PetBooking, CANCELLABLE_FROM } = require('./models/booking.model');
const { PetRecurringBooking } = require('./models/recurring.model');
const { PetPricingRule, PetProviderCapability } = require('./models/config.model');
const pricingService = require('./services/pricing.service');
const matchingService = require('./services/matching.service');
const bookingService = require('./services/booking.service');
const paymentService = require('./services/payment.service');

/** What a provider may move a booking to by hand; completion and payment have their own paths. */
const PROVIDER_SETTABLE = ['PROVIDER_EN_ROUTE', 'PROVIDER_ARRIVED', 'PET_HANDOVER', 'SERVICE_STARTED', 'SERVICE_PAUSED'];
const s3Service = require('../../core/storage/s3');
const { providerCard } = require('../worker/provider-card');
const { approvedLines, assertApproved, lineOf } = require('../onboarding/eligibility');
const { announce } = require('../jobs/job-events');
const { KINDS } = require('../jobs/kinds');
const { haversineKm } = require('../../core/geo/distance');

function mayView(booking, auth) {
  const id = String(auth.sub);
  return auth.role === 'admin'
    || (auth.role === 'user' && String(booking.userId) === id)
    || (auth.role === 'worker' && String(booking.workerId || '') === id)
    || (auth.role === 'shop' && String(booking.shopId || '') === id);
}

async function signBooking(booking) {
  const signed = await s3Service.signDocMedia({ proofKeys: (booking.proofs || []).map((p) => p.key) });
  const urls = signed.proofKeys || [];
  return { ...booking, proofs: (booking.proofs || []).map((p, i) => ({ ...p, url: urls[i] || null })) };
}

/* Catalog (public-ish; the customer needs it before signing in) */

async function listCategories(req, res, next) {
  try {
    const categories = await PetServiceCategory.find({ isActive: true }).sort({ displayOrder: 1 }).lean();
    res.json({ categories: await s3Service.signDocsMedia(categories) });
  } catch (err) { next(err); }
}

async function listVariants(req, res, next) {
  try {
    const { categoryCode, species } = req.query;
    const filter = { isActive: true, isArchived: false };
    if (categoryCode) filter.categoryCode = String(categoryCode).toLowerCase();
    if (species) filter.species = species;
    const variants = await PetServiceVariant.find(filter).sort({ displayOrder: 1 }).lean();
    res.json({ variants });
  } catch (err) { next(err); }
}

async function listBreeds(req, res, next) {
  try {
    const { species } = req.query;
    const filter = { isActive: true };
    if (species) filter.species = species;
    const breeds = await Breed.find(filter).sort({ isPopular: -1, displayOrder: 1, name: 1 }).lean();
    res.json({ breeds });
  } catch (err) { next(err); }
}

async function listAddons(req, res, next) {
  try {
    const { categoryCode, species } = req.query;
    const filter = { isActive: true };
    if (categoryCode) filter.categoryCodes = categoryCode;
    if (species) filter.species = species;
    const addons = await PetServiceAddon.find(filter).sort({ displayOrder: 1 }).lean();
    res.json({ addons });
  } catch (err) { next(err); }
}

async function listPackages(req, res, next) {
  try {
    const { species } = req.query;
    const filter = { isActive: true };
    if (species) filter.species = species;
    const packages = await PetServicePackage.find(filter).sort({ displayOrder: 1 }).lean();
    res.json({ packages });
  } catch (err) { next(err); }
}

async function listServiceAreas(req, res, next) {
  try {
    const areas = await PetServiceArea.find({ isActive: true }).lean();
    res.json({ areas });
  } catch (err) { next(err); }
}

/** Compatibility check surfaced directly, so the UI can grey out an option before the customer picks it and hits a wall. */
async function checkCompatibility(req, res, next) {
  try {
    const { species, categoryCode, variantCode, size } = req.query;
    const result = await matchingService.checkCompatibility({ species, categoryCode, variantCode: variantCode || null, size: size || null });
    res.json(result);
  } catch (err) { next(err); }
}

/* Pet profiles (§4) */

async function listMyPets(req, res, next) {
  try {
    const pets = await PetPassport.find({ userId: req.auth.sub, isArchived: false }).sort({ createdAt: -1 }).lean();
    res.json({ pets: await s3Service.signDocsMedia(pets) });
  } catch (err) { next(err); }
}

async function createPet(req, res, next) {
  try {
    const pet = await PetPassport.create({
      ...req.body,
      userId: req.auth.sub,
      photoKey: req.body.photoKey ? s3Service.keyFromMedia(req.body.photoKey) : '',
    });
    res.status(201).json({ pet });
  } catch (err) { next(err); }
}

async function updatePet(req, res, next) {
  try {
    const patch = { ...req.body };
    if (req.body.photoKey) patch.photoKey = s3Service.keyFromMedia(req.body.photoKey);
    // If the customer corrects the size, the record says who confirmed it.
    if (req.body.size) patch.sizeConfirmedBy = 'customer';

    const pet = await PetPassport.findOneAndUpdate(
      { _id: req.params.id, userId: req.auth.sub },
      { $set: patch },
      { new: true },
    ).lean();
    if (!pet) return res.status(404).json({ error: 'Pet not found' });
    res.json({ pet });
  } catch (err) { next(err); }
}

async function archivePet(req, res, next) {
  try {
    const pet = await PetPassport.findOneAndUpdate(
      { _id: req.params.id, userId: req.auth.sub },
      { $set: { isArchived: true } },
      { new: true },
    ).lean();
    if (!pet) return res.status(404).json({ error: 'Pet not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function getPetHistory(req, res, next) {
  try {
    const pet = await PetPassport.findOne({ _id: req.params.id, userId: req.auth.sub }).lean();
    if (!pet) return res.status(404).json({ error: 'Pet not found' });
    res.json({ pet, history: [...(pet.serviceHistory || [])].sort((a, b) => new Date(b.at) - new Date(a.at)) });
  } catch (err) { next(err); }
}

/* Quote & matching */

async function quote(req, res, next) {
  try {
    const { pets: petEntries = [], ...rest } = req.body;
    const withPets = await bookingService.loadOwnedPets(req.auth.sub, petEntries);
    const result = await pricingService.quote({
      ...rest,
      pets: withPets.map((e) => ({ pet: e.pet, variantCode: e.variantCode, addonCodes: e.addonCodes, durationMinutes: e.durationMinutes })),
      serviceLocation: rest.serviceLocation?.coordinates || null,
    });
    res.json({ quote: result });
  } catch (err) { next(err); }
}

async function findProviders(req, res, next) {
  try {
    const { pets: petEntries = [], ...rest } = req.body;
    const withPets = await bookingService.loadOwnedPets(req.auth.sub, petEntries);
    const result = await matchingService.findProviders({
      ...rest,
      pets: withPets.map((e) => ({ pet: e.pet, variantCode: e.variantCode })),
      serviceLocation: rest.serviceLocation?.coordinates || null,
    });
    res.json(result);
  } catch (err) { next(err); }
}

/* Bookings */

async function createBooking(req, res, next) {
  try {
    const { booking, replayed } = await bookingService.createBooking({
      ...req.body,
      userId: req.auth.sub,
      idempotencyKey: req.get('Idempotency-Key') || req.body.idempotencyKey || null,
    });
    res.status(replayed ? 200 : 201).json({ booking, replayed });
  } catch (err) { next(err); }
}

async function listMyBookings(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = 20;
    const filter = { userId: req.auth.sub };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.categoryCode) filter.categoryCode = req.query.categoryCode;

    const [bookings, total] = await Promise.all([
      PetBooking.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PetBooking.countDocuments(filter),
    ]);
    res.json({ bookings, total, page });
  } catch (err) { next(err); }
}

const NOT_YET_INTRODUCED = [
  'REQUESTED', 'PRICE_PENDING', 'AWAITING_CUSTOMER_APPROVAL', 'BOOKED', 'PROVIDER_SEARCHING', 'PROVIDER_ASSIGNED',
];

async function getBooking(req, res, next) {
  try {
    const booking = await PetBooking.findById(req.params.id).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!mayView(booking, req.auth)) return res.status(403).json({ error: 'You do not have access to this booking' });

    // Named once they've accepted; before that the assignment can still move.
    const introduced = !NOT_YET_INTRODUCED.includes(booking.status);
    // The handover code proves the right person turned up; only the customer holds it.
    if (req.auth.role !== 'user') delete booking.handoverOtp;
    res.json({
      booking: await signBooking(booking),
      provider: introduced ? await providerCard(booking, { fallbackName: 'Your pet pro' }) : null,
      canCancel: CANCELLABLE_FROM.includes(booking.status),
    });
  } catch (err) { next(err); }
}

async function cancelBooking(req, res, next) {
  try {
    const result = await bookingService.cancelBooking({
      bookingId: req.params.id, actorId: req.auth.sub, by: 'customer', reason: req.body.reason,
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function rateBooking(req, res, next) {
  try {
    const booking = await PetBooking.findOne({ _id: req.params.id, userId: req.auth.sub })
      .select('status workerId shopId rating ratedAt').lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!['SERVICE_COMPLETED', 'CUSTOMER_CONFIRMATION', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'CLOSED'].includes(booking.status)) {
      return res.status(409).json({ error: 'You can rate this once the service is complete', code: 'NOT_COMPLETED' });
    }
    if (booking.ratedAt) return res.status(409).json({ error: 'Already rated', code: 'ALREADY_RATED' });

    await PetBooking.updateOne(
      { _id: req.params.id, ratedAt: null },
      { $set: { rating: req.body.rating, ratingComment: req.body.comment || '', ratedAt: new Date() } },
    );

    const ratingService = require('../repair/services/rating.service');
    await ratingService.applyRepairRating({
      workerId: booking.workerId, shopId: booking.shopId, rating: req.body.rating,
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) { next(err); }
}

/* Worker execution */

/** Bookings nobody holds yet. */
const OPEN = ['BOOKED', 'PROVIDER_SEARCHING'];
const OPEN_RADIUS_KM = 15;

/** Where this provider works from: their last position, or their shop. */
async function providerPoint(auth) {
  if (auth.role === 'shop') {
    const shop = await require('../shop/shop.model').findById(auth.sub).select('address.location').lean();
    return shop?.address?.location?.coordinates;
  }
  const worker = await require('../worker/worker.model').findById(auth.sub).select('currentLocation').lean();
  return worker?.currentLocation?.coordinates;
}

/**
 * Open bookings a provider could take: only services they're approved for,
 * only near them, and only what they need to decide — never the customer's id,
 * the pets' medical notes or the handover code.
 */
async function listAvailableBookings(req, res, next) {
  try {
    const lines = await approvedLines({ role: req.auth.role, id: req.auth.sub });
    if (!lines.size) return res.json({ bookings: [], notApproved: true });

    const filter = {
      workerId: null, shopId: null, status: { $in: OPEN }, categoryCode: { $in: [...lines] },
      declinedBy: { $ne: req.auth.sub }, // not offered back to someone who passed
    };
    if (req.query.categoryCode) filter.categoryCode = lines.has(req.query.categoryCode) ? req.query.categoryCode : '__none__';
    const at = await providerPoint(req.auth);
    const query = at?.length === 2
      ? PetBooking.find({ ...filter, serviceLocation: { $near: { $geometry: { type: 'Point', coordinates: at }, $maxDistance: OPEN_RADIUS_KM * 1000 } } })
      : PetBooking.find(filter).sort({ scheduledAt: 1, checkInAt: 1 });
    const bookings = await query.limit(30).lean();

    res.json({
      bookings: bookings.map((b) => ({
        _id: b._id,
        reference: b.reference,
        categoryCode: b.categoryCode,
        serviceMode: b.serviceMode,
        pets: (b.pets || []).map((pet) => ({ snapshot: { name: pet.snapshot?.name, species: pet.snapshot?.species, size: pet.snapshot?.size } })),
        serviceLocation: { address: b.serviceLocation?.address || '' },
        km: at?.length === 2 && b.serviceLocation?.coordinates?.length === 2
          ? Number(haversineKm(at[1], at[0], b.serviceLocation.coordinates[1], b.serviceLocation.coordinates[0]).toFixed(1)) : null,
        scheduledAt: b.scheduledAt,
        checkInAt: b.checkInAt,
        checkOutAt: b.checkOutAt,
        pricing: { providerAmountPaise: b.pricing?.providerAmountPaise || 0 },
      })),
    });
  } catch (err) { next(err); }
}

/** The provider's own jobs still in hand, including ones waiting for payment. */
const PROVIDER_ACTIVE = [
  'PROVIDER_ASSIGNED', 'PROVIDER_ACCEPTED', 'PROVIDER_EN_ROUTE', 'PROVIDER_ARRIVED', 'PET_HANDOVER',
  'SERVICE_STARTED', 'SERVICE_PAUSED', 'SERVICE_COMPLETED', 'CUSTOMER_CONFIRMATION', 'PAYMENT_PENDING',
];
async function listAssignedBookings(req, res, next) {
  try {
    const owner = req.auth.role === 'shop' ? { shopId: req.auth.sub } : { workerId: req.auth.sub };
    const bookings = await PetBooking.find({ ...owner, status: { $in: PROVIDER_ACTIVE } })
      .sort({ scheduledAt: 1, createdAt: 1 }).limit(50).lean();
    // An offer's deadline, so the app can still ring for one it missed live.
    const windowMs = KINDS.pet.offer.windowMin * 60000;
    res.json({
      bookings: bookings.map(({ handoverOtp, ...b }) => ({
        ...b,
        offerExpiresAt: b.status === 'PROVIDER_ASSIGNED' && b.assignedAt ? new Date(new Date(b.assignedAt).getTime() + windowMs) : null,
      })),
    });
  } catch (err) { next(err); }
}

/**
 * Take a booking. Two ways in:
 *   - it was offered to this provider (the customer chose them), or
 *   - it is open, and this provider is approved for the service.
 * Claimed atomically: two providers tapping at once can't both get it.
 */
async function acceptBooking(req, res, next) {
  try {
    const auth = { role: req.auth.role, id: req.auth.sub };
    const owner = auth.role === 'shop' ? { shopId: auth.id } : { workerId: auth.id };
    const current = await PetBooking.findById(req.params.id).select('status categoryCode serviceMode checkInAt checkOutAt pets workerId shopId').lean();
    if (!current) return res.status(404).json({ error: 'Booking not found' });

    const offeredToMe = current.status === 'PROVIDER_ASSIGNED'
      && (String(current.workerId || '') === String(auth.id) || String(current.shopId || '') === String(auth.id));
    if (!offeredToMe) {
      await assertApproved(auth, await lineOf('pet', current));
      // A stay needs a free bed with THIS provider before they can take it.
      if (['boarding', 'daycare'].includes(current.serviceMode) && current.checkInAt) {
        const capability = await PetProviderCapability.findOne({ ...owner, isActive: true, verificationStatus: 'verified' }).lean();
        if (!capability) return res.status(409).json({ error: 'Set up your pet care details first', code: 'NO_CAPABILITY' });
        await matchingService.claimCapacity({
          capability, checkInAt: current.checkInAt, checkOutAt: current.checkOutAt,
          bedsNeeded: (current.pets || []).length || 1, isDaycare: current.serviceMode === 'daycare',
        });
      }
    }

    const booking = await PetBooking.findOneAndUpdate(
      offeredToMe
        ? { _id: req.params.id, status: 'PROVIDER_ASSIGNED', ...owner }
        : { _id: req.params.id, workerId: null, shopId: null, status: { $in: OPEN } },
      {
        $set: { ...owner, status: 'PROVIDER_ACCEPTED' },
        $push: { statusHistory: { status: 'PROVIDER_ACCEPTED', at: new Date(), by: auth.id, byRole: auth.role } },
      },
      { new: true },
    ).lean();

    if (!booking) return res.status(409).json({ error: 'Another provider has already taken this', code: 'ALREADY_CLAIMED' });
    announce('pet', booking, 'PROVIDER_ACCEPTED');
    res.json({ booking });
  } catch (err) { next(err); }
}

/** The chosen provider can't do it: the booking opens to everyone approved nearby. */
async function declineBooking(req, res, next) {
  try {
    const booking = await bookingService.releaseAssignment({
      bookingId: req.params.id, auth: { role: req.auth.role, id: req.auth.sub }, reason: req.body?.reason || 'Declined',
    });
    if (!booking) return res.status(409).json({ error: 'This booking is no longer waiting for you', code: 'NOT_OFFERED' });
    res.json({ booking });
  } catch (err) { next(err); }
}

async function advanceStatus(req, res, next) {
  try {
    const booking = await PetBooking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const owns = String(booking.workerId || '') === String(req.auth.sub) || String(booking.shopId || '') === String(req.auth.sub);
    if (!owns) return res.status(403).json({ error: 'This is not your booking' });

    if (req.body.status === 'SERVICE_COMPLETED') {
      const settled = await bookingService.completeBooking({ bookingId: booking._id, workerId: req.auth.sub });
      return res.json({ booking: settled });
    }
    // Money states are reached by payment, never set by hand.
    if (!PROVIDER_SETTABLE.includes(req.body.status)) {
      return res.status(409).json({ error: 'That status is set by the system, not the provider', code: 'NOT_PROVIDER_STATUS' });
    }

    booking.transitionTo(req.body.status, { by: req.auth.sub, byRole: req.auth.role, note: req.body.note || '' });
    await booking.save();
    res.json({ booking: booking.toObject() });
  } catch (err) { next(err); }
}

/** The provider took the customer's cash. */
async function collectCash(req, res, next) {
  try {
    res.json(await paymentService.recordCash({ bookingId: req.params.id, providerId: req.auth.sub }));
  } catch (err) { next(err); }
}

async function addProof(req, res, next) {
  try {
    const booking = await PetBooking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const owns = String(booking.workerId || '') === String(req.auth.sub) || String(booking.shopId || '') === String(req.auth.sub);
    if (!owns) return res.status(403).json({ error: 'This is not your booking' });

    booking.proofs.push({
      kind: req.body.kind,
      key: s3Service.keyFromMedia(req.body.key),
      note: req.body.note || '',
      petId: req.body.petId || null,
      capturedAt: new Date(),
      ...(req.body.lat != null && req.body.lng != null
        ? { location: { type: 'Point', coordinates: [req.body.lng, req.body.lat] } } : {}),
    });
    await booking.save();
    res.json({ booking: await signBooking(booking.toObject()) });
  } catch (err) { next(err); }
}

async function updateExecution(req, res, next) {
  try {
    const booking = await PetBooking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const owns = String(booking.workerId || '') === String(req.auth.sub) || String(booking.shopId || '') === String(req.auth.sub);
    if (!owns) return res.status(403).json({ error: 'This is not your booking' });

    Object.assign(booking.execution, req.body);
    await booking.save();
    res.json({ booking: booking.toObject() });
  } catch (err) { next(err); }
}

/* Recurring bookings (§32) */

async function createRecurring(req, res, next) {
  try {
    const schedule = await PetRecurringBooking.create({ ...req.body, userId: req.auth.sub });
    const result = await bookingService.generateOccurrences(schedule._id);
    res.status(201).json({ schedule: schedule.toObject(), generated: result.created });
  } catch (err) { next(err); }
}

async function listMyRecurring(req, res, next) {
  try {
    const schedules = await PetRecurringBooking.find({ userId: req.auth.sub }).sort({ createdAt: -1 }).lean();
    res.json({ schedules });
  } catch (err) { next(err); }
}

async function pauseRecurring(req, res, next) {
  try {
    const schedule = await PetRecurringBooking.findOneAndUpdate(
      { _id: req.params.id, userId: req.auth.sub },
      { $set: { status: 'paused', pausedAt: new Date() } },
      { new: true },
    ).lean();
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    res.json({ schedule });
  } catch (err) { next(err); }
}

async function resumeRecurring(req, res, next) {
  try {
    const schedule = await PetRecurringBooking.findOneAndUpdate(
      { _id: req.params.id, userId: req.auth.sub, status: 'paused' },
      { $set: { status: 'active' } },
      { new: true },
    ).lean();
    if (!schedule) return res.status(404).json({ error: 'Schedule not found or not paused' });
    res.json({ schedule });
  } catch (err) { next(err); }
}

async function cancelRecurring(req, res, next) {
  try {
    const schedule = await PetRecurringBooking.findOneAndUpdate(
      { _id: req.params.id, userId: req.auth.sub },
      { $set: { status: 'cancelled', cancelledAt: new Date() } },
      { new: true },
    ).lean();
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    res.json({ schedule });
  } catch (err) { next(err); }
}

async function skipRecurringDate(req, res, next) {
  try {
    const schedule = await PetRecurringBooking.findOneAndUpdate(
      { _id: req.params.id, userId: req.auth.sub },
      { $addToSet: { skippedDates: req.body.date } },
      { new: true },
    ).lean();
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    res.json({ schedule });
  } catch (err) { next(err); }
}

/* Admin (§46, §47) */

async function adminListBookings(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = 25;
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.categoryCode) filter.categoryCode = req.query.categoryCode;
    const [bookings, total] = await Promise.all([
      PetBooking.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PetBooking.countDocuments(filter),
    ]);
    res.json({ bookings, total, page });
  } catch (err) { next(err); }
}

async function adminGetPricing(req, res, next) {
  try {
    const rules = await PetPricingRule.find({}).sort({ categoryCode: 1, variantCode: 1 }).lean();
    res.json({ rules });
  } catch (err) { next(err); }
}

async function adminUpdatePricing(req, res, next) {
  try {
    const rule = await PetPricingRule.findByIdAndUpdate(
      req.params.id, { $set: req.body }, { new: true, runValidators: true },
    ).lean();
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    pricingService.invalidateRuleCache();
    res.json({ rule });
  } catch (err) { next(err); }
}

async function adminListCapabilities(req, res, next) {
  try {
    const filter = {};
    if (req.query.verificationStatus) filter.verificationStatus = req.query.verificationStatus;
    const capabilities = await PetProviderCapability.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ capabilities });
  } catch (err) { next(err); }
}

async function adminUpdateCapability(req, res, next) {
  try {
    const capability = await PetProviderCapability.findByIdAndUpdate(
      req.params.id, { $set: req.body }, { new: true, runValidators: true },
    ).lean();
    if (!capability) return res.status(404).json({ error: 'Capability not found' });
    res.json({ capability });
  } catch (err) { next(err); }
}

module.exports = {
  listCategories, listVariants, listBreeds, listAddons, listPackages, listServiceAreas, checkCompatibility,
  listMyPets, createPet, updatePet, archivePet, getPetHistory,
  quote, findProviders,
  createBooking, listMyBookings, getBooking, cancelBooking, rateBooking,
  listAvailableBookings, listAssignedBookings, acceptBooking, declineBooking, advanceStatus, collectCash, addProof, updateExecution,
  createRecurring, listMyRecurring, pauseRecurring, resumeRecurring, cancelRecurring, skipRecurringDate,
  adminListBookings, adminGetPricing, adminUpdatePricing, adminListCapabilities, adminUpdateCapability,
};
