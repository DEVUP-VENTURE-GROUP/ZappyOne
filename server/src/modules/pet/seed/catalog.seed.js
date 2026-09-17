/**
 * Pet Services catalog seed — categories, variants, compatibility (§2, §9–§21, §51).
 *
 * WHAT ADMIN OWNS FROM HERE. Every row below is a starting point; nothing in
 * it is re-applied on a re-seed once an operator has touched it (see the
 * runner). The one compatibility rule worth reading closely is the cat one:
 * outdoor walking is `allowed: false` with a real reason shown to the
 * customer, not silently missing from the menu — §14 is explicit that this
 * is a default, not a ban, and a provider who is actually qualified can be
 * opted in without a release.
 */

const CATEGORIES = [
  { code: 'pet_grooming', name: 'Grooming & Hygiene', icon: 'Scissors', displayOrder: 1, description: 'Bath, haircut and hygiene care at home or at the provider.', disclaimer: 'Grooming is hygiene and coat care, not a veterinary procedure.' },
  { code: 'pet_boarding', name: 'Pet Stay & Daycare', icon: 'Home', displayOrder: 2, description: 'Overnight boarding and daytime care while you are away.' },
  { code: 'pet_walk', name: 'Walk & Activity', icon: 'Footprints', displayOrder: 3, description: 'Walks and play sessions matched to your pet.' },
  { code: 'pet_home_care', name: 'Pet Home Care', icon: 'HeartHandshake', displayOrder: 4, description: 'Feeding, litter care and companionship visits at home.' },
  { code: 'pet_transport', name: 'Pet Pickup & Assistance', icon: 'Car', displayOrder: 5, description: 'Safe transport to the vet, groomer or boarding.' },
  { code: 'pet_vet_assist', name: 'Vet & Appointment Assistance', icon: 'Stethoscope', displayOrder: 6, description: 'Logistics support for a vet visit — not a substitute for one.', disclaimer: 'ZappyOne helpers assist with transport, waiting and paperwork. They do not diagnose, prescribe or treat unless they are themselves a verified, licensed veterinary professional.' },
  { code: 'pet_check', name: 'Pet Check & Home Visit', icon: 'ClipboardCheck', displayOrder: 7, description: 'A quick visual check-in on your pet while you are out.', disclaimer: 'A pet check is a visual welfare check, not a medical exam. A provider will never diagnose a condition.' },
];

const D = ['dog'], C = ['cat'], BOTH = ['dog', 'cat'];
const DOORSTEP = ['doorstep'], HOME = ['home_visit'], PROVIDER = ['provider_location'];

/** `V(code, name, category, species, modes, unit, opts)` */
function V(code, name, categoryCode, species, allowedModes, pricingUnit, opts = {}) {
  return {
    code, name, categoryCode, species, allowedModes, pricingUnit,
    durationMinutes: opts.durationMinutes ?? null,
    estimatedMinutes: opts.estimatedMinutes ?? 60,
    requiresQualification: opts.requiresQualification ?? null,
    requiredProofKinds: opts.requiredProofKinds ?? ['before', 'after'],
    checklistCodes: opts.checklistCodes ?? [],
    isPopular: !!opts.isPopular,
    displayOrder: opts.displayOrder ?? 0,
    description: opts.description ?? '',
  };
}

const VARIANTS = [
  /* ── 1. Grooming & Hygiene (§9) ──────────────────────────────────────── */
  V('pg_basic_bath', 'Basic Bath', 'pet_grooming', BOTH, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 45, isPopular: true, displayOrder: 1 }),
  V('pg_bath_dry', 'Bath + Dry', 'pet_grooming', BOTH, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 60, displayOrder: 2 }),
  V('pg_full_grooming', 'Full Grooming', 'pet_grooming', BOTH, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 90, isPopular: true, displayOrder: 3 }),
  V('pg_haircut', 'Haircut', 'pet_grooming', D, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 60, displayOrder: 4 }),
  V('pg_breed_specific', 'Breed-Specific Grooming', 'pet_grooming', D, PROVIDER, 'flat', { estimatedMinutes: 90, displayOrder: 5 }),
  V('pg_deshedding', 'Deshedding', 'pet_grooming', BOTH, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 45, isPopular: true, displayOrder: 6 }),
  V('pg_nail_clipping', 'Nail Clipping', 'pet_grooming', BOTH, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 15, requiredProofKinds: ['after'], displayOrder: 7 }),
  V('pg_ear_cleaning', 'Ear Cleaning', 'pet_grooming', BOTH, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 15, requiredProofKinds: ['after'], displayOrder: 8 }),
  V('pg_paw_care', 'Paw Care', 'pet_grooming', D, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 20, displayOrder: 9 }),
  V('pg_hygiene_trim', 'Hygiene Trim', 'pet_grooming', BOTH, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 20, displayOrder: 10 }),
  V('pg_tick_flea', 'Tick/Flea Hygiene Treatment', 'pet_grooming', D, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 45, displayOrder: 11 }),
  V('pg_puppy_grooming', 'Puppy Grooming', 'pet_grooming', D, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 45, displayOrder: 12 }),
  V('pg_senior_grooming', 'Senior Dog Grooming', 'pet_grooming', D, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 75, displayOrder: 13 }),
  V('pg_cat_bath', 'Cat Bath', 'pet_grooming', C, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 40, displayOrder: 14 }),
  V('pg_cat_grooming', 'Cat Grooming', 'pet_grooming', C, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 60, isPopular: true, displayOrder: 15 }),
  V('pg_sanitary_trim', 'Sanitary Trim', 'pet_grooming', C, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 20, displayOrder: 16 }),
  V('pg_mat_removal', 'Mat Removal', 'pet_grooming', C, [...DOORSTEP, ...PROVIDER], 'flat', { estimatedMinutes: 30, displayOrder: 17 }),
  V('pg_longhair_grooming', 'Long-Hair Grooming', 'pet_grooming', C, PROVIDER, 'flat', { estimatedMinutes: 75, displayOrder: 18 }),

  /* ── 2. Pet Stay & Daycare (§11) ─────────────────────────────────────── */
  V('pb_overnight_boarding', 'Overnight Boarding', 'pet_boarding', BOTH, ['boarding'], 'per_night', { isPopular: true, displayOrder: 1, requiredProofKinds: ['handover_in', 'handover_out'] }),
  V('pb_home_boarding', 'Home Boarding', 'pet_boarding', BOTH, ['boarding'], 'per_night', { displayOrder: 2, requiredProofKinds: ['handover_in', 'handover_out'] }),
  V('pb_facility_boarding', 'Facility Boarding', 'pet_boarding', BOTH, ['boarding'], 'per_night', { isPopular: true, displayOrder: 3, requiredProofKinds: ['handover_in', 'handover_out'] }),
  V('pb_daycare', 'Daycare', 'pet_boarding', BOTH, ['daycare'], 'per_day', { isPopular: true, displayOrder: 4, requiredProofKinds: ['handover_in', 'handover_out'] }),
  V('pb_half_day_daycare', 'Half-Day Daycare', 'pet_boarding', BOTH, ['daycare'], 'per_day', { displayOrder: 5, requiredProofKinds: ['handover_in', 'handover_out'] }),
  V('pb_full_day_daycare', 'Full-Day Daycare', 'pet_boarding', BOTH, ['daycare'], 'per_day', { displayOrder: 6, requiredProofKinds: ['handover_in', 'handover_out'] }),
  V('pb_trial_stay', 'Trial Stay', 'pet_boarding', BOTH, ['boarding'], 'per_night', { displayOrder: 7, requiredProofKinds: ['handover_in', 'handover_out'] }),
  V('pb_extended_stay', 'Extended Stay', 'pet_boarding', BOTH, ['boarding'], 'per_night', { displayOrder: 8, requiredProofKinds: ['handover_in', 'handover_out'] }),

  /* ── 3. Walk & Activity (§14) ────────────────────────────────────────── */
  V('pw_walk_20', '20-Minute Walk', 'pet_walk', D, [...DOORSTEP, ...HOME], 'per_minute', { durationMinutes: 20, estimatedMinutes: 30, isPopular: true, displayOrder: 1, requiredProofKinds: ['handover_out', 'handover_in'] }),
  V('pw_walk_30', '30-Minute Walk', 'pet_walk', D, [...DOORSTEP, ...HOME], 'per_minute', { durationMinutes: 30, estimatedMinutes: 40, isPopular: true, displayOrder: 2, requiredProofKinds: ['handover_out', 'handover_in'] }),
  V('pw_walk_45', '45-Minute Walk', 'pet_walk', D, [...DOORSTEP, ...HOME], 'per_minute', { durationMinutes: 45, estimatedMinutes: 55, displayOrder: 3, requiredProofKinds: ['handover_out', 'handover_in'] }),
  V('pw_walk_60', '60-Minute Walk', 'pet_walk', D, [...DOORSTEP, ...HOME], 'per_minute', { durationMinutes: 60, estimatedMinutes: 70, displayOrder: 4, requiredProofKinds: ['handover_out', 'handover_in'] }),
  V('pw_puppy_walk', 'Puppy Walk', 'pet_walk', D, [...DOORSTEP, ...HOME], 'per_minute', { durationMinutes: 20, estimatedMinutes: 30, displayOrder: 5, requiredProofKinds: ['handover_out', 'handover_in'] }),
  V('pw_senior_walk', 'Senior Pet Walk', 'pet_walk', D, [...DOORSTEP, ...HOME], 'per_minute', { durationMinutes: 20, estimatedMinutes: 30, displayOrder: 6, requiredProofKinds: ['handover_out', 'handover_in'] }),
  V('pw_structured_walk', 'Structured Walk', 'pet_walk', D, HOME, 'per_minute', { durationMinutes: 30, estimatedMinutes: 40, displayOrder: 7, requiredProofKinds: ['handover_out', 'handover_in'] }),
  V('pw_play_session', 'Play Session', 'pet_walk', BOTH, HOME, 'per_minute', { durationMinutes: 30, estimatedMinutes: 40, displayOrder: 8 }),
  V('pw_walk_play', 'Walk + Play', 'pet_walk', D, HOME, 'per_minute', { durationMinutes: 45, estimatedMinutes: 55, displayOrder: 9, requiredProofKinds: ['handover_out', 'handover_in'] }),
  // Cats: activity visits only. Outdoor walking is gated off in compatibility below.
  V('pw_activity_visit', 'Activity Visit', 'pet_walk', C, HOME, 'per_minute', { durationMinutes: 30, estimatedMinutes: 40, displayOrder: 10 }),

  /* ── 4. Pet Home Care (§16) ──────────────────────────────────────────── */
  V('ph_feeding_visit', 'Feeding Visit', 'pet_home_care', BOTH, HOME, 'per_visit', { estimatedMinutes: 20, isPopular: true, displayOrder: 1 }),
  V('ph_water_refill', 'Water Refill', 'pet_home_care', BOTH, HOME, 'per_visit', { estimatedMinutes: 10, displayOrder: 2 }),
  V('ph_litter_care', 'Litter Box Care', 'pet_home_care', C, HOME, 'per_visit', { estimatedMinutes: 15, isPopular: true, displayOrder: 3 }),
  V('ph_area_cleaning', 'Pet Area Cleaning', 'pet_home_care', BOTH, HOME, 'per_visit', { estimatedMinutes: 20, displayOrder: 4 }),
  V('ph_bowl_cleaning', 'Food Bowl Cleaning', 'pet_home_care', BOTH, HOME, 'per_visit', { estimatedMinutes: 10, displayOrder: 5 }),
  V('ph_bedding_refresh', 'Bedding Refresh', 'pet_home_care', BOTH, HOME, 'per_visit', { estimatedMinutes: 15, displayOrder: 6 }),
  V('ph_play_companion', 'Play & Companion Visit', 'pet_home_care', BOTH, HOME, 'per_visit', { estimatedMinutes: 30, displayOrder: 7 }),
  V('ph_routine_care_30', '30-Minute Home Care', 'pet_home_care', BOTH, HOME, 'per_visit', { estimatedMinutes: 30, isPopular: true, displayOrder: 8 }),
  V('ph_routine_care_60', '60-Minute Home Care', 'pet_home_care', BOTH, HOME, 'per_visit', { estimatedMinutes: 60, displayOrder: 9 }),
  V('ph_multi_task', 'Multi-Task Pet Care', 'pet_home_care', BOTH, HOME, 'per_visit', { estimatedMinutes: 45, displayOrder: 10 }),
  V('ph_pet_sitting', 'Home Pet Sitting', 'pet_home_care', BOTH, HOME, 'per_visit', { estimatedMinutes: 120, displayOrder: 11 }),
  V('ph_overnight_sitting', 'Overnight Home Sitting', 'pet_home_care', BOTH, HOME, 'per_night', { displayOrder: 12, requiredProofKinds: ['handover_in', 'handover_out'] }),

  /* ── 5. Pet Pickup & Assistance (§18) ────────────────────────────────── */
  V('pt_vet_pickup_drop', 'Vet Pickup & Drop', 'pet_transport', BOTH, ['pickup_and_return', 'transport'], 'per_km', { estimatedMinutes: 60, isPopular: true, displayOrder: 1 }),
  V('pt_grooming_pickup_drop', 'Grooming Pickup & Drop', 'pet_transport', BOTH, ['pickup_and_return'], 'per_km', { estimatedMinutes: 45, displayOrder: 2 }),
  V('pt_boarding_pickup_drop', 'Boarding Pickup & Drop', 'pet_transport', BOTH, ['pickup_and_return'], 'per_km', { estimatedMinutes: 45, displayOrder: 3 }),
  V('pt_daycare_pickup_drop', 'Daycare Pickup & Drop', 'pet_transport', BOTH, ['pickup_and_return'], 'per_km', { estimatedMinutes: 45, displayOrder: 4 }),
  V('pt_appointment_transport', 'Pet Appointment Transport', 'pet_transport', BOTH, ['transport'], 'per_km', { estimatedMinutes: 60, displayOrder: 5 }),
  V('pt_supply_pickup', 'Pet Supply Pickup', 'pet_transport', BOTH, ['transport'], 'per_km', { estimatedMinutes: 30, requiredProofKinds: ['after'], displayOrder: 6 }),
  V('pt_return_trip', 'Pet Return Trip', 'pet_transport', BOTH, ['transport'], 'per_km', { estimatedMinutes: 45, displayOrder: 7 }),
  V('pt_wait_return', 'Wait + Return', 'pet_transport', BOTH, ['transport'], 'per_km', { estimatedMinutes: 90, displayOrder: 8 }),
  V('pt_pickup_service_return', 'Pickup + Service + Return', 'pet_transport', BOTH, ['pickup_and_return'], 'per_km', { estimatedMinutes: 120, displayOrder: 9 }),

  /* ── 6. Vet & Appointment Assistance (§20) ───────────────────────────── */
  V('pv_appointment_pickup_drop', 'Vet Appointment Pickup & Drop', 'pet_vet_assist', BOTH, ['pickup_and_return'], 'per_km', { estimatedMinutes: 60, isPopular: true, displayOrder: 1 }),
  V('pv_visit_companion', 'Vet Visit Companion', 'pet_vet_assist', BOTH, ['transport'], 'per_visit', { estimatedMinutes: 90, displayOrder: 2 }),
  V('pv_waiting_assistant', 'Appointment Waiting Assistant', 'pet_vet_assist', BOTH, ['provider_location'], 'per_visit', { estimatedMinutes: 60, displayOrder: 3 }),
  V('pv_vaccination_transport', 'Vaccination Appointment Transport', 'pet_vet_assist', BOTH, ['pickup_and_return'], 'per_km', { estimatedMinutes: 60, displayOrder: 4 }),
  V('pv_diagnostic_transport', 'Diagnostic Visit Transport', 'pet_vet_assist', BOTH, ['pickup_and_return'], 'per_km', { estimatedMinutes: 60, displayOrder: 5 }),
  V('pv_document_assistance', 'Pet Document Assistance', 'pet_vet_assist', BOTH, ['provider_location'], 'per_visit', { estimatedMinutes: 30, requiredProofKinds: ['after'], displayOrder: 6 }),
  V('pv_clinic_coordination', 'Clinic Appointment Coordination', 'pet_vet_assist', BOTH, ['provider_location'], 'per_visit', { estimatedMinutes: 30, requiredProofKinds: ['after'], displayOrder: 7 }),
  V('pv_pickup_wait_return', 'Pickup + Wait + Return', 'pet_vet_assist', BOTH, ['pickup_and_return'], 'per_km', { estimatedMinutes: 120, displayOrder: 8 }),

  /* ── 7. Pet Check & Home Visit (§21) ─────────────────────────────────── */
  V('pc_check_15', '15-Minute Pet Check', 'pet_check', BOTH, HOME, 'per_visit', { estimatedMinutes: 15, isPopular: true, displayOrder: 1, requiredProofKinds: ['after'] }),
  V('pc_check_30', '30-Minute Pet Check', 'pet_check', BOTH, HOME, 'per_visit', { estimatedMinutes: 30, isPopular: true, displayOrder: 2, requiredProofKinds: ['after'] }),
  V('pc_check_45', '45-Minute Pet Check', 'pet_check', BOTH, HOME, 'per_visit', { estimatedMinutes: 45, displayOrder: 3, requiredProofKinds: ['after'] }),
  V('pc_check_60', '60-Minute Pet Check', 'pet_check', BOTH, HOME, 'per_visit', { estimatedMinutes: 60, displayOrder: 4, requiredProofKinds: ['after'] }),
  V('pc_pet_home_check', 'Pet + Home Check', 'pet_check', BOTH, HOME, 'per_visit', { estimatedMinutes: 30, displayOrder: 5, requiredProofKinds: ['after'] }),
  V('pc_travel_check', 'Travel Pet Check', 'pet_check', BOTH, HOME, 'per_visit', { estimatedMinutes: 30, displayOrder: 6, requiredProofKinds: ['after'] }),
  V('pc_senior_check', 'Senior Pet Check', 'pet_check', BOTH, HOME, 'per_visit', { estimatedMinutes: 30, displayOrder: 7, requiredProofKinds: ['after'] }),
  V('pc_multi_pet_check', 'Multi-Pet Check', 'pet_check', BOTH, HOME, 'per_visit', { estimatedMinutes: 45, displayOrder: 8, requiredProofKinds: ['after'] }),
];

/* ─── Compatibility (§51) ───────────────────────────────────────────── */

const COMPATIBILITY = [
  // The rule this section exists for: outdoor walking is off for cats by
  // default, with the reason the customer actually reads.
  {
    species: 'cat', categoryCode: 'pet_walk', variantCode: null,
    allowed: false,
    reason: 'Most cats are not trained for a lead and outdoor walking is a real escape and injury risk. Try an in-home Activity Visit instead.',
  },
  // The one exception: an in-home activity visit for a cat is fine.
  { species: 'cat', categoryCode: 'pet_walk', variantCode: 'pw_activity_visit', allowed: true },

  // Cat daycare is configurable, not default-on (§11) — most cats do not
  // tolerate a shared daycare space the way dogs do.
  { species: 'cat', categoryCode: 'pet_boarding', variantCode: 'pb_daycare', allowed: true, requiresProviderOptIn: true, reason: 'Only offered by providers set up for cat-safe daycare.' },
  { species: 'cat', categoryCode: 'pet_boarding', variantCode: 'pb_half_day_daycare', allowed: true, requiresProviderOptIn: true, reason: 'Only offered by providers set up for cat-safe daycare.' },
  { species: 'cat', categoryCode: 'pet_boarding', variantCode: 'pb_full_day_daycare', allowed: true, requiresProviderOptIn: true, reason: 'Only offered by providers set up for cat-safe daycare.' },

  // Giant dogs need a provider who has said they can take one — a small
  // groomer's van is not built for a Great Dane.
  { species: 'dog', categoryCode: 'pet_grooming', variantCode: null, allowed: true, allowedSizes: ['small', 'medium', 'large', 'extra_large'] },
];

module.exports = { CATEGORIES, VARIANTS, COMPATIBILITY };
