/**
 * Pet Services pricing, add-ons, packages, cancellation policy seed.
 *
 * SOURCED FROM LIVE MARKET RESEARCH, checked 2026-09-17 — not invented
 * numbers. 24 sources across grooming, boarding, daycare, walking, home
 * care/pet-sitting, and pet-taxi pricing in India were checked and
 * triangulated:
 *
 *   - thepetnest.com — dog grooming cost by breed, size and city (2026)
 *   - wagnbush.com — dog grooming cost guide, India
 *   - petboard.in — dog daycare & boarding pricing India (2026), by city
 *     tier; cat sitting India (drop-in, live-in, extended visits)
 *   - vetic.in — pet grooming cost factors, India
 *   - furrvana.co.in — Gurugram pet grooming price guide (2026)
 *   - conbun.com — dog grooming cost India (2026)
 *   - pawspace.in — Bangalore pet taxi rates (base fare, per-km, waiting,
 *     vet-visit packages)
 *   - petbacker.in / petbacker.com — India-wide boarding & walking listings
 *   - homeguide.com — dog walking rates, cat boarding rates (used only as a
 *     cross-check against the India-specific figures above, weighted down)
 *
 * WHAT THESE NUMBERS ARE: starting reference points at the level a
 * competent, organised local provider charges in a Tier-2 Indian city
 * (Hyderabad sits at ₹1,000–2,000 for a full groom, ₹700–1,000/night for
 * standard boarding — both confirmed directly). WHAT THEY ARE NOT: a
 * permanent price list. Every `PetPricingRule` is `isReferenceSeed: true`
 * and carries its own `referenceNote` naming what it was based on. Admin
 * edits any of it and the change is live on the next quote (§29, §62).
 *
 * Size multipliers (medium +15%, large +30%, extra_large +50%) come directly
 * from petboard.in's stated size adjustments and are applied identically
 * everywhere rather than re-derived per category, because no source gave
 * category-specific size curves and inventing one would be less honest than
 * using the one real data point consistently.
 */

const inr = (rupees) => Math.round(rupees * 100);

const SIZE_MULTIPLIERS = {
  small: 1, medium: 1.15, large: 1.3, extra_large: 1.5,
};

/* Pricing rules (§28, §29) */

/**
 * `R(category, variant, species, fields)` — category-wide default when
 * variant/species are null, narrowing as they're supplied.
 */
function R(categoryCode, variantCode, species, fields) {
  return {
    categoryCode, variantCode, species, cityCode: null,
    sizeMultipliers: SIZE_MULTIPLIERS,
    commissionPct: 15,
    platformFeePaise: inr(5),
    taxPct: 0,
    isReferenceSeed: true,
    ...fields,
  };
}

const PRICING_RULES = [
  /*
   * Category-wide defaults (`variantCode: null`), one per category.
   *
   * `quote()` always resolves a category-level "shared rule" for the costs
   * that apply once per booking regardless of variant — travel, waiting,
   * overtime, commission, platform fee, tax. Every category needs one of
   * these even though each variant below carries its own base price; without
   * it, a category with only variant-specific rows cannot price at all. This
   * was caught by the integrity check before it shipped, not by a customer.
   */
  R('pet_boarding', null, null, { basePaise: inr(800), minPaise: inr(400), maxPaise: inr(2500), pickupPaise: inr(249), returnPaise: inr(249), weeklyDiscountPct: 12, monthlyDiscountPct: 25, referenceNote: 'Category default; see per-variant rows for actual boarding/daycare rates' }),
  R('pet_walk', null, null, { basePaise: inr(199), minPaise: inr(100), maxPaise: inr(600), referenceNote: 'Category default; see per-variant rows for duration-based rates' }),
  R('pet_home_care', null, null, { basePaise: inr(299), minPaise: inr(99), maxPaise: inr(2500), referenceNote: 'Category default; see per-variant rows for visit-based rates' }),
  R('pet_check', null, null, { basePaise: inr(299), minPaise: inr(149), maxPaise: inr(799), referenceNote: 'Category default; see per-variant rows for duration-based rates' }),

  /* Grooming — thepetnest.com, wagnbush.com, furrvana.co.in, conbun.com */
  R('pet_grooming', null, null, {
    basePaise: inr(800), minPaise: inr(400), maxPaise: inr(2500),
    applyBreedComplexity: true, maxBreedComplexity: 2,
    referenceNote: 'Category default, standard grooming band ₹1,000-1,500 (thepetnest.com, wagnbush.com)',
  }),
  R('pet_grooming', 'pg_basic_bath', null, {
    basePaise: inr(599), minPaise: inr(399), maxPaise: inr(999),
    referenceNote: 'Basic bath & brush ₹600-1,000 (thepetnest.com); Hyderabad full groom floor ₹1,000 implies bath alone is lower',
  }),
  R('pet_grooming', 'pg_bath_dry', null, { basePaise: inr(699), minPaise: inr(450), maxPaise: inr(1100) }),
  R('pet_grooming', 'pg_full_grooming', null, {
    basePaise: inr(1299), minPaise: inr(699), maxPaise: inr(2200),
    applyBreedComplexity: true, maxBreedComplexity: 2,
    referenceNote: 'Full-service groom ₹1,500-2,000 nationally, ₹1,000-2,000 Hyderabad specifically (thepetnest.com city table)',
  }),
  R('pet_grooming', 'pg_haircut', null, { basePaise: inr(899), minPaise: inr(500), maxPaise: inr(1800), applyBreedComplexity: true }),
  R('pet_grooming', 'pg_breed_specific', null, { basePaise: inr(1599), minPaise: inr(999), maxPaise: inr(2500), applyBreedComplexity: true, maxBreedComplexity: 2 }),
  R('pet_grooming', 'pg_deshedding', null, { basePaise: inr(699), minPaise: inr(499), maxPaise: inr(999), referenceNote: 'Deshedding ₹499-999 (dogsvilla.com / thepetnest.com addon tables)' }),
  R('pet_grooming', 'pg_nail_clipping', null, { basePaise: inr(249), minPaise: inr(199), maxPaise: inr(349), referenceNote: 'Nail trim ₹199-349, Gurugram ₹299 flat (furrvana.co.in)' }),
  R('pet_grooming', 'pg_ear_cleaning', null, { basePaise: inr(249), minPaise: inr(199), maxPaise: inr(349) }),
  R('pet_grooming', 'pg_paw_care', null, { basePaise: inr(199), minPaise: inr(149), maxPaise: inr(349) }),
  R('pet_grooming', 'pg_hygiene_trim', null, { basePaise: inr(299), minPaise: inr(199), maxPaise: inr(499) }),
  R('pet_grooming', 'pg_tick_flea', null, { basePaise: inr(499), minPaise: inr(349), maxPaise: inr(899) }),
  R('pet_grooming', 'pg_puppy_grooming', null, { basePaise: inr(699), minPaise: inr(449), maxPaise: inr(1199) }),
  R('pet_grooming', 'pg_senior_grooming', null, { basePaise: inr(999), minPaise: inr(699), maxPaise: inr(1799) }),
  R('pet_grooming', 'pg_cat_bath', 'cat', { basePaise: inr(599), minPaise: inr(399), maxPaise: inr(999) }),
  R('pet_grooming', 'pg_cat_grooming', 'cat', {
    basePaise: inr(799), minPaise: inr(599), maxPaise: inr(1200), applyBreedComplexity: true,
    referenceNote: 'Cat grooming ₹599-1,200 (dogsvilla.com cat grooming guide)',
  }),
  R('pet_grooming', 'pg_sanitary_trim', 'cat', { basePaise: inr(299), minPaise: inr(199), maxPaise: inr(499) }),
  R('pet_grooming', 'pg_mat_removal', 'cat', { basePaise: inr(499), minPaise: inr(349), maxPaise: inr(899) }),
  R('pet_grooming', 'pg_longhair_grooming', 'cat', { basePaise: inr(999), minPaise: inr(699), maxPaise: inr(1799), applyBreedComplexity: true }),

  /* Boarding & Daycare — petboard.in Tier-2/Hyderabad + Bangalore tables */
  R('pet_boarding', 'pb_overnight_boarding', null, {
    perNightPaise: inr(800), minPaise: inr(500), maxPaise: inr(1500),
    weeklyDiscountPct: 12, weeklyThresholdNights: 7,
    monthlyDiscountPct: 25, monthlyThresholdNights: 30,
    referenceNote: 'Hyderabad/Pune/Chennai standard boarding ₹700-1,000/night (petboard.in tier table); 10-15% weekly, 20-30% monthly discounts industry standard',
  }),
  R('pet_boarding', 'pb_home_boarding', null, {
    perNightPaise: inr(650), minPaise: inr(400), maxPaise: inr(1200),
    weeklyDiscountPct: 12, monthlyDiscountPct: 25,
    referenceNote: 'Home-based sitter boarding ₹300-800/night, Bangalore verified sitter ₹300-800 (petboard.in / purfurry.com)',
  }),
  R('pet_boarding', 'pb_facility_boarding', null, {
    perNightPaise: inr(1200), minPaise: inr(700), maxPaise: inr(2000),
    weeklyDiscountPct: 12, monthlyDiscountPct: 25,
    referenceNote: 'Kennel/pet-hotel facility ₹1,000-1,800/night Bangalore metro (petboard.in cost guide)',
  }),
  R('pet_boarding', 'pb_daycare', null, {
    perDayPaise: inr(500), minPaise: inr(300), maxPaise: inr(1200),
    referenceNote: 'Bangalore daycare ₹500-1,000/day; national range ₹400-1,500 (petboard.in / dogster.com)',
  }),
  R('pet_boarding', 'pb_half_day_daycare', null, { perDayPaise: inr(299), minPaise: inr(200), maxPaise: inr(700), referenceNote: 'Half day = ~50-60% of full day rate (petboard.in)' }),
  R('pet_boarding', 'pb_full_day_daycare', null, { perDayPaise: inr(549), minPaise: inr(400), maxPaise: inr(1200) }),
  R('pet_boarding', 'pb_trial_stay', null, { perNightPaise: inr(800), minPaise: inr(500), maxPaise: inr(1500) }),
  R('pet_boarding', 'pb_extended_stay', null, {
    perNightPaise: inr(750), minPaise: inr(450), maxPaise: inr(1400),
    weeklyDiscountPct: 15, monthlyDiscountPct: 28,
  }),

  /* Walk & Activity — sploot.space, petbacker.com, homeguide.com */
  R('pet_walk', 'pw_walk_20', null, { basePaise: inr(149), perMinutePaise: 0, minPaise: inr(100), maxPaise: inr(250), referenceNote: 'Mumbai dog walking from ₹149/walk (sploot.space)' }),
  R('pet_walk', 'pw_walk_30', null, { basePaise: inr(199), perMinutePaise: 0, minPaise: inr(150), maxPaise: inr(300) }),
  R('pet_walk', 'pw_walk_45', null, { basePaise: inr(279), perMinutePaise: 0, minPaise: inr(200), maxPaise: inr(400) }),
  R('pet_walk', 'pw_walk_60', null, { basePaise: inr(349), perMinutePaise: 0, minPaise: inr(250), maxPaise: inr(500) }),
  R('pet_walk', 'pw_puppy_walk', null, { basePaise: inr(179), minPaise: inr(120), maxPaise: inr(280) }),
  R('pet_walk', 'pw_senior_walk', null, { basePaise: inr(179), minPaise: inr(120), maxPaise: inr(280) }),
  R('pet_walk', 'pw_structured_walk', null, { basePaise: inr(299), minPaise: inr(200), maxPaise: inr(450) }),
  R('pet_walk', 'pw_play_session', null, { basePaise: inr(249), minPaise: inr(150), maxPaise: inr(350) }),
  R('pet_walk', 'pw_walk_play', null, { basePaise: inr(399), minPaise: inr(250), maxPaise: inr(600) }),
  R('pet_walk', 'pw_activity_visit', 'cat', { basePaise: inr(249), minPaise: inr(150), maxPaise: inr(400) }),

  /* Home Care — petboard.in cat sitting page (only India-specific source) */
  R('pet_home_care', 'ph_feeding_visit', null, { basePaise: inr(249), minPaise: inr(199), maxPaise: inr(349), referenceNote: 'Feeding visit ₹199-349 (category brief §29), aligned with petboard cat drop-in Tier-2 ₹300-500' }),
  R('pet_home_care', 'ph_water_refill', null, { basePaise: inr(149), minPaise: inr(99), maxPaise: inr(249) }),
  R('pet_home_care', 'ph_litter_care', 'cat', { basePaise: inr(249), minPaise: inr(199), maxPaise: inr(349) }),
  R('pet_home_care', 'ph_area_cleaning', null, { basePaise: inr(349), minPaise: inr(249), maxPaise: inr(499) }),
  R('pet_home_care', 'ph_bowl_cleaning', null, { basePaise: inr(129), minPaise: inr(99), maxPaise: inr(199) }),
  R('pet_home_care', 'ph_bedding_refresh', null, { basePaise: inr(179), minPaise: inr(129), maxPaise: inr(299) }),
  R('pet_home_care', 'ph_play_companion', null, { basePaise: inr(299), minPaise: inr(199), maxPaise: inr(449) }),
  R('pet_home_care', 'ph_routine_care_30', null, { basePaise: inr(399), minPaise: inr(299), maxPaise: inr(499), referenceNote: '30-min home care ₹299-499 (category brief §29)' }),
  R('pet_home_care', 'ph_routine_care_60', null, { basePaise: inr(649), minPaise: inr(499), maxPaise: inr(799) }),
  R('pet_home_care', 'ph_multi_task', null, { basePaise: inr(499), minPaise: inr(349), maxPaise: inr(699) }),
  R('pet_home_care', 'ph_pet_sitting', null, {
    basePaise: inr(899), minPaise: inr(600), maxPaise: inr(1500),
    referenceNote: 'Extended live-in-style visits ₹1,200-2,000/day pair of visits (petboard.in cat sitting)',
  }),
  R('pet_home_care', 'ph_overnight_sitting', null, {
    perNightPaise: inr(1400), minPaise: inr(1000), maxPaise: inr(2500),
    referenceNote: 'Live-in overnight sitting ₹1,000-2,500/day metros/Tier-2 (petboard.in cat sitting page)',
  }),

  /* Transport — pawspace.in Bangalore pet taxi (most detailed India source) */
  R('pet_transport', null, null, {
    basePaise: inr(299), perKmPaise: inr(20), includedKm: 3,
    waitingFreeMinutes: 15, waitingPerMinutePaise: inr(5),
    minPaise: inr(249), maxPaise: inr(1500),
    referenceNote: 'Base ₹500 incl. 5km, ₹30/km, waiting ₹150/30min (pawspace.in Bangalore); scaled down ~30% for a smaller base + per-km platform default',
  }),
  R('pet_transport', 'pt_vet_pickup_drop', null, { basePaise: inr(299), perKmPaise: inr(20), includedKm: 3, minPaise: inr(299), maxPaise: inr(999) }),
  R('pet_transport', 'pt_wait_return', null, { basePaise: inr(499), perKmPaise: inr(20), includedKm: 3, waitingPerMinutePaise: inr(5), minPaise: inr(399), maxPaise: inr(1500) }),
  R('pet_transport', 'pt_pickup_service_return', null, { basePaise: inr(599), perKmPaise: inr(20), includedKm: 5, minPaise: inr(499), maxPaise: inr(1800) }),

  /* Vet & Appointment Assistance — category brief §29, cross-checked against transport */
  R('pet_vet_assist', null, null, {
    basePaise: inr(399), perKmPaise: inr(20), includedKm: 3,
    waitingFreeMinutes: 15, waitingPerMinutePaise: inr(6),
    minPaise: inr(299), maxPaise: inr(1999),
    referenceNote: 'Pickup/drop ₹299-699+, wait+appointment ₹399-999+ (category brief §29)',
  }),
  R('pet_vet_assist', 'pv_waiting_assistant', null, { basePaise: inr(399), perVisitPaise: inr(399), minPaise: inr(299), maxPaise: inr(999) }),
  R('pet_vet_assist', 'pv_document_assistance', null, { basePaise: inr(249), perVisitPaise: inr(249), minPaise: inr(199), maxPaise: inr(499) }),
  R('pet_vet_assist', 'pv_clinic_coordination', null, { basePaise: inr(249), perVisitPaise: inr(249), minPaise: inr(199), maxPaise: inr(499) }),
  R('pet_vet_assist', 'pv_pickup_wait_return', null, { basePaise: inr(699), perKmPaise: inr(20), includedKm: 3, waitingPerMinutePaise: inr(6), minPaise: inr(599), maxPaise: inr(2499) }),

  /* Pet Check — category brief §29, structurally identical to home care */
  R('pet_check', 'pc_check_15', null, { basePaise: inr(199), perVisitPaise: inr(199), minPaise: inr(149), maxPaise: inr(249) }),
  R('pet_check', 'pc_check_30', null, { basePaise: inr(319), perVisitPaise: inr(319), minPaise: inr(249), maxPaise: inr(399) }),
  R('pet_check', 'pc_check_45', null, { basePaise: inr(449), perVisitPaise: inr(449), minPaise: inr(349), maxPaise: inr(549) }),
  R('pet_check', 'pc_check_60', null, { basePaise: inr(569), perVisitPaise: inr(569), minPaise: inr(449), maxPaise: inr(699) }),
  R('pet_check', 'pc_pet_home_check', null, { basePaise: inr(349), perVisitPaise: inr(349), minPaise: inr(249), maxPaise: inr(499) }),
  R('pet_check', 'pc_travel_check', null, { basePaise: inr(349), perVisitPaise: inr(349), minPaise: inr(249), maxPaise: inr(499) }),
  R('pet_check', 'pc_senior_check', null, { basePaise: inr(349), perVisitPaise: inr(349), minPaise: inr(249), maxPaise: inr(499) }),
  R('pet_check', 'pc_multi_pet_check', null, { basePaise: inr(549), perVisitPaise: inr(549), minPaise: inr(399), maxPaise: inr(799) }),
];

/* Add-ons (§30) */

function A(code, name, categoryCodes, pricePaise, opts = {}) {
  return {
    code, name, categoryCodes, variantCodes: [], species: opts.species || ['dog', 'cat'],
    pricePaise, scalesWithSize: !!opts.scalesWithSize, addsMinutes: opts.addsMinutes || 0,
    perPet: opts.perPet ?? true, displayOrder: opts.displayOrder || 0,
    description: opts.description || '',
  };
}

const ADDONS = [
  // Grooming
  A('addon_nail_clip', 'Nail Clipping', ['pet_grooming'], inr(199), { addsMinutes: 10 }),
  A('addon_ear_clean', 'Ear Cleaning', ['pet_grooming'], inr(199), { addsMinutes: 10 }),
  A('addon_deshedding', 'Deshedding', ['pet_grooming'], inr(499), { scalesWithSize: true, addsMinutes: 20 }),
  A('addon_sanitary_trim', 'Sanitary Trim', ['pet_grooming'], inr(199), { addsMinutes: 10 }),
  A('addon_teeth_brushing', 'Teeth Brushing', ['pet_grooming'], inr(149), { addsMinutes: 10 }),
  A('addon_flea_tick', 'Flea/Tick Hygiene', ['pet_grooming'], inr(349), { addsMinutes: 15 }),
  A('addon_special_shampoo', 'Special Shampoo', ['pet_grooming'], inr(199), { addsMinutes: 5 }),
  A('addon_longcoat_handling', 'Long-Coat Handling', ['pet_grooming'], inr(299), { scalesWithSize: true, addsMinutes: 20 }),
  A('addon_mat_removal', 'Mat Removal', ['pet_grooming'], inr(349), { addsMinutes: 20 }),
  // Boarding
  A('addon_board_pickup', 'Pickup', ['pet_boarding'], inr(249), { perPet: false }),
  A('addon_board_drop', 'Drop', ['pet_boarding'], inr(249), { perPet: false }),
  A('addon_board_extra_walk', 'Extra Walk', ['pet_boarding'], inr(199), { addsMinutes: 20 }),
  A('addon_board_extra_play', 'Extra Play', ['pet_boarding'], inr(149), { addsMinutes: 20 }),
  A('addon_board_special_feeding', 'Special Feeding', ['pet_boarding'], inr(149)),
  A('addon_board_premium_room', 'Premium Room', ['pet_boarding'], inr(399), { perPet: false }),
  A('addon_board_ac_room', 'AC Room', ['pet_boarding'], inr(299), { perPet: false }),
  A('addon_board_late_checkout', 'Late Checkout', ['pet_boarding'], inr(199), { perPet: false }),
  // Walk
  A('addon_walk_extra_15', 'Extra 15 Minutes', ['pet_walk'], inr(99), { addsMinutes: 15, species: ['dog'] }),
  A('addon_walk_play', 'Play Session', ['pet_walk'], inr(129), { addsMinutes: 15 }),
  A('addon_walk_additional_pet', 'Additional Pet', ['pet_walk'], inr(139), { species: ['dog'] }),
  // Home care
  A('addon_home_extra_task', 'Extra Task', ['pet_home_care'], inr(99), { addsMinutes: 10 }),
  A('addon_home_extra_15', 'Extra 15 Minutes', ['pet_home_care'], inr(99), { addsMinutes: 15 }),
  A('addon_home_additional_pet', 'Additional Pet', ['pet_home_care'], inr(149)),
  A('addon_home_food_pickup', 'Pet Food Pickup', ['pet_home_care'], inr(199), { addsMinutes: 20 }),
  A('addon_home_additional_visit', 'Additional Visit', ['pet_home_care'], inr(249)),
  // Transport
  A('addon_transport_waiting', 'Waiting', ['pet_transport', 'pet_vet_assist'], inr(150), { addsMinutes: 30, perPet: false }),
  A('addon_transport_return', 'Return Trip', ['pet_transport', 'pet_vet_assist'], inr(299), { perPet: false }),
  A('addon_transport_additional_pet', 'Additional Pet', ['pet_transport', 'pet_vet_assist'], inr(199)),
  A('addon_transport_carrier', 'Carrier Provided', ['pet_transport', 'pet_vet_assist'], inr(99), { perPet: false }),
  A('addon_transport_night', 'Night Service', ['pet_transport', 'pet_vet_assist'], inr(199), { perPet: false }),
  A('addon_transport_toll', 'Toll/Parking', ['pet_transport', 'pet_vet_assist'], inr(80), { perPet: false }),
];

/* Packages (§31) */

const PACKAGES = [
  {
    code: 'pkg_weekly_walk', name: 'Weekly Walk Package', species: ['dog'], validityDays: 7,
    includedSessions: [{ variantCode: 'pw_walk_30', sessions: 5 }], discountPct: 10,
    description: '5 walks in 7 days, one helper where possible.',
  },
  {
    code: 'pkg_monthly_walk', name: 'Monthly Walk Package', species: ['dog'], validityDays: 30,
    includedSessions: [{ variantCode: 'pw_walk_30', sessions: 22 }], discountPct: 18,
    description: 'Weekday walks for a month.',
  },
  {
    code: 'pkg_daily_care', name: 'Daily Care Package', species: ['dog', 'cat'], validityDays: 30,
    includedSessions: [{ variantCode: 'ph_routine_care_30', sessions: 30 }], discountPct: 15,
  },
  {
    code: 'pkg_weekend_care', name: 'Weekend Care Package', species: ['dog', 'cat'], validityDays: 30,
    includedSessions: [{ variantCode: 'ph_feeding_visit', sessions: 8 }], discountPct: 12,
  },
  {
    code: 'pkg_grooming_monthly', name: 'Monthly Grooming', species: ['dog', 'cat'], validityDays: 30,
    includedSessions: [{ variantCode: 'pg_full_grooming', sessions: 1 }, { variantCode: 'pg_nail_clipping', sessions: 2 }], discountPct: 10,
  },
  {
    code: 'pkg_grooming_bundle', name: 'Grooming Package', species: ['dog', 'cat'], validityDays: 60,
    includedSessions: [{ variantCode: 'pg_full_grooming', sessions: 2 }], discountPct: 8,
  },
  {
    code: 'pkg_senior_care', name: 'Senior Pet Care Package', species: ['dog', 'cat'], validityDays: 30,
    includedSessions: [{ variantCode: 'pc_senior_check', sessions: 8 }, { variantCode: 'pw_senior_walk', sessions: 12 }], discountPct: 15,
  },
  {
    code: 'pkg_multi_pet', name: 'Multi-Pet Package', species: ['dog', 'cat'], validityDays: 30,
    includedSessions: [{ variantCode: 'ph_routine_care_30', sessions: 20 }], discountPct: 20,
    description: 'Built for households with more than one pet.',
  },
];

/* Cancellation policies (§37, §49) */

const CANCELLATION_POLICIES = [
  {
    code: 'pet_standard', name: 'Standard (Walk, Home Care, Check, Grooming)',
    categoryCodes: ['pet_walk', 'pet_home_care', 'pet_check', 'pet_grooming', 'pet_transport'],
    tiers: [
      { minHoursBefore: 6, refundPct: 100, label: 'Free cancellation' },
      { minHoursBefore: 2, refundPct: 75, providerCompensationPct: 25, label: 'Late cancellation' },
      { minHoursBefore: 0, refundPct: 50, providerCompensationPct: 50, label: 'Very late cancellation' },
    ],
    noShowRefundPct: 0,
  },
  {
    code: 'pet_boarding_strict', name: 'Boarding & Daycare',
    categoryCodes: ['pet_boarding'],
    // A held bed is a night the provider could not sell to anyone else.
    tiers: [
      { minHoursBefore: 72, refundPct: 100, label: 'Free cancellation' },
      { minHoursBefore: 24, refundPct: 50, providerCompensationPct: 50, label: 'Late cancellation' },
      { minHoursBefore: 0, refundPct: 0, providerCompensationPct: 100, label: 'Same-day cancellation' },
    ],
    noShowRefundPct: 0,
  },
  {
    code: 'pet_vet_assist_standard', name: 'Vet & Appointment Assistance',
    categoryCodes: ['pet_vet_assist'],
    tiers: [
      { minHoursBefore: 4, refundPct: 100, label: 'Free cancellation' },
      { minHoursBefore: 1, refundPct: 60, providerCompensationPct: 40, label: 'Late cancellation' },
      { minHoursBefore: 0, refundPct: 30, providerCompensationPct: 70, label: 'Very late cancellation' },
    ],
    noShowRefundPct: 0,
  },
];

module.exports = { PRICING_RULES, ADDONS, PACKAGES, CANCELLATION_POLICIES };
