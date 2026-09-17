/**
 * Pet Passport — the customer's pet, and everything a provider needs to care
 * for it safely.
 *
 * This model predates the Pet Services vertical and was never wired to
 * anything. Rather than adding a second, near-identical `Pet` model beside
 * it, the vertical was built on this one: the "passport" framing is the
 * platform's own language and is exactly right — a pet accumulates a
 * permanent record across every service it ever receives, and that history is
 * the thing a competitor cannot copy.
 *
 * TWO RULES THIS SCHEMA ENFORCES:
 *
 *   1. LAUNCH IS DOG AND CAT ONLY. `species` is deliberately narrowed. The
 *      structure extends to other animals without a migration, but nothing
 *      can be booked for a species the platform has not yet built care
 *      standards for.
 *
 *   2. SAFETY INFORMATION IS NOT DECORATION. Bite risk, escape risk and
 *      aggression are not "notes" — they decide whether a provider may take
 *      the job at all, and a provider who is not told is a provider who gets
 *      hurt. They are separate, queryable fields, and `handlingBriefFor()`
 *      is what a provider is shown: the safety facts for the job they are
 *      doing, and nothing else about the household.
 */
const mongoose = require('mongoose');

/** Launch species. Extending this list is a product decision, not a code one. */
const SPECIES = ['dog', 'cat'];

/** Size drives pricing materially — a giant breed groom is not a small one. */
const PET_SIZES = ['small', 'medium', 'large', 'extra_large'];

const RISK_LEVELS = ['none', 'low', 'medium', 'high'];

const vaccinationSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  givenAt:     { type: Date },
  nextDueAt:   { type: Date },
  vetName:     String,
  /** S3 key — signed on read like every other document on the platform. */
  proofKey:    String,
}, { _id: false });

const serviceEventSchema = new mongoose.Schema({
  orderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  /** Pet Services bookings record here too, so the timeline is one list. */
  petBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'PetBooking' },
  service:    { type: String, required: true },
  workerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Worker' },
  workerName: String,
  notes:      String,
  photoUrls:  [String],
  amountPaise: Number,
  at:         { type: Date, default: Date.now },
}, { _id: true });

const petPassportSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // Pet identity
  name:     { type: String, required: true, trim: true },
  species:  { type: String, enum: SPECIES, required: true, index: true },
  /** Breed CODE from the seeded catalog, not free text — matching reads it. */
  breedCode: { type: String, default: null, lowercase: true, index: true },
  breed:    String,
  gender:   { type: String, enum: ['male', 'female', 'unknown'] },
  dob:      Date,
  colour:   String,
  weight:   Number, // kg

  /**
   * Never derived from breed alone. A "Labrador" can be 22kg or 40kg, and
   * pricing a groom off an assumption is how a customer is quoted one number
   * and charged another. The customer sets it; a provider or admin may
   * correct it after actually seeing the animal.
   */
  size:     { type: String, enum: PET_SIZES, default: 'medium', index: true },
  sizeConfirmedBy: { type: String, enum: ['customer', 'provider', 'admin'], default: 'customer' },

  photoKey: String,

  // Medical
  vaccinations: [vaccinationSchema],
  vaccinationStatus: {
    type: String,
    enum: ['up_to_date', 'partial', 'not_vaccinated', 'unknown'],
    default: 'unknown',
  },
  allergies:    [String],
  medicalNotes: String,
  specialNeeds: String,
  vetName:      String,
  vetPhone:     String,
  preferredVetAddress: String,

  emergencyContact: {
    name:  String,
    phone: String,
  },

  /* ── Safety. Shown to providers; decides whether a job may be taken. ── */
  temperament: {
    type: String,
    enum: ['calm', 'friendly', 'energetic', 'anxious', 'aggressive', 'unknown'],
    default: 'unknown',
  },
  energyLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  anxietyLevel: { type: String, enum: RISK_LEVELS, default: 'none' },
  aggressionLevel: { type: String, enum: RISK_LEVELS, default: 'none' },
  biteRisk: { type: String, enum: RISK_LEVELS, default: 'none', index: true },
  escapeRisk: { type: String, enum: RISK_LEVELS, default: 'none' },
  specialHandling: String,
  behaviourNotes: String,

  /* ── Care instructions ── */
  dietPreferences: String,
  feedingInstructions: String,
  walkingInstructions: String,
  groomingPreferences: String,
  ownerNotes: String,

  // Legacy preference block, kept so nothing that reads it breaks.
  preferences: {
    groomingStyle:  String,
    temperament:    { type: String, enum: ['calm', 'energetic', 'aggressive', 'anxious', 'friendly'] },
    foodBrand:      String,
    walkDuration:   Number, // minutes
    specialNotes:   String,
  },

  // Service history — builds the passport timeline
  serviceHistory: [serviceEventSchema],

  isActive: { type: Boolean, default: true },
  isArchived: { type: Boolean, default: false, index: true },
}, { timestamps: true });

petPassportSchema.index({ userId: 1, isActive: 1 });
petPassportSchema.index({ userId: 1, species: 1, isArchived: 1 });

/**
 * What a provider is told, for one specific service.
 *
 * A dog walker needs the escape risk and the walking instructions; they do not
 * need the owner's vet's address or the household's emergency contact. A
 * groomer needs bite risk and coat notes, not the feeding schedule. Sending
 * the whole profile to everyone is the lazy option and it leaks a customer's
 * private details to every provider who ever takes a job.
 *
 * Safety fields are ALWAYS included regardless of service — a provider is
 * never surprised by an animal that bites.
 */
petPassportSchema.methods.handlingBriefFor = function handlingBriefFor(categoryCode) {
  const always = {
    name: this.name,
    species: this.species,
    breed: this.breed,
    size: this.size,
    temperament: this.temperament,
    biteRisk: this.biteRisk,
    escapeRisk: this.escapeRisk,
    aggressionLevel: this.aggressionLevel,
    anxietyLevel: this.anxietyLevel,
    specialHandling: this.specialHandling,
    allergies: this.allergies,
    behaviourNotes: this.behaviourNotes,
  };

  const perCategory = {
    pet_grooming: { groomingPreferences: this.groomingPreferences, specialNeeds: this.specialNeeds },
    pet_walk: { walkingInstructions: this.walkingInstructions, energyLevel: this.energyLevel },
    pet_home_care: {
      feedingInstructions: this.feedingInstructions,
      dietPreferences: this.dietPreferences,
      ownerNotes: this.ownerNotes,
    },
    pet_boarding: {
      feedingInstructions: this.feedingInstructions,
      dietPreferences: this.dietPreferences,
      vaccinationStatus: this.vaccinationStatus,
      specialNeeds: this.specialNeeds,
    },
    pet_check: { feedingInstructions: this.feedingInstructions, ownerNotes: this.ownerNotes },
    // Transport and vet assistance genuinely need the vet destination.
    pet_transport: { vetName: this.vetName, preferredVetAddress: this.preferredVetAddress },
    pet_vet_assist: {
      vetName: this.vetName,
      vetPhone: this.vetPhone,
      preferredVetAddress: this.preferredVetAddress,
      medicalNotes: this.medicalNotes,
      vaccinationStatus: this.vaccinationStatus,
    },
  };

  return { ...always, ...(perCategory[categoryCode] || {}) };
};

const PetPassport = mongoose.model('PetPassport', petPassportSchema);

module.exports = PetPassport;
module.exports.SPECIES = SPECIES;
module.exports.PET_SIZES = PET_SIZES;
module.exports.RISK_LEVELS = RISK_LEVELS;
