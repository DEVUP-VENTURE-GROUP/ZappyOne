/**
 * Pet Services booking lifecycle.
 *
 * Nothing about money, compatibility, capacity or status comes from the
 * client (§54). The caller says what they want; this file decides whether it
 * is allowed, what it costs, and who can do it.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const { PetBooking, CANCELLABLE_FROM } = require('../models/booking.model');
const { PetRecurringBooking, dateKey } = require('../models/recurring.model');
const { PetCancellationPolicy, PetProviderCapability } = require('../models/config.model');
const { PetServiceVariant } = require('../models/catalog.model');
const PetPassport = require('../../service/pet-passport.model');
const pricingService = require('./pricing.service');
const matchingService = require('./matching.service');
const notificationService = require('../../notification/notification.service');
const logger = require('../../../core/logger');
const zoneService = require('../../zone/zone.service');
const { httpError } = require('../../../core/errors');


function reference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return `ZP${out}`;
}

const notify = (userId, title, body, booking) => notificationService.notify({
  recipient: { kind: 'user', id: userId },
  type: 'order_placed',
  title,
  body,
  deepLink: `/pet/bookings/${booking._id}`,
  data: { petBookingId: String(booking._id) },
}).catch(() => {});

/**
 * Load the customer's pets and confirm they own them.
 *
 * Scoped by userId in the query itself: an id alone must never be enough to
 * book a service on somebody else's animal, or to read its medical notes.
 */
async function loadOwnedPets(userId, petEntries) {
  const ids = petEntries.map((p) => p.petId);
  const pets = await PetPassport.find({
    _id: { $in: ids }, userId, isArchived: false,
  });

  if (pets.length !== ids.length) {
    throw httpError('One of those pets was not found on your account', 404, 'PET_NOT_FOUND');
  }

  const byId = new Map(pets.map((p) => [String(p._id), p]));
  return petEntries.map((entry) => ({ ...entry, pet: byId.get(String(entry.petId)) }));
}

/* Creation */

async function createBooking({
  userId,
  categoryCode,
  serviceMode,
  pets: petEntries = [],
  scheduledAt = null,
  checkInAt = null,
  checkOutAt = null,
  serviceLocation = null,
  destination = null,
  serviceAreaCode = null,
  workerId = null,
  shopId = null,
  customerInstructions = '',
  paymentMethod = 'cash',
  packageCode = null,
  needsPickup = false,
  needsReturn = false,
  specialHandling = false,
  couponPaise = 0,
  recurringId = null,
  occurrenceIndex = null,
  idempotencyKey = null,
}) {
  if (idempotencyKey) {
    const existing = await PetBooking.findOne({ idempotencyKey }).lean();
    if (existing) return { booking: existing, replayed: true };
  }
  await zoneService.assertBookableLocation(serviceLocation);
  require('../../payment/payables').assertOnlineAvailable(paymentMethod);
  if (!petEntries.length) throw httpError('Choose at least one pet', 400, 'NO_PETS');

  const withPets = await loadOwnedPets(userId, petEntries);

  // Gate 1 — is this service allowed for these animals at all?
  const compat = await matchingService.checkAllPets({ pets: withPets, categoryCode });
  if (!compat.allowed) {
    throw httpError(compat.reason, 409, 'NOT_COMPATIBLE', { petName: compat.petName });
  }

  // The variant must genuinely support the mode being asked for.
  for (const entry of withPets) {
    const variant = await PetServiceVariant.findOne({
      code: entry.variantCode, isActive: true,
    }).lean();
    if (!variant) throw httpError('Unknown service', 400, 'UNKNOWN_VARIANT');
    if (!variant.allowedModes.includes(serviceMode)) {
      throw httpError('That service is not offered that way', 400, 'MODE_NOT_ALLOWED');
    }
    if (variant.species?.length && !variant.species.includes(entry.pet.species)) {
      throw httpError(`${variant.name} is not offered for ${entry.pet.species}s`, 409, 'SPECIES_NOT_OFFERED');
    }
  }

  const isStay = ['boarding', 'daycare'].includes(serviceMode);
  if (isStay && (!checkInAt || !checkOutAt)) {
    throw httpError('A stay needs a check-in and a check-out', 400, 'DATES_REQUIRED');
  }

  // Gate 3 — capacity, re-checked atomically just before the write.
  let capability = null;
  if (workerId || shopId) {
    capability = await PetProviderCapability.findOne({
      ...(shopId ? { shopId } : { workerId }), isActive: true, verificationStatus: 'verified',
    }).lean();

    if (!capability) throw httpError('That provider is not available', 409, 'PROVIDER_UNAVAILABLE');

    if (isStay) {
      await matchingService.claimCapacity({
        capability,
        checkInAt,
        checkOutAt,
        bedsNeeded: withPets.length,
        isDaycare: serviceMode === 'daycare',
      });
    }
  }

  const providerLocation = capability?.baseLocation?.coordinates || null;

  const pricing = await pricingService.quote({
    categoryCode,
    serviceMode,
    pets: withPets,
    checkInAt,
    checkOutAt,
    serviceLocation: serviceLocation?.coordinates || null,
    providerLocation,
    needsPickup,
    needsReturn,
    specialHandling,
    couponPaise,
    packageCode,
  });

  const lineByPet = new Map(pricing.lines.map((l) => [String(l.petId), l]));

  const bookingPets = withPets.map((entry) => {
    const line = lineByPet.get(String(entry.pet._id)) || {};
    return {
      petId: entry.pet._id,
      // Frozen at booking — the pet may change, this record may not.
      snapshot: {
        name: entry.pet.name,
        species: entry.pet.species,
        breedCode: entry.pet.breedCode,
        breed: entry.pet.breed,
        size: entry.pet.size,
        weight: entry.pet.weight,
        temperament: entry.pet.temperament,
        biteRisk: entry.pet.biteRisk,
        escapeRisk: entry.pet.escapeRisk,
        allergies: entry.pet.allergies,
        specialHandling: entry.pet.specialHandling,
        handlingBrief: entry.pet.handlingBriefFor(categoryCode),
      },
      variantCode: entry.variantCode,
      durationMinutes: entry.durationMinutes || null,
      addonCodes: entry.addonCodes || [],
      basePaise: line.basePaise || 0,
      sizeAdjustmentPaise: line.sizeAdjustmentPaise || 0,
      breedAdjustmentPaise: line.breedAdjustmentPaise || 0,
      addonsPaise: line.addonsPaise || 0,
      additionalPetDiscountPaise: line.additionalPetDiscountPaise || 0,
      linePaise: line.linePaise || 0,
      status: 'pending',
    };
  });

  const policy = await PetCancellationPolicy.findOne({
    categoryCodes: categoryCode, isActive: true,
  }).lean();

  const booking = await PetBooking.create({
    reference: reference(),
    userId,
    workerId,
    shopId,
    categoryCode,
    serviceMode,
    pets: bookingPets,
    scheduledAt,
    checkInAt,
    checkOutAt,
    nights: pricing.nights,
    serviceLocation,
    destination,
    serviceAreaCode,
    pricing,
    packageCode,
    customerInstructions,
    paymentMethod,
    cancellationPolicyCode: policy?.code || null,
    recurringId,
    occurrenceIndex,
    handoverOtp: String(crypto.randomInt(1000, 9999)),
    idempotencyKey,
    status: 'REQUESTED',
    statusHistory: [{ status: 'REQUESTED', at: new Date(), by: userId, byRole: 'user' }],
  });

  booking.transitionTo('BOOKED', { by: userId, byRole: 'user' });
  await booking.save();

  return { booking: booking.toObject(), replayed: false };
}

/* Cancellation (§37) */

/**
 * What a cancellation costs, read from the policy's tiers.
 *
 * Boarding is deliberately stricter than a walk: a held bed is a night the
 * provider could not sell to anyone else, so late cancellation compensates
 * them rather than simply refunding everything.
 */
async function quoteCancellation({ booking, by = 'customer' }) {
  if (!CANCELLABLE_FROM.includes(booking.status)) {
    return { allowed: false, reason: 'This booking can no longer be cancelled' };
  }

  const policy = booking.cancellationPolicyCode
    ? await PetCancellationPolicy.findOne({ code: booking.cancellationPolicyCode }).lean()
    : null;

  const total = booking.pricing?.totalPaise || 0;

  // A provider or the platform cancelling never costs the customer money.
  if (by === 'provider' || by === 'admin') {
    const pct = by === 'admin' ? 100 : (policy?.providerCancelRefundPct ?? 100);
    return {
      allowed: true,
      refundPaise: Math.round(total * (pct / 100)),
      penaltyPaise: 0,
      providerCompensationPaise: 0,
      tier: by === 'admin' ? 'platform_cancelled' : 'provider_cancelled',
    };
  }

  if (!policy?.tiers?.length) {
    return { allowed: true, refundPaise: total, penaltyPaise: 0, providerCompensationPaise: 0, tier: 'full_refund' };
  }

  const startsAt = booking.checkInAt || booking.scheduledAt;
  const hoursBefore = startsAt ? (new Date(startsAt) - Date.now()) / 3600000 : 0;

  const tier = [...policy.tiers]
    .sort((a, b) => b.minHoursBefore - a.minHoursBefore)
    .find((t) => hoursBefore >= t.minHoursBefore);

  const refundPct = tier?.refundPct ?? policy.noShowRefundPct ?? 0;
  const compPct = tier?.providerCompensationPct ?? 0;

  const refundPaise = Math.round(total * (refundPct / 100));
  return {
    allowed: true,
    refundPaise,
    penaltyPaise: total - refundPaise,
    providerCompensationPaise: Math.round(total * (compPct / 100)),
    tier: tier?.label || 'no_show',
    hoursBefore: Math.round(hoursBefore),
  };
}

async function cancelBooking({ bookingId, actorId, by = 'customer', reason = '' }) {
  const booking = await PetBooking.findById(bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');

  if (by === 'customer' && String(booking.userId) !== String(actorId)) {
    throw httpError('Not your booking', 403, 'FORBIDDEN');
  }

  const quote = await quoteCancellation({ booking, by });
  if (!quote.allowed) throw httpError(quote.reason, 409, 'NOT_CANCELLABLE');

  booking.cancelledBy = by;
  booking.cancellationReason = reason;
  booking.penaltyPaise = quote.penaltyPaise;
  booking.providerCompensationPaise = quote.providerCompensationPaise;
  booking.refundPaise = quote.refundPaise;
  booking.transitionTo('CANCELLED', { by: actorId, byRole: by, note: reason });
  await booking.save();

  // Paid online? Send the refund due now; a gateway failure is flagged for ops, never lost.
  if (booking.paymentStatus === 'paid' && quote.refundPaise > 0) {
    await require('../../payment/payment.service').refundBookingPayment({
      source: 'pet', bookingId: booking._id, amountPaise: quote.refundPaise, reason: `Cancelled: ${reason || by}`,
    });
  }

  if (by === 'provider' || by === 'admin') {
    await notify(
      booking.userId,
      'Your booking was cancelled',
      by === 'admin'
        ? `ZappyOne cancelled this booking${reason ? `: ${reason}` : ''}. You will not be charged.`
        : 'The provider cancelled. You have been refunded in full and we can find you someone else.',
      booking,
    );
  }

  return { booking: booking.toObject(), ...quote };
}

/* Completion & history (§40) */

/**
 * Finish a job and write it into every pet's passport.
 *
 * The passport entry is the product's long-term asset (§40): a permanent,
 * per-animal timeline that survives the provider, the booking and even the
 * customer changing their mind about which app to use.
 */
async function completeBooking({ bookingId, workerId }) {
  const booking = await PetBooking.findById(bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');

  const owns = String(booking.workerId || '') === String(workerId)
    || String(booking.shopId || '') === String(workerId);
  if (!owns) throw httpError('This is not your booking', 403, 'FORBIDDEN');

  const variant = await PetServiceVariant.findOne({
    code: booking.pets[0]?.variantCode,
  }).lean();

  // Required proof is a gate, not a suggestion — a job with no evidence is a
  // dispute nobody can settle.
  for (const kind of variant?.requiredProofKinds || []) {
    if (!(booking.proofs || []).some((p) => p.kind === kind)) {
      throw httpError(`A ${kind.replace('_', ' ')} photo is required before completing`, 400, 'PROOF_REQUIRED', { kind });
    }
  }

  booking.transitionTo('SERVICE_COMPLETED', { by: workerId, byRole: 'worker' });
  for (const p of booking.pets) {
    if (p.status === 'pending' || p.status === 'in_progress') p.status = 'completed';
  }
  await booking.save();

  const perPet = Math.round((booking.pricing?.totalPaise || 0) / Math.max(1, booking.pets.length));
  for (const p of booking.pets) {
    await PetPassport.updateOne(
      { _id: p.petId },
      {
        $push: {
          serviceHistory: {
            petBookingId: booking._id,
            service: variant?.name || booking.categoryCode,
            workerId: booking.workerId,
            notes: booking.execution?.providerNotes || '',
            photoUrls: (booking.proofs || []).filter((x) => x.kind === 'after').map((x) => x.key),
            amountPaise: perPet,
            at: new Date(),
          },
        },
      },
    ).catch(() => { /* history is valuable, but never blocks completing a job */ });
  }

  await notify(
    booking.userId,
    'Service completed',
    `${variant?.name || 'Your booking'} is done. Photos and the report are in the app.`,
    booking,
  );

  // Paid already → settle now; otherwise wait for cash or the online payment.
  await require('./payment.service').afterServiceCompleted(booking, { by: workerId });
  return booking.toObject();
}

/* Recurring generation (§32) */

/**
 * Create the bookings a schedule is due for.
 *
 * Idempotent per occurrence: the key is the schedule id plus the date, so a
 * scheduler that runs twice, or overlaps itself, cannot double-book a walk.
 */
async function generateOccurrences(recurringIdOrDoc, now = new Date()) {
  const schedule = typeof recurringIdOrDoc === 'string' || recurringIdOrDoc instanceof mongoose.Types.ObjectId
    ? await PetRecurringBooking.findById(recurringIdOrDoc)
    : recurringIdOrDoc;

  if (!schedule || schedule.status !== 'active') return { created: 0, skipped: 0 };

  const dates = schedule.dueDates(now);
  let created = 0;
  let skipped = 0;

  for (const at of dates) {
    const key = `recurring-${schedule._id}-${dateKey(at)}`;
    const exists = await PetBooking.findOne({ idempotencyKey: key }).lean();
    if (exists) { skipped++; continue; }

    try {
      await createBooking({
        userId: schedule.userId,
        categoryCode: schedule.categoryCode,
        serviceMode: schedule.serviceMode,
        pets: schedule.petIds.map((petId) => ({
          petId,
          variantCode: schedule.variantCode,
          addonCodes: schedule.addonCodes,
          durationMinutes: schedule.durationMinutes,
        })),
        scheduledAt: at,
        serviceLocation: schedule.serviceLocation,
        workerId: schedule.preferredWorkerId,
        shopId: schedule.preferredShopId,
        customerInstructions: schedule.customerInstructions,
        packageCode: schedule.packageCode,
        recurringId: schedule._id,
        occurrenceIndex: schedule.occurrencesCreated + created,
        idempotencyKey: key,
      });
      created++;
    } catch (err) {
      // One bad date must not stop the rest of the schedule generating.
      logger.warn(
        { err: err.message, scheduleId: String(schedule._id), at },
        '[PetRecurring] occurrence failed',
      );
      skipped++;
    }
  }

  if (created > 0 || dates.length) {
    schedule.generatedThrough = dates.length ? dates[dates.length - 1] : schedule.generatedThrough;
    schedule.occurrencesCreated += created;
    if (schedule.totalOccurrences && schedule.occurrencesCreated >= schedule.totalOccurrences) {
      schedule.status = 'completed';
    }
    await schedule.save();
  }

  return { created, skipped };
}

/** The scheduler's entry point — every active schedule, in one pass. */
async function generateAllDue(now = new Date()) {
  const schedules = await PetRecurringBooking.find({ status: 'active' });
  let created = 0;
  for (const s of schedules) {
    const r = await generateOccurrences(s, now);
    created += r.created;
  }
  return { schedules: schedules.length, created };
}

module.exports = {
  createBooking,
  cancelBooking,
  quoteCancellation,
  completeBooking,
  generateOccurrences,
  generateAllDue,
  loadOwnedPets,
};
