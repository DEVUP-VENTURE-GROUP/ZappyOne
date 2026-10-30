/**
 * Water & Tank Care vertical seed data.
 *
 * DEFAULT CONTENT, not application logic — admin can edit, archive or replace
 * any of it without a deploy (§1). The engine that consumes it is the same one
 * mobile, laptop and the two vehicle verticals use; only this file differs
 * (§91). Adding this vertical needed one line of code — `water_tank_care` in
 * the vertical registry — everything else below is data.
 *
 * THE MAPPING, and why it costs zero new client code:
 *
 *   The customer flow is Brand → Model → Problem → Diagnosis → Provider, and
 *   for a tank there is no meaningful "brand" the way Samsung is a phone
 *   brand — but TANK TYPE occupies exactly that first slot (it's the first
 *   thing a customer identifies: "I have an overhead tank"), and CAPACITY
 *   occupies the model slot (the second thing: "it's about 1,000 litres").
 *   Seeding no product types keeps the flow shallow — brand then model
 *   directly, the same two-step identification mobile already uses — so
 *   RepairFlowPage needed no new steps.
 *
 *   Research reference prices (§21 of the brief) are seeded nowhere in this
 *   file. §90/§66 forbid presenting invented numbers as verified prices —
 *   providers set their own price per tank type × capacity × quality, exactly
 *   like every other vertical, and it goes live immediately (no price limit).
 *
 * THE FOUR SERVICES ARE PROBLEM CATEGORIES, not a fork in the engine:
 *
 *   Cleaning, Inspection, Flushing and Repair are what the customer is
 *   actually short-listing when they open the vertical, and a category with
 *   real problems under it is exactly what a problem category already is
 *   everywhere else. Routing between them (a leakage report may need an
 *   inspection before a repair; a cleaning symptom may recommend flushing as
 *   an add-on) is the diagnostic engine's job, in water-tank-care-diagnostics.
 *
 * SAFETY: confined-space entry (underground sumps, large tanks) and
 * electrical-near-water hazards use the SAME severity-gating pattern built for
 * EV thermal faults and CNG leaks — `severity: 'critical'` +
 * `requiresDiagnosis: true` — so neither can ever be auto-priced or
 * auto-dispatched to whoever is nearest. A worker without the confined-space
 * qualification must never be sent into a sump.
 *
 * DELIBERATELY NOT BUILT IN THIS PASS (flagged, not faked):
 *
 *   MULTI-ADD-ON CART. A booking here carries ONE repairCode, like every
 *   other vertical. "Deep Disinfection" and "High-Pressure Cleaning" are
 *   seeded as their own bookable repairs (so a provider can price and a
 *   customer can book them), not as line items stacked onto a cleaning order
 *   in a single checkout. A real cart needs a schema change to the booking
 *   model shared by all five verticals — flagged for a follow-up pass rather
 *   than half-built here.
 *
 *   AMC / RECURRING PLANS. Genuinely new subsystem (a subscription that spawns
 *   bookings on a schedule) — nothing in the repair engine does this today.
 *
 *   STRUCTURED PDF REPORT. The booking already carries `diagnosisSummary`,
 *   `completionPhotos` and the QA checklist result — the raw material for a
 *   report exists — but a dedicated PDF generator is new work, not seed data.
 *
 *   PERSISTENT "MY WATER ASSETS" REGISTRY. Today a tank's type and capacity
 *   are captured per booking (brandCode/modelCode/location), the same as a
 *   phone's brand/model on a repair booking. A standalone WaterAsset a
 *   customer can revisit across many bookings is a new customer-facing
 *   concept, not a data-seed.
 */

const VERTICAL = 'water_tank_care';

/**
 * No product types, deliberately.
 *
 * `RepairFlowPage` auto-detects a shallow (brand -> model) flow when there
 * are zero product types for a vertical — exactly the mobile flow. Tank type
 * already occupies the brand slot, so adding a product-type tier here would
 * insert a redundant extra screen between "what tank" and "what size".
 */
const PRODUCT_TYPES = [];

/* Tank types — the "brand" tier (§5) */

const OVERHEAD = 'overhead', SINTEX = 'sintex_plastic', RCC = 'rcc_concrete',
  SUMP = 'underground_sump', APARTMENT = 'apartment_common', OTHER_TANK = 'other_tank';

const BRANDS = [
  { code: OVERHEAD, name: 'Overhead Tank', sortOrder: 1 },
  { code: SINTEX, name: 'Sintex / Plastic Tank', sortOrder: 2 },
  { code: RCC, name: 'RCC / Concrete Tank', sortOrder: 3 },
  { code: SUMP, name: 'Underground Sump', sortOrder: 4 },
  { code: APARTMENT, name: 'Apartment / Society Tank', sortOrder: 5 },
  { code: OTHER_TANK, name: 'Other / Not Sure', sortOrder: 6 },
];

/** Tanks that require confined-space entry — the safety gate below reads this. */
const CONFINED_SPACE_TYPES = [SUMP, APARTMENT];

/* Problem taxonomy (§4, §12–15) */

const PROBLEM_CATEGORIES = [
  { code: 'wt_cleaning', name: 'Tank & Sump Deep Cleaning', icon: 'droplets', displayOrder: 1 },
  { code: 'wt_inspection', name: 'Tank Health Inspection', icon: 'search', displayOrder: 2 },
  { code: 'wt_flushing', name: 'Tank + Pipe Flushing', icon: 'wind', displayOrder: 3 },
  { code: 'wt_repair', name: 'Tank Repair & Protection', icon: 'wrench', displayOrder: 4 },
  // Bookable separately (see the cart note above) rather than bundled.
  { code: 'wt_addons', name: 'Add-on Services', icon: 'plus-circle', displayOrder: 5 },
];

/**
 * `P(code, name, category, candidates, opts)`.
 *
 * `candidates` are POSSIBLE outcomes, never a decision (§10) — "there's a bad
 * smell" could mean routine cleaning is overdue or it could mean something
 * has died in the tank; the diagnostic tree, not this list, decides which.
 */
const P = (code, name, categoryCode, candidates = [], opts = {}) => ({
  code, name, categoryCode, candidateRepairCodes: candidates, ...opts,
});

const PROBLEMS = [
  /* Cleaning: symptom questions from the brief's Step 4 (§7) */
  P('wt_never_cleaned', 'Never been cleaned / overdue', 'wt_cleaning',
    ['wt_deep_cleaning'], { isPopular: true }),
  P('wt_visible_algae', 'Visible algae or green growth', 'wt_cleaning',
    ['wt_deep_cleaning', 'wt_disinfection'], { isPopular: true }),
  P('wt_sediment_visible', 'Sediment or sludge at the bottom', 'wt_cleaning',
    ['wt_deep_cleaning', 'wt_sludge_removal']),
  P('wt_bad_smell', 'Bad smell from the water', 'wt_cleaning',
    ['wt_deep_cleaning', 'wt_disinfection'], { isPopular: true, severity: 'high' }),
  P('wt_water_dirty', 'Water looks dirty or discoloured', 'wt_cleaning',
    ['wt_deep_cleaning', 'wt_water_test'], { isPopular: true }),
  P('wt_routine_cleaning', 'Routine scheduled cleaning', 'wt_cleaning', ['wt_deep_cleaning']),

  /* Inspection: the "I don't know" catch-all (§8, §5) */
  P('wt_unsure_condition', "Not sure if there's a problem — just check it", 'wt_inspection',
    ['wt_health_inspection'], { isPopular: true }),
  P('wt_before_buying', 'Checking a tank before moving in / buying', 'wt_inspection',
    ['wt_health_inspection']),
  P('wt_periodic_checkup', 'Periodic health check-up', 'wt_inspection', ['wt_health_inspection']),

  /* Flushing (§9) */
  P('wt_low_flow', 'Water flow feels weak or inconsistent', 'wt_flushing',
    ['wt_tank_pipe_flushing'], { isPopular: true }),
  P('wt_water_taste_off', 'Water tastes or smells odd after cleaning', 'wt_flushing',
    ['wt_tank_pipe_flushing']),
  P('wt_flushing_routine', 'Routine tank + pipe flushing', 'wt_flushing', ['wt_tank_pipe_flushing']),

  /* Repair & protection (§10) */
  // Confirmed leakage is triaged (small vs structural) rather than assumed —
  // see the diagnostic flow. A crack in an underground sump is also a
  // confined-space job, so it carries the safety severity too.
  // All three repairs are plausible outcomes of "leakage" before the tree has
  // asked anything — the flow narrows to the specific one (fitting vs
  // structural); these are the fallback candidates for the rare case answers
  // are inconclusive and the flow votes nothing.
  P('wt_leakage', 'Leakage', 'wt_repair',
    ['wt_leakage_repair', 'wt_fitting_repair', 'wt_structural_repair', 'wt_health_inspection'],
    { isPopular: true, severity: 'high' }),
  P('wt_crack_damage', 'Crack or structural damage', 'wt_repair',
    ['wt_structural_repair', 'wt_health_inspection'], { severity: 'critical', requiresDiagnosis: true }),
  P('wt_fitting_problem', 'Fitting problem (inlet/outlet/valve)', 'wt_repair',
    ['wt_fitting_repair']),
  P('wt_overflow_problem', 'Overflow problem', 'wt_repair', ['wt_overflow_fitting_repair']),
  P('wt_lid_problem', 'Lid damaged or missing', 'wt_repair', ['wt_lid_replacement'], { isPopular: true }),
  P('wt_insect_entry', 'Insects or debris getting in', 'wt_repair', ['wt_insect_protection']),
  P('wt_valve_problem', 'Valve or fitting needs replacing', 'wt_repair', ['wt_valve_replacement']),
  P('wt_installation_issue', 'New tank installation', 'wt_repair', ['wt_tank_installation']),
  P('wt_repair_unsure', "Don't know what's wrong — just repair it", 'wt_repair',
    ['wt_health_inspection'], { requiresDiagnosis: true }),

  /* Add-ons (§22) — bookable on their own until the cart exists */
  P('wt_addon_disinfection_req', 'Deep disinfection & sanitisation', 'wt_addons', ['wt_disinfection']),
  P('wt_addon_pressure_req', 'High-pressure jet cleaning', 'wt_addons', ['wt_pressure_cleaning']),
  P('wt_addon_sludge_req', 'Sludge / sediment removal', 'wt_addons', ['wt_sludge_removal']),
  P('wt_addon_water_test_req', 'Water quality test', 'wt_addons', ['wt_water_test']),
  P('wt_addon_lid_protection_req', 'Tank lid & insect protection', 'wt_addons', ['wt_insect_protection']),
];

/* Repairs — the bookable, priced services (§4, §20) */

const D = 'doorstep';

/**
 * Every repair is doorstep-only. A tank does not travel to a workshop, and
 * roadside/pickup have no meaning here — reusing the same `SERVICE_MODES`
 * list the vehicle verticals draw from, just with one mode selected.
 *
 * `pricingMode: 'fixed'` throughout: no ranges, ever (Faizan's rule) — a
 * provider prices per tank type (brand) and capacity (model), and that is the
 * number the customer sees. Structural repairs and anything following an
 * inspection are `diagnosis_required` because the true scope is not known
 * until someone has looked.
 */
const REPAIRS = [
  /* Cleaning */
  { code: 'wt_deep_cleaning', name: 'Tank & Sump Deep Cleaning', pricingMode: 'fixed', minSkillLevel: 1, modes: [D], durationMin: 90, warrantyDays: 30 },

  /* Inspection */
  { code: 'wt_health_inspection', name: 'Tank Health Inspection', pricingMode: 'fixed', minSkillLevel: 2, modes: [D], durationMin: 45, warrantyDays: 0 },

  /* Flushing */
  { code: 'wt_tank_pipe_flushing', name: 'Tank + Pipe Flushing', pricingMode: 'fixed', minSkillLevel: 1, modes: [D], durationMin: 60, warrantyDays: 15 },

  /* Repair & protection */
  { code: 'wt_leakage_repair', name: 'Leakage Repair', pricingMode: 'fixed', minSkillLevel: 2, modes: [D], durationMin: 90, warrantyDays: 90 },
  { code: 'wt_fitting_repair', name: 'Fitting Repair', pricingMode: 'fixed', minSkillLevel: 1, modes: [D], durationMin: 45, warrantyDays: 60 },
  { code: 'wt_overflow_fitting_repair', name: 'Overflow Fitting Repair', pricingMode: 'fixed', minSkillLevel: 1, modes: [D], durationMin: 45, warrantyDays: 60 },
  { code: 'wt_lid_replacement', name: 'Lid Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [D], durationMin: 30, warrantyDays: 180, component: 'wt_lid' },
  { code: 'wt_insect_protection', name: 'Insect & Debris Protection', pricingMode: 'fixed', minSkillLevel: 1, modes: [D], durationMin: 30, warrantyDays: 180 },
  { code: 'wt_valve_replacement', name: 'Valve / Fitting Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D], durationMin: 60, warrantyDays: 180, component: 'wt_valve' },
  // Structural work on a confined-space tank never gets a firm number from a
  // dropdown — the actual crack/damage has to be seen first.
  { code: 'wt_structural_repair', name: 'Structural Crack / Damage Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [D], durationMin: 180, warrantyDays: 180 },
  { code: 'wt_tank_installation', name: 'Tank Installation', pricingMode: 'diagnosis_required', minSkillLevel: 2, modes: [D], durationMin: 240, warrantyDays: 365 },

  /* Add-ons */
  { code: 'wt_disinfection', name: 'Deep Disinfection & Sanitisation', pricingMode: 'fixed', minSkillLevel: 1, modes: [D], durationMin: 30, warrantyDays: 15 },
  { code: 'wt_pressure_cleaning', name: 'High-Pressure Jet Cleaning', pricingMode: 'fixed', minSkillLevel: 1, modes: [D], durationMin: 30, warrantyDays: 0 },
  { code: 'wt_sludge_removal', name: 'Sludge / Sediment Removal', pricingMode: 'fixed', minSkillLevel: 1, modes: [D], durationMin: 30, warrantyDays: 0 },
  { code: 'wt_water_test', name: 'Water Quality Test', pricingMode: 'fixed', minSkillLevel: 2, modes: [D], durationMin: 20, warrantyDays: 0 },
];

/* Skill levels (§11) */

const SKILL_LEVELS = [
  { level: 1, name: 'Standard', description: 'Cleaning, flushing, fittings, lid & insect protection', requiresVerification: false },
  { level: 2, name: 'Inspection & Testing', description: 'Health inspection, water testing, valve replacement', requiresVerification: false },
  {
    level: 3,
    name: 'Confined Space & Structural',
    // Gate for the two hazards §24 calls out: entering an underground sump or
    // apartment tank, and structural repair where the true damage is unknown
    // until the tank is opened.
    description: 'Underground sump / confined-space entry, structural crack repair, tank installation',
    requiresVerification: true,
  },
];

/* QA checklists (§16, §43) */

const QA_CHECKLISTS = [
  {
    code: 'wt_cleaning_standard', name: 'Cleaning QA', stage: 'after',
    repairCodes: ['wt_deep_cleaning', 'wt_disinfection', 'wt_pressure_cleaning', 'wt_sludge_removal'],
    items: [
      { code: 'drained', label: 'Tank fully drained before cleaning', required: true },
      { code: 'sludge_removed', label: 'Sludge and sediment removed', required: true },
      { code: 'scrubbed', label: 'Walls and floor scrubbed', required: true },
      { code: 'rinsed', label: 'Rinsed and refilled clean', required: true },
      { code: 'lid_refitted', label: 'Lid refitted and secure', required: true },
      { code: 'before_photos', label: 'Before photos captured', required: true },
      { code: 'after_photos', label: 'After photos captured', required: true },
      { code: 'no_new_damage', label: 'No new damage caused during cleaning', required: true },
    ],
  },
  {
    code: 'wt_inspection_standard', name: 'Inspection QA', stage: 'after', repairCodes: ['wt_health_inspection'],
    items: [
      { code: 'structure', label: 'Structure and cracks checked', required: true },
      { code: 'leakage', label: 'Leakage checked', required: true },
      { code: 'fittings', label: 'Inlet, outlet and fittings checked', required: true },
      { code: 'overflow', label: 'Overflow checked', required: true },
      { code: 'lid', label: 'Lid and insect protection checked', required: true },
      { code: 'algae_sediment', label: 'Algae and sediment levels recorded', required: true },
      { code: 'findings_photographed', label: 'Every finding has a photo', required: true },
      { code: 'recommendation_given', label: 'A clear recommendation was given', required: true },
    ],
  },
  {
    code: 'wt_flushing_standard', name: 'Flushing QA', stage: 'after', repairCodes: ['wt_tank_pipe_flushing'],
    items: [
      { code: 'lines_recorded', label: 'Serviced lines recorded', required: true },
      { code: 'inaccessible_recorded', label: 'Inaccessible lines recorded, not claimed as done', required: true },
      { code: 'flow_checked', label: 'Flow checked after flushing', required: true },
      { code: 'no_leaks_introduced', label: 'No leaks introduced at reconnected fittings', required: true },
      { code: 'photos', label: 'Result photographed', required: true },
    ],
  },
  {
    code: 'wt_repair_standard', name: 'Repair QA', stage: 'after',
    repairCodes: ['wt_leakage_repair', 'wt_fitting_repair', 'wt_overflow_fitting_repair', 'wt_lid_replacement', 'wt_valve_replacement', 'wt_structural_repair', 'wt_insect_protection'],
    items: [
      { code: 'before_photos', label: 'Before photos captured', required: true },
      { code: 'scope_matches_approval', label: 'Work matches the approved scope', required: true },
      { code: 'functional_check', label: 'Repair verified functional (no leak / secure fit)', required: true },
      { code: 'materials_recorded', label: 'Materials used recorded', required: true },
      { code: 'after_photos', label: 'After photos captured', required: true },
    ],
  },
  {
    code: 'wt_safety', name: 'Confined-Space Safety Check', stage: 'before',
    repairCodes: [],
    items: [
      { code: 'ventilation', label: 'Adequate ventilation confirmed', required: true },
      { code: 'gas_check', label: 'No hazardous gas / fumes suspected', required: true },
      { code: 'structural_safety', label: 'Structure judged safe to enter', required: true },
      { code: 'ppe_worn', label: 'PPE and safety harness in use where required', required: true },
      { code: 'second_person', label: 'A second person present for confined entry', required: true },
    ],
  },
];

module.exports = {
  VERTICAL, PRODUCT_TYPES, BRANDS, PROBLEM_CATEGORIES, PROBLEMS, REPAIRS, SKILL_LEVELS, QA_CHECKLISTS,
  CONFINED_SPACE_TYPES,
};
