/**
 * Four-wheeler vertical seed data.
 *
 * DEFAULT CONTENT, not application logic — admin can edit, archive or replace
 * any of it without a deploy (§1). The engine that consumes it is the same one
 * mobile, laptop and two-wheelers use; only this file differs (§91).
 *
 * A car differs from a bike in three ways that matter to the data model, and
 * each is handled as data rather than a code branch:
 *
 *   1. BODY AND FUEL VARY INDEPENDENTLY. A Swift is petrol or CNG; a Nexon is
 *      petrol, diesel or electric. So problems carry TWO scopes — the body type
 *      (`appliesToProductTypeCodes`) and the powertrain (`appliesToFuelTypes`)
 *      — and a question only reaches an owner whose car could actually have it.
 *
 *   2. MORE SYSTEMS CAN ONLY BE ANSWERED BY A SCANNER. A check-engine light,
 *      an ABS warning or an ADAS fault names a SYSTEM, never a failed part.
 *      Those are `requiresDiagnosis` without exception — quoting a sensor off a
 *      dashboard symbol is inventing a number.
 *
 *   3. TWO FUEL SYSTEMS ARE DANGEROUS WHEN THEY FAIL. High-voltage packs and
 *      CNG cylinders both carry `severity: 'critical'` on their leak and
 *      thermal symptoms, and both route to an inspection rather than a repair.
 *
 * Deliberately absent: invented variant/year compatibility and any price (§90,
 * §66). Variants and years arrive through admin entry; prices come from the
 * providers who will actually do the work.
 */

const VERTICAL = 'four_wheeler';

/* ─── Body types (§4) ──────────────────────────────────────────────────── */

const HATCH = 'hatchback', SEDAN = 'sedan', SUV = 'suv', MUV = 'muv', LUX = 'luxury';

/** Every body type. Used where a problem is universal but readability helps. */
const ALL_BODIES = [HATCH, SEDAN, SUV, MUV, LUX];

const PRODUCT_TYPES = [
  { code: HATCH, name: 'Hatchback', displayOrder: 1, isPopular: true },
  { code: SEDAN, name: 'Sedan', displayOrder: 2, isPopular: true },
  { code: SUV, name: 'SUV', displayOrder: 3, isPopular: true },
  { code: MUV, name: 'MUV / MPV', displayOrder: 4, isPopular: true },
  { code: LUX, name: 'Premium / Luxury', displayOrder: 5 },
];

/* ─── Powertrains (§5) ─────────────────────────────────────────────────── */

const PETROL = 'petrol', DIESEL = 'diesel', CNG = 'cng', HYBRID = 'hybrid', EV = 'electric';

/** Anything with an internal-combustion engine — includes hybrids. */
const ICE = [PETROL, DIESEL, CNG, HYBRID];
/** Anything with a high-voltage traction battery — includes hybrids. */
const ELECTRIFIED = [EV, HYBRID];
/** Battery-electric only: no engine, no gearbox, no exhaust. */
const BEV = [EV];
/** Gaseous fuel, with its own cylinder, regulator and safety rules. */
const GAS = [CNG];

const FUEL_TYPES = [
  { code: PETROL, name: 'Petrol', displayOrder: 1 },
  { code: DIESEL, name: 'Diesel', displayOrder: 2 },
  { code: CNG, name: 'CNG', displayOrder: 3 },
  { code: HYBRID, name: 'Hybrid', displayOrder: 4 },
  { code: EV, name: 'Electric', displayOrder: 5 },
];

/* ─── Brands (§8) ──────────────────────────────────────────────────────── */

const BRANDS = [
  { code: 'maruti-suzuki', name: 'Maruti Suzuki', sortOrder: 1 },
  { code: 'hyundai', name: 'Hyundai', sortOrder: 2 },
  { code: 'tata-motors', name: 'Tata Motors', sortOrder: 3 },
  { code: 'mahindra', name: 'Mahindra', sortOrder: 4 },
  { code: 'toyota', name: 'Toyota', sortOrder: 5 },
  { code: 'kia', name: 'Kia', sortOrder: 6 },
  { code: 'honda-car', name: 'Honda', sortOrder: 7 },
  { code: 'mg-motor', name: 'MG Motor', sortOrder: 8 },
  { code: 'renault', name: 'Renault', sortOrder: 9 },
  { code: 'nissan', name: 'Nissan', sortOrder: 10 },
  { code: 'volkswagen', name: 'Volkswagen', sortOrder: 11 },
  { code: 'skoda', name: 'Škoda', sortOrder: 12 },
  { code: 'jeep', name: 'Jeep', sortOrder: 13 },
  { code: 'citroen', name: 'Citroën', sortOrder: 14 },
  { code: 'mercedes-benz', name: 'Mercedes-Benz', sortOrder: 15 },
  { code: 'bmw', name: 'BMW', sortOrder: 16 },
  { code: 'audi', name: 'Audi', sortOrder: 17 },
  { code: 'volvo', name: 'Volvo', sortOrder: 18 },
  { code: 'mini', name: 'MINI', sortOrder: 19 },
  { code: 'jaguar', name: 'Jaguar', sortOrder: 20 },
  { code: 'land-rover', name: 'Land Rover', sortOrder: 21 },
  { code: 'lexus', name: 'Lexus', sortOrder: 22 },
  { code: 'byd', name: 'BYD', sortOrder: 23 },
  { code: 'tesla', name: 'Tesla', sortOrder: 24 },
];

/* ─── Problem taxonomy (§12) ───────────────────────────────────────────── */

const PROBLEM_CATEGORIES = [
  { code: 'fw_roadside', name: 'Roadside Emergency', icon: 'alert-triangle', displayOrder: 1 },
  { code: 'fw_starting', name: 'Starting & Ignition', icon: 'power', displayOrder: 2 },
  { code: 'fw_engine', name: 'Engine & Performance', icon: 'settings', displayOrder: 3 },
  { code: 'fw_battery_electrical', name: 'Battery & Electrical', icon: 'battery', displayOrder: 4 },
  { code: 'fw_fuel', name: 'Fuel System', icon: 'droplet', displayOrder: 5 },
  { code: 'fw_cng', name: 'CNG / LPG', icon: 'flame', displayOrder: 6 },
  { code: 'fw_transmission', name: 'Transmission & Gearbox', icon: 'git-merge', displayOrder: 7 },
  { code: 'fw_clutch', name: 'Clutch', icon: 'disc', displayOrder: 8 },
  { code: 'fw_brakes', name: 'Brakes', icon: 'octagon', displayOrder: 9 },
  { code: 'fw_steering', name: 'Steering', icon: 'navigation', displayOrder: 10 },
  { code: 'fw_suspension', name: 'Suspension', icon: 'move-vertical', displayOrder: 11 },
  { code: 'fw_tyres_wheels', name: 'Tyres & Wheels', icon: 'circle', displayOrder: 12 },
  { code: 'fw_ac', name: 'AC & Climate', icon: 'wind', displayOrder: 13 },
  { code: 'fw_cooling', name: 'Cooling', icon: 'thermometer', displayOrder: 14 },
  { code: 'fw_exhaust', name: 'Exhaust & Emissions', icon: 'cloud', displayOrder: 15 },
  { code: 'fw_lights', name: 'Lights', icon: 'lightbulb', displayOrder: 16 },
  { code: 'fw_body', name: 'Body & Exterior', icon: 'shield', displayOrder: 17 },
  { code: 'fw_glass', name: 'Glass & Windows', icon: 'square', displayOrder: 18 },
  { code: 'fw_doors_locks', name: 'Doors & Locks', icon: 'lock', displayOrder: 19 },
  { code: 'fw_interior', name: 'Interior', icon: 'armchair', displayOrder: 20 },
  { code: 'fw_infotainment', name: 'Infotainment', icon: 'monitor', displayOrder: 21 },
  { code: 'fw_adas', name: 'ADAS & Sensors', icon: 'radar', displayOrder: 22 },
  { code: 'fw_diagnostics', name: 'Warning Lights & Diagnostics', icon: 'activity', displayOrder: 23 },
  { code: 'fw_safety', name: 'Safety & Accident', icon: 'alert-octagon', displayOrder: 24 },
  { code: 'fw_maintenance', name: 'Service & Maintenance', icon: 'tool', displayOrder: 25 },
  // ── Electrified only ──
  { code: 'fw_ev_battery', name: 'EV Battery', icon: 'battery-charging', displayOrder: 26 },
  { code: 'fw_ev_charging', name: 'EV Charging', icon: 'plug', displayOrder: 27 },
  { code: 'fw_ev_motor', name: 'EV Motor & Controller', icon: 'zap', displayOrder: 28 },
];

/**
 * `P(code, name, category, candidates, opts)`.
 *
 * `candidates` are POSSIBLE repairs, never a decision (§10). "AC not cooling"
 * lists five because the symptom does not identify the fault — it could be gas,
 * the compressor, the condenser, the blower or a relay, and going straight to a
 * refill is how a customer pays twice for the same fault.
 */
const P = (code, name, categoryCode, candidates = [], opts = {}) => ({
  code, name, categoryCode, candidateRepairCodes: candidates, ...opts,
});

const PROBLEMS = [
  /* ── Roadside emergency ─────────────────────────────────────────────── */
  P('fw_wont_start_roadside', 'Car won\'t start', 'fw_roadside',
    ['fw_jump_start', 'fw_battery_replacement', 'fw_starter_repair', 'fw_obd_scan', 'fw_roadside_minor_repair'],
    { isPopular: true, severity: 'high' }),
  P('fw_battery_dead_roadside', 'Battery dead', 'fw_roadside',
    ['fw_jump_start', 'fw_battery_replacement'], { isPopular: true, severity: 'high' }),
  P('fw_flat_tyre', 'Flat tyre / puncture', 'fw_roadside',
    ['fw_puncture_repair', 'fw_tyre_replacement', 'fw_spare_wheel_fitment'], { isPopular: true, severity: 'high' }),
  P('fw_out_of_fuel', 'Out of fuel', 'fw_roadside', ['fw_fuel_delivery'],
    { severity: 'high', appliesToFuelTypes: ICE }),
  P('fw_key_locked', 'Key locked inside or lost', 'fw_roadside', ['fw_lock_service'], { severity: 'high' }),
  P('fw_overheating_roadside', 'Overheating on the road', 'fw_roadside',
    ['fw_coolant_service', 'fw_towing'], { severity: 'high', appliesToFuelTypes: ICE }),
  P('fw_breakdown', 'Broken down — cannot drive', 'fw_roadside',
    ['fw_roadside_minor_repair', 'fw_towing'], { severity: 'high', requiresDiagnosis: true }),
  P('fw_ev_out_of_charge', 'Out of charge', 'fw_roadside',
    ['fw_towing', 'fw_ev_charge_assist'], { severity: 'high', appliesToFuelTypes: BEV }),

  /* ── Starting & ignition ────────────────────────────────────────────── */
  P('fw_cranks_no_start', 'Engine cranks but does not start', 'fw_starting',
    ['fw_obd_scan', 'fw_spark_plug_replacement', 'fw_fuel_pump_replacement', 'fw_ignition_coil_replacement'],
    { appliesToFuelTypes: ICE, severity: 'high', isPopular: true }),
  P('fw_no_crank', 'Nothing happens when I turn the key', 'fw_starting',
    ['fw_battery_replacement', 'fw_starter_repair', 'fw_ignition_switch_replacement'], { severity: 'high' }),
  P('fw_starter_issue', 'Starter motor issue', 'fw_starting', ['fw_starter_repair']),
  P('fw_key_not_detected', 'Key not detected / keyless start issue', 'fw_starting',
    ['fw_key_programming', 'fw_obd_scan']),
  P('fw_immobiliser', 'Immobiliser warning', 'fw_starting', ['fw_obd_scan', 'fw_key_programming'],
    { requiresDiagnosis: true }),
  P('fw_spark_plug_issue', 'Spark plug issue', 'fw_starting', ['fw_spark_plug_replacement'],
    { appliesToFuelTypes: [PETROL, CNG, HYBRID] }),
  P('fw_intermittent_start', 'Starts sometimes, not others', 'fw_starting',
    ['fw_obd_scan', 'fw_battery_replacement'], { requiresDiagnosis: true }),

  /* ── Engine & performance — combustion only ─────────────────────────── */
  P('fw_engine_stalls', 'Engine starts then stalls', 'fw_engine',
    ['fw_obd_scan', 'fw_fuel_injector_service', 'fw_throttle_body_cleaning'], { appliesToFuelTypes: ICE }),
  P('fw_rough_idle', 'Rough idle', 'fw_engine',
    ['fw_spark_plug_replacement', 'fw_throttle_body_cleaning', 'fw_obd_scan'],
    { appliesToFuelTypes: ICE, isPopular: true }),
  P('fw_misfiring', 'Engine misfiring', 'fw_engine',
    ['fw_spark_plug_replacement', 'fw_ignition_coil_replacement', 'fw_obd_scan'], { appliesToFuelTypes: ICE }),
  P('fw_engine_overheating', 'Engine overheating', 'fw_engine',
    ['fw_coolant_service', 'fw_radiator_repair', 'fw_thermostat_replacement', 'fw_engine_repair'],
    { appliesToFuelTypes: ICE, severity: 'high' }),
  P('fw_low_power', 'Low power / poor acceleration', 'fw_engine',
    ['fw_obd_scan', 'fw_air_filter_replacement', 'fw_fuel_injector_service'],
    { appliesToFuelTypes: ICE, isPopular: true }),
  P('fw_engine_noise', 'Unusual engine noise', 'fw_engine', ['fw_engine_repair'],
    { appliesToFuelTypes: ICE, requiresDiagnosis: true }),
  P('fw_engine_knocking', 'Engine knocking', 'fw_engine', ['fw_engine_repair'],
    { appliesToFuelTypes: ICE, severity: 'high', requiresDiagnosis: true }),
  P('fw_white_smoke', 'White smoke from exhaust', 'fw_engine', ['fw_engine_repair'],
    { appliesToFuelTypes: ICE, severity: 'high', requiresDiagnosis: true }),
  P('fw_blue_smoke', 'Blue smoke from exhaust', 'fw_engine', ['fw_engine_repair'],
    { appliesToFuelTypes: ICE, severity: 'high', requiresDiagnosis: true }),
  P('fw_black_smoke', 'Black smoke from exhaust', 'fw_engine',
    ['fw_fuel_injector_service', 'fw_air_filter_replacement', 'fw_obd_scan'], { appliesToFuelTypes: ICE }),
  P('fw_oil_leak', 'Engine oil leak', 'fw_engine', ['fw_oil_leak_repair'],
    { appliesToFuelTypes: ICE, severity: 'high' }),
  P('fw_oil_consumption', 'Engine using too much oil', 'fw_engine', ['fw_engine_repair'],
    { appliesToFuelTypes: ICE, requiresDiagnosis: true }),
  P('fw_poor_mileage', 'Poor fuel efficiency', 'fw_engine',
    ['fw_periodic_service', 'fw_air_filter_replacement', 'fw_obd_scan'],
    { appliesToFuelTypes: ICE, isPopular: true }),
  P('fw_power_loss_driving', 'Loses power while driving', 'fw_engine',
    ['fw_obd_scan', 'fw_fuel_pump_replacement'], { appliesToFuelTypes: ICE, severity: 'high', requiresDiagnosis: true }),

  /* ── Battery & electrical ───────────────────────────────────────────── */
  P('fw_battery_draining', 'Battery keeps draining', 'fw_battery_electrical',
    ['fw_battery_replacement', 'fw_alternator_repair', 'fw_electrical_diagnosis'], { isPopular: true }),
  P('fw_battery_not_charging', 'Battery not charging', 'fw_battery_electrical',
    ['fw_alternator_repair', 'fw_battery_replacement']),
  P('fw_alternator_noise', 'Alternator noise', 'fw_battery_electrical', ['fw_alternator_repair']),
  P('fw_fuse_blown', 'Fuse or relay failure', 'fw_battery_electrical', ['fw_fuse_relay_replacement']),
  P('fw_wiring_issue', 'Wiring or short-circuit problem', 'fw_battery_electrical',
    ['fw_electrical_diagnosis'], { severity: 'high', requiresDiagnosis: true }),
  P('fw_multiple_warnings', 'Several warning lights at once', 'fw_battery_electrical',
    ['fw_obd_scan', 'fw_electrical_diagnosis'], { severity: 'high', requiresDiagnosis: true }),
  P('fw_12v_battery_ev', '12V battery issue', 'fw_battery_electrical',
    ['fw_battery_replacement'], { appliesToFuelTypes: ELECTRIFIED }),

  /* ── Fuel system ────────────────────────────────────────────────────── */
  P('fw_fuel_pump_issue', 'Fuel pump problem', 'fw_fuel', ['fw_fuel_pump_replacement'], { appliesToFuelTypes: ICE }),
  P('fw_fuel_injector_issue', 'Fuel injector problem', 'fw_fuel', ['fw_fuel_injector_service'], { appliesToFuelTypes: ICE }),
  P('fw_fuel_filter_issue', 'Fuel filter problem', 'fw_fuel', ['fw_fuel_filter_replacement'], { appliesToFuelTypes: ICE }),
  P('fw_fuel_leak', 'Fuel leak or smell of petrol', 'fw_fuel',
    ['fw_fuel_line_repair'], { appliesToFuelTypes: ICE, severity: 'critical', requiresDiagnosis: true }),
  P('fw_fuel_contamination', 'Wrong or contaminated fuel', 'fw_fuel',
    ['fw_fuel_system_flush'], { appliesToFuelTypes: ICE, severity: 'high' }),

  /* ── CNG / LPG — gaseous fuel has its own safety rules ──────────────── */
  P('fw_cng_not_switching', 'Does not switch to CNG', 'fw_cng',
    ['fw_cng_system_service', 'fw_cng_regulator_repair'], { appliesToFuelTypes: GAS, isPopular: true }),
  P('fw_cng_poor_pickup', 'Poor pickup on CNG', 'fw_cng',
    ['fw_cng_system_service', 'fw_cng_injector_service'], { appliesToFuelTypes: GAS }),
  P('fw_cng_poor_mileage', 'Poor CNG mileage', 'fw_cng', ['fw_cng_system_service'], { appliesToFuelTypes: GAS }),
  P('fw_cng_not_filling', 'CNG not filling', 'fw_cng', ['fw_cng_system_service'], { appliesToFuelTypes: GAS }),
  P('fw_cng_starting_issue', 'Starting trouble on CNG', 'fw_cng',
    ['fw_cng_system_service', 'fw_spark_plug_replacement'], { appliesToFuelTypes: GAS }),
  P('fw_cng_warning', 'CNG warning light', 'fw_cng', ['fw_cng_safety_inspection'],
    { appliesToFuelTypes: GAS, requiresDiagnosis: true }),
  P('fw_cng_inspection_req', 'CNG system inspection', 'fw_cng', ['fw_cng_safety_inspection'],
    { appliesToFuelTypes: GAS }),
  // A gas leak is an explosion risk, not a booking.
  P('fw_cng_leak', 'Smell of gas / suspected CNG leak', 'fw_cng', ['fw_cng_safety_inspection'],
    { appliesToFuelTypes: GAS, severity: 'critical', requiresDiagnosis: true }),

  /* ── Transmission & clutch ──────────────────────────────────────────── */
  P('fw_gear_not_shifting', 'Gears will not shift', 'fw_transmission',
    ['fw_transmission_repair', 'fw_clutch_replacement'], { severity: 'high', requiresDiagnosis: true }),
  P('fw_gear_hard', 'Gears shift hard', 'fw_transmission',
    ['fw_transmission_oil_change', 'fw_clutch_replacement']),
  P('fw_gear_slipping', 'Gears slipping', 'fw_transmission',
    ['fw_transmission_repair', 'fw_clutch_replacement'], { severity: 'high' }),
  P('fw_transmission_noise', 'Transmission noise', 'fw_transmission',
    ['fw_transmission_repair'], { requiresDiagnosis: true }),
  P('fw_transmission_leak', 'Transmission fluid leak', 'fw_transmission',
    ['fw_transmission_repair'], { severity: 'high' }),
  P('fw_auto_transmission_issue', 'Automatic transmission problem', 'fw_transmission',
    ['fw_obd_scan', 'fw_transmission_repair'], { requiresDiagnosis: true }),
  P('fw_clutch_slipping', 'Clutch slipping', 'fw_clutch', ['fw_clutch_replacement'], { appliesToFuelTypes: ICE }),
  P('fw_clutch_hard', 'Clutch pedal hard', 'fw_clutch', ['fw_clutch_hydraulic_repair', 'fw_clutch_replacement'],
    { appliesToFuelTypes: ICE }),
  P('fw_clutch_noise', 'Clutch noise', 'fw_clutch', ['fw_clutch_replacement'], { appliesToFuelTypes: ICE }),

  /* ── Brakes ─────────────────────────────────────────────────────────── */
  P('fw_brake_noise', 'Brake noise', 'fw_brakes', ['fw_brake_pad_replacement', 'fw_brake_service'], { isPopular: true }),
  P('fw_brake_soft', 'Brake pedal soft or sinking', 'fw_brakes',
    ['fw_brake_bleeding', 'fw_brake_fluid_change'], { severity: 'high' }),
  P('fw_brake_hard', 'Brake pedal hard', 'fw_brakes', ['fw_brake_service', 'fw_brake_booster_repair'], { severity: 'high' }),
  P('fw_brake_judder', 'Vibration when braking', 'fw_brakes', ['fw_brake_disc_replacement']),
  P('fw_brake_pad_req', 'Brake pad replacement', 'fw_brakes', ['fw_brake_pad_replacement'], { isPopular: true }),
  P('fw_brake_fluid_leak', 'Brake fluid leak', 'fw_brakes',
    ['fw_brake_service'], { severity: 'critical', requiresDiagnosis: true }),
  P('fw_abs_warning', 'ABS warning light', 'fw_brakes', ['fw_obd_scan'], { severity: 'high', requiresDiagnosis: true }),
  P('fw_parking_brake_issue', 'Parking brake problem', 'fw_brakes', ['fw_brake_service']),

  /* ── Steering & suspension ──────────────────────────────────────────── */
  P('fw_steering_hard', 'Steering feels hard', 'fw_steering', ['fw_power_steering_repair'], { severity: 'high' }),
  P('fw_steering_noise', 'Steering noise', 'fw_steering', ['fw_power_steering_repair', 'fw_suspension_repair']),
  P('fw_steering_vibration', 'Steering vibration', 'fw_steering', ['fw_wheel_balancing', 'fw_wheel_alignment']),
  P('fw_pulling_to_side', 'Car pulls to one side', 'fw_steering',
    ['fw_wheel_alignment', 'fw_suspension_repair'], { isPopular: true }),
  P('fw_steering_fluid_leak', 'Power steering fluid leak', 'fw_steering', ['fw_power_steering_repair'], { severity: 'high' }),
  P('fw_suspension_noise', 'Suspension noise over bumps', 'fw_suspension',
    ['fw_suspension_repair', 'fw_shock_absorber_replacement'], { isPopular: true }),
  P('fw_shock_leak', 'Shock absorber leaking', 'fw_suspension', ['fw_shock_absorber_replacement']),
  P('fw_uneven_height', 'Car sits unevenly', 'fw_suspension', ['fw_suspension_repair']),
  P('fw_bumpy_ride', 'Ride feels bumpy or bouncy', 'fw_suspension',
    ['fw_shock_absorber_replacement', 'fw_suspension_repair']),

  /* ── Tyres & wheels ─────────────────────────────────────────────────── */
  P('fw_slow_puncture', 'Slow puncture', 'fw_tyres_wheels', ['fw_puncture_repair']),
  P('fw_tyre_wear', 'Uneven tyre wear', 'fw_tyres_wheels', ['fw_wheel_alignment', 'fw_tyre_replacement']),
  P('fw_tyre_replacement_req', 'Tyre replacement', 'fw_tyres_wheels', ['fw_tyre_replacement'], { isPopular: true }),
  P('fw_alignment_req', 'Wheel alignment', 'fw_tyres_wheels', ['fw_wheel_alignment'], { isPopular: true }),
  P('fw_balancing_req', 'Wheel balancing', 'fw_tyres_wheels', ['fw_wheel_balancing'] ),
  P('fw_wheel_bearing_noise', 'Wheel bearing noise', 'fw_tyres_wheels', ['fw_wheel_bearing_replacement']),
  P('fw_rim_damage', 'Rim damage', 'fw_tyres_wheels', ['fw_rim_repair']),
  P('fw_tpms_warning', 'Tyre pressure warning', 'fw_tyres_wheels', ['fw_tpms_service']),

  /* ── AC & climate — the §24 worked example ──────────────────────────── */
  P('fw_ac_not_cooling', 'AC not cooling', 'fw_ac',
    // FIVE candidates on purpose. "Not cooling" is a symptom, and jumping
    // straight to a gas refill is how the same fault is paid for twice.
    ['fw_ac_diagnosis', 'fw_ac_gas_refill', 'fw_ac_compressor_repair', 'fw_ac_condenser_repair', 'fw_ac_electrical_repair'],
    { isPopular: true }),
  P('fw_ac_weak_cooling', 'AC cooling is weak', 'fw_ac',
    ['fw_ac_diagnosis', 'fw_ac_gas_refill', 'fw_cabin_filter_replacement'], { isPopular: true }),
  P('fw_ac_intermittent', 'AC cools sometimes', 'fw_ac', ['fw_ac_diagnosis', 'fw_ac_electrical_repair']),
  P('fw_ac_compressor_noise', 'AC compressor noise', 'fw_ac', ['fw_ac_compressor_repair']),
  P('fw_ac_smell', 'Bad smell from AC', 'fw_ac', ['fw_cabin_filter_replacement', 'fw_ac_service']),
  P('fw_blower_not_working', 'Blower not working', 'fw_ac', ['fw_ac_blower_repair']),
  P('fw_blower_noise', 'Blower noise', 'fw_ac', ['fw_ac_blower_repair']),
  P('fw_ac_water_leak', 'Water leaking into the cabin', 'fw_ac', ['fw_ac_service']),
  P('fw_cabin_filter_req', 'Cabin filter replacement', 'fw_ac', ['fw_cabin_filter_replacement']),
  P('fw_heater_issue', 'Heater not working', 'fw_ac', ['fw_ac_service'], { appliesToFuelTypes: ICE }),
  P('fw_defogger_issue', 'Defogger not working', 'fw_ac', ['fw_ac_electrical_repair']),

  /* ── Cooling ────────────────────────────────────────────────────────── */
  P('fw_coolant_leak', 'Coolant leak', 'fw_cooling', ['fw_coolant_service', 'fw_radiator_repair'], { severity: 'high' }),
  P('fw_radiator_issue', 'Radiator problem', 'fw_cooling', ['fw_radiator_repair']),
  P('fw_radiator_fan_issue', 'Radiator fan not working', 'fw_cooling', ['fw_radiator_fan_replacement'], { severity: 'high' }),
  P('fw_water_pump_issue', 'Water pump problem', 'fw_cooling', ['fw_water_pump_replacement'], { appliesToFuelTypes: ICE }),
  P('fw_thermostat_issue', 'Thermostat problem', 'fw_cooling', ['fw_thermostat_replacement'], { appliesToFuelTypes: ICE }),
  P('fw_coolant_change_req', 'Coolant replacement', 'fw_cooling', ['fw_coolant_service']),

  /* ── Exhaust & emissions — combustion only ──────────────────────────── */
  P('fw_exhaust_noise', 'Exhaust noise', 'fw_exhaust', ['fw_exhaust_repair'], { appliesToFuelTypes: ICE }),
  P('fw_exhaust_leak', 'Exhaust leak', 'fw_exhaust', ['fw_exhaust_repair'], { appliesToFuelTypes: ICE }),
  P('fw_silencer_damage', 'Silencer damage', 'fw_exhaust', ['fw_exhaust_repair'], { appliesToFuelTypes: ICE }),
  P('fw_emission_warning', 'Emission warning light', 'fw_exhaust', ['fw_obd_scan'],
    { appliesToFuelTypes: ICE, requiresDiagnosis: true }),
  P('fw_dpf_issue', 'DPF warning', 'fw_exhaust', ['fw_dpf_service'],
    { appliesToFuelTypes: [DIESEL], requiresDiagnosis: true }),

  /* ── Lights, body, glass, doors, interior ───────────────────────────── */
  P('fw_headlight_issue', 'Headlight not working', 'fw_lights', ['fw_light_repair'], { isPopular: true }),
  P('fw_tail_light_issue', 'Tail or brake light not working', 'fw_lights', ['fw_light_repair'], { severity: 'high' }),
  P('fw_indicator_issue', 'Indicator not working', 'fw_lights', ['fw_light_repair']),
  P('fw_fog_light_issue', 'Fog light not working', 'fw_lights', ['fw_light_repair']),
  P('fw_reverse_light_issue', 'Reverse light not working', 'fw_lights', ['fw_light_repair']),
  P('fw_dent', 'Dent', 'fw_body', ['fw_dent_removal', 'fw_panel_repair'], { isPopular: true }),
  P('fw_scratch', 'Scratch', 'fw_body', ['fw_scratch_repair', 'fw_painting'], { isPopular: true }),
  P('fw_bumper_damage', 'Bumper damage', 'fw_body', ['fw_bumper_repair', 'fw_panel_repair']),
  P('fw_panel_damage', 'Body panel damage', 'fw_body', ['fw_panel_repair', 'fw_painting']),
  P('fw_paint_damage', 'Paint damage', 'fw_body', ['fw_painting']),
  P('fw_rust', 'Rust or corrosion', 'fw_body', ['fw_rust_treatment']),
  P('fw_mirror_damage', 'Mirror damage', 'fw_body', ['fw_mirror_replacement']),
  P('fw_windshield_crack', 'Windshield crack', 'fw_glass', ['fw_windshield_repair', 'fw_windshield_replacement'],
    { severity: 'high', isPopular: true }),
  P('fw_glass_broken', 'Side or rear glass broken', 'fw_glass', ['fw_glass_replacement'], { severity: 'high' }),
  P('fw_power_window_issue', 'Power window not working', 'fw_glass', ['fw_power_window_repair'], { isPopular: true }),
  P('fw_sunroof_issue', 'Sunroof problem', 'fw_glass', ['fw_sunroof_repair']),
  P('fw_door_not_closing', 'Door not opening or closing', 'fw_doors_locks', ['fw_door_repair']),
  P('fw_central_locking_issue', 'Central locking problem', 'fw_doors_locks', ['fw_lock_service']),
  P('fw_door_handle_issue', 'Door handle broken', 'fw_doors_locks', ['fw_door_repair']),
  P('fw_boot_lock_issue', 'Boot will not open', 'fw_doors_locks', ['fw_lock_service']),
  P('fw_keyless_entry_issue', 'Keyless entry not working', 'fw_doors_locks', ['fw_key_programming']),
  P('fw_seat_damage', 'Seat damage', 'fw_interior', ['fw_interior_repair']),
  P('fw_seatbelt_issue', 'Seat belt problem', 'fw_interior', ['fw_interior_repair'], { severity: 'high' }),
  P('fw_cabin_noise', 'Rattle or noise from the cabin', 'fw_interior', ['fw_interior_repair']),
  P('fw_interior_trim_damage', 'Interior trim damage', 'fw_interior', ['fw_interior_repair']),

  /* ── Infotainment & ADAS ────────────────────────────────────────────── */
  P('fw_infotainment_dead', 'Infotainment not working', 'fw_infotainment', ['fw_infotainment_repair']),
  P('fw_touchscreen_issue', 'Touchscreen problem', 'fw_infotainment', ['fw_infotainment_repair']),
  P('fw_bluetooth_issue', 'Bluetooth not connecting', 'fw_infotainment', ['fw_infotainment_software_service']),
  P('fw_carplay_issue', 'Android Auto / CarPlay not working', 'fw_infotainment', ['fw_infotainment_software_service']),
  P('fw_speaker_issue', 'Speaker problem', 'fw_infotainment', ['fw_infotainment_repair']),
  P('fw_reverse_camera_issue', 'Reverse camera not working', 'fw_infotainment', ['fw_camera_repair'], { isPopular: true }),
  // ADAS names a SYSTEM, never a failed part — always inspected first.
  P('fw_adas_warning', 'ADAS warning', 'fw_adas', ['fw_adas_calibration', 'fw_obd_scan'],
    { severity: 'high', requiresDiagnosis: true }),
  P('fw_parking_sensor_issue', 'Parking sensor not working', 'fw_adas', ['fw_parking_sensor_repair']),
  P('fw_360_camera_issue', '360 camera problem', 'fw_adas', ['fw_camera_repair', 'fw_adas_calibration']),
  P('fw_lane_assist_issue', 'Lane assist warning', 'fw_adas', ['fw_adas_calibration'], { requiresDiagnosis: true }),
  P('fw_cruise_control_issue', 'Adaptive cruise problem', 'fw_adas', ['fw_adas_calibration'], { requiresDiagnosis: true }),
  P('fw_blind_spot_issue', 'Blind-spot warning problem', 'fw_adas', ['fw_adas_calibration'], { requiresDiagnosis: true }),

  /* ── Warning lights & diagnostics ───────────────────────────────────── */
  P('fw_check_engine_light', 'Check-engine light', 'fw_diagnostics', ['fw_obd_scan'],
    { appliesToFuelTypes: ICE, severity: 'high', requiresDiagnosis: true, isPopular: true }),
  P('fw_unknown_warning_light', 'A warning light I do not recognise', 'fw_diagnostics', ['fw_obd_scan'],
    { requiresDiagnosis: true, isPopular: true }),
  P('fw_obd_scan_req', 'Computer / OBD scan', 'fw_diagnostics', ['fw_obd_scan']),
  P('fw_ecu_issue', 'ECU problem', 'fw_diagnostics', ['fw_obd_scan', 'fw_ecu_service'], { requiresDiagnosis: true }),

  /* ── Safety & accident ──────────────────────────────────────────────── */
  // Never an ordinary doorstep job — the car may not be safe to drive at all.
  P('fw_accident_damage', 'Accident damage', 'fw_safety', ['fw_accident_inspection', 'fw_towing'],
    { severity: 'critical', requiresDiagnosis: true }),
  P('fw_airbag_warning', 'Airbag warning light', 'fw_safety', ['fw_obd_scan', 'fw_airbag_service'],
    { severity: 'critical', requiresDiagnosis: true }),
  P('fw_airbag_deployed', 'Airbag has deployed', 'fw_safety', ['fw_accident_inspection'],
    { severity: 'critical', requiresDiagnosis: true }),
  P('fw_esc_warning', 'Traction or stability control warning', 'fw_safety', ['fw_obd_scan'],
    { severity: 'high', requiresDiagnosis: true }),
  P('fw_vehicle_immobilised', 'Car cannot be moved', 'fw_safety', ['fw_towing'], { severity: 'high' }),

  /* ── Maintenance ────────────────────────────────────────────────────── */
  P('fw_periodic_service_req', 'Periodic service', 'fw_maintenance', ['fw_periodic_service'], { isPopular: true }),
  P('fw_oil_change_req', 'Engine oil change', 'fw_maintenance', ['fw_oil_change'],
    { appliesToFuelTypes: ICE, isPopular: true }),
  P('fw_air_filter_req', 'Air filter replacement', 'fw_maintenance', ['fw_air_filter_replacement'], { appliesToFuelTypes: ICE }),
  P('fw_ac_service_req', 'AC service', 'fw_maintenance', ['fw_ac_service'], { isPopular: true }),
  P('fw_brake_service_req', 'Brake service', 'fw_maintenance', ['fw_brake_service'] ),
  P('fw_transmission_oil_req', 'Transmission oil change', 'fw_maintenance', ['fw_transmission_oil_change']),
  P('fw_inspection_req', 'Multi-point inspection', 'fw_maintenance', ['fw_multipoint_inspection'], { isPopular: true }),
  P('fw_pre_trip_check', 'Pre-trip check', 'fw_maintenance', ['fw_multipoint_inspection']),
  P('fw_car_wash_req', 'Wash & detailing', 'fw_maintenance', ['fw_car_wash']),

  /* ── EV battery ─────────────────────────────────────────────────────── *
   * The last five are safety incidents, not repairs — same rule as the
   * two-wheeler vertical, for the same physics.                             */
  P('fw_ev_not_charging', 'Not charging', 'fw_ev_battery',
    ['fw_ev_battery_diagnostic', 'fw_ev_charger_repair'], { appliesToFuelTypes: ELECTRIFIED, isPopular: true }),
  P('fw_ev_reduced_range', 'Range much lower than before', 'fw_ev_battery',
    ['fw_ev_battery_diagnostic'], { appliesToFuelTypes: ELECTRIFIED, isPopular: true }),
  P('fw_ev_percentage_wrong', 'Charge percentage is wrong', 'fw_ev_battery',
    ['fw_ev_battery_diagnostic', 'fw_ev_bms_service'], { appliesToFuelTypes: ELECTRIFIED }),
  P('fw_ev_battery_warning', 'Battery warning light', 'fw_ev_battery',
    ['fw_ev_battery_diagnostic'], { appliesToFuelTypes: ELECTRIFIED, severity: 'high', requiresDiagnosis: true }),
  P('fw_ev_hv_warning', 'High-voltage system warning', 'fw_ev_battery',
    ['fw_ev_safety_inspection'], { appliesToFuelTypes: ELECTRIFIED, severity: 'critical', requiresDiagnosis: true }),
  P('fw_ev_battery_overheating', 'Battery overheating', 'fw_ev_battery',
    ['fw_ev_safety_inspection'], { appliesToFuelTypes: ELECTRIFIED, severity: 'critical', requiresDiagnosis: true }),
  P('fw_ev_battery_smoke', 'Smoke or burning smell', 'fw_ev_battery',
    ['fw_ev_safety_inspection'], { appliesToFuelTypes: ELECTRIFIED, severity: 'critical', requiresDiagnosis: true }),
  P('fw_ev_battery_damage', 'Battery damaged after a crash', 'fw_ev_battery',
    ['fw_ev_safety_inspection'], { appliesToFuelTypes: ELECTRIFIED, severity: 'critical', requiresDiagnosis: true }),

  /* ── EV charging & drive ────────────────────────────────────────────── */
  P('fw_ev_slow_charging', 'Charging very slowly', 'fw_ev_charging',
    ['fw_ev_battery_diagnostic', 'fw_ev_charger_repair'], { appliesToFuelTypes: BEV }),
  P('fw_ev_charging_stops', 'Charging stops partway', 'fw_ev_charging',
    ['fw_ev_bms_service', 'fw_ev_charger_repair'], { appliesToFuelTypes: BEV }),
  P('fw_ev_port_issue', 'Charging port problem', 'fw_ev_charging',
    ['fw_ev_charging_port_repair'], { appliesToFuelTypes: BEV }),
  P('fw_ev_cable_issue', 'Charging cable problem', 'fw_ev_charging',
    ['fw_ev_charger_repair'], { appliesToFuelTypes: BEV }),
  P('fw_ev_wont_accept_charge', 'Car will not accept charge', 'fw_ev_charging',
    ['fw_ev_charging_port_repair', 'fw_ev_bms_service'], { appliesToFuelTypes: BEV, severity: 'high' }),
  P('fw_ev_motor_noise', 'Motor noise', 'fw_ev_motor', ['fw_ev_motor_diagnostic'], { appliesToFuelTypes: ELECTRIFIED }),
  P('fw_ev_power_cutoff', 'Power cuts out while driving', 'fw_ev_motor',
    ['fw_ev_controller_repair', 'fw_ev_motor_diagnostic'],
    { appliesToFuelTypes: ELECTRIFIED, severity: 'critical', requiresDiagnosis: true }),
  P('fw_ev_low_power', 'Reduced power', 'fw_ev_motor',
    ['fw_ev_motor_diagnostic', 'fw_ev_controller_repair'], { appliesToFuelTypes: ELECTRIFIED }),
  P('fw_ev_regen_issue', 'Regenerative braking not working', 'fw_ev_motor',
    ['fw_ev_diagnostic_scan'], { appliesToFuelTypes: ELECTRIFIED }),
];

/* ─── Repairs (§49) ────────────────────────────────────────────────────── */

const D = 'doorstep', W = 'workshop', PU = 'pickup_repair', R = 'remote_support', RS = 'roadside';

/**
 * Service modes are an operational claim, not a formality (§47).
 *
 * A puncture is roadside work; an engine rebuild needs a bay and a hoist and
 * offering it at the kerbside is a promise broken on arrival. Alignment needs a
 * rig, so it is workshop-only. High-voltage and CNG work is workshop-only for
 * safety. Nothing here is priced — `fixed` means "one firm number per grade",
 * set by the provider, not by Zappy (§66).
 */
const REPAIRS = [
  /* ── Roadside ──────────────────────────────────────────────────────── */
  { code: 'fw_jump_start', name: 'Jump Start', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D], durationMin: 20, warrantyDays: 0 },
  { code: 'fw_puncture_repair', name: 'Puncture Repair', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 30, warrantyDays: 30 },
  { code: 'fw_spare_wheel_fitment', name: 'Spare Wheel Fitment', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D], durationMin: 25, warrantyDays: 0 },
  { code: 'fw_fuel_delivery', name: 'Fuel Delivery', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS], durationMin: 30, warrantyDays: 0 },
  { code: 'fw_roadside_minor_repair', name: 'Minor Roadside Repair', pricingMode: 'diagnosis_required', minSkillLevel: 2, modes: [RS, D], durationMin: 45, warrantyDays: 30 },
  { code: 'fw_towing', name: 'Towing / Recovery', pricingMode: 'diagnosis_required', minSkillLevel: 1, modes: [RS], durationMin: 90, warrantyDays: 0 },
  { code: 'fw_lock_service', name: 'Lock & Key Service', pricingMode: 'diagnosis_required', minSkillLevel: 2, modes: [RS, D, W], durationMin: 60, warrantyDays: 30 },
  { code: 'fw_ev_charge_assist', name: 'EV Charging Assistance', pricingMode: 'fixed', minSkillLevel: 2, modes: [RS], durationMin: 60, warrantyDays: 0 },

  /* ── Starting, engine & electrical ─────────────────────────────────── */
  { code: 'fw_battery_replacement', name: 'Battery Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 30, warrantyDays: 365, component: 'fw_battery' },
  { code: 'fw_starter_repair', name: 'Starter Motor Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [D, W, PU], durationMin: 150, warrantyDays: 90 },
  { code: 'fw_alternator_repair', name: 'Alternator Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 180, warrantyDays: 90 },
  { code: 'fw_ignition_switch_replacement', name: 'Ignition Switch Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 120, warrantyDays: 180, component: 'fw_ignition_switch' },
  { code: 'fw_key_programming', name: 'Key Programming', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W], durationMin: 60, warrantyDays: 90 },
  { code: 'fw_spark_plug_replacement', name: 'Spark Plug Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 60, warrantyDays: 180, component: 'fw_spark_plug' },
  { code: 'fw_ignition_coil_replacement', name: 'Ignition Coil Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W], durationMin: 75, warrantyDays: 180, component: 'fw_ignition_coil' },
  { code: 'fw_throttle_body_cleaning', name: 'Throttle Body Cleaning', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 60, warrantyDays: 30 },
  { code: 'fw_engine_repair', name: 'Engine Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 960, warrantyDays: 180 },
  { code: 'fw_oil_leak_repair', name: 'Oil Leak Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 180, warrantyDays: 90 },
  { code: 'fw_fuse_relay_replacement', name: 'Fuse & Relay Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 30, warrantyDays: 90, component: 'fw_fuse' },
  { code: 'fw_electrical_diagnosis', name: 'Electrical Fault Diagnosis', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [D, W, PU], durationMin: 120, warrantyDays: 30 },

  /* ── Fuel & CNG ────────────────────────────────────────────────────── */
  { code: 'fw_fuel_pump_replacement', name: 'Fuel Pump Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 180, warrantyDays: 180, component: 'fw_fuel_pump' },
  { code: 'fw_fuel_injector_service', name: 'Fuel Injector Service', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 150, warrantyDays: 90 },
  { code: 'fw_fuel_filter_replacement', name: 'Fuel Filter Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 45, warrantyDays: 90, component: 'fw_fuel_filter' },
  { code: 'fw_fuel_line_repair', name: 'Fuel Line Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 180, warrantyDays: 90 },
  { code: 'fw_fuel_system_flush', name: 'Fuel System Flush', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 240, warrantyDays: 30 },
  { code: 'fw_cng_system_service', name: 'CNG System Service', pricingMode: 'fixed', minSkillLevel: 4, modes: [W, PU], durationMin: 150, warrantyDays: 90 },
  { code: 'fw_cng_regulator_repair', name: 'CNG Regulator Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 180, warrantyDays: 90, component: 'fw_cng_regulator' },
  { code: 'fw_cng_injector_service', name: 'CNG Injector Service', pricingMode: 'fixed', minSkillLevel: 4, modes: [W, PU], durationMin: 150, warrantyDays: 90 },
  { code: 'fw_cng_safety_inspection', name: 'CNG Safety Inspection', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W], durationMin: 90, warrantyDays: 0 },

  /* ── Transmission, clutch, brakes ──────────────────────────────────── */
  { code: 'fw_transmission_repair', name: 'Transmission Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 960, warrantyDays: 180 },
  { code: 'fw_transmission_oil_change', name: 'Transmission Oil Change', pricingMode: 'fixed', minSkillLevel: 2, modes: [W, PU], durationMin: 90, warrantyDays: 0, component: 'fw_transmission_oil' },
  { code: 'fw_clutch_replacement', name: 'Clutch Replacement', pricingMode: 'fixed', minSkillLevel: 4, modes: [W, PU], durationMin: 480, warrantyDays: 180, component: 'fw_clutch_kit' },
  { code: 'fw_clutch_hydraulic_repair', name: 'Clutch Hydraulic Repair', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 150, warrantyDays: 90 },
  { code: 'fw_brake_pad_replacement', name: 'Brake Pad Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 75, warrantyDays: 180, component: 'fw_brake_pad' },
  { code: 'fw_brake_disc_replacement', name: 'Brake Disc Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 150, warrantyDays: 180, component: 'fw_brake_disc' },
  { code: 'fw_brake_fluid_change', name: 'Brake Fluid Change', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 60, warrantyDays: 0, component: 'fw_brake_fluid' },
  { code: 'fw_brake_bleeding', name: 'Brake Bleeding', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 60, warrantyDays: 30 },
  { code: 'fw_brake_booster_repair', name: 'Brake Booster Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 240, warrantyDays: 90 },
  { code: 'fw_brake_service', name: 'Brake Service', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 120, warrantyDays: 90 },

  /* ── Steering, suspension, wheels ──────────────────────────────────── */
  { code: 'fw_power_steering_repair', name: 'Power Steering Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 240, warrantyDays: 90 },
  { code: 'fw_suspension_repair', name: 'Suspension Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 240, warrantyDays: 90 },
  { code: 'fw_shock_absorber_replacement', name: 'Shock Absorber Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 180, warrantyDays: 180, component: 'fw_shock_absorber' },
  // Both need a rig bolted to a workshop floor — never a doorstep job.
  { code: 'fw_wheel_alignment', name: 'Wheel Alignment', pricingMode: 'fixed', minSkillLevel: 2, modes: [W], durationMin: 60, warrantyDays: 30 },
  { code: 'fw_wheel_balancing', name: 'Wheel Balancing', pricingMode: 'fixed', minSkillLevel: 2, modes: [W], durationMin: 60, warrantyDays: 30 },
  { code: 'fw_tyre_replacement', name: 'Tyre Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 60, warrantyDays: 0, component: 'fw_tyre' },
  { code: 'fw_wheel_bearing_replacement', name: 'Wheel Bearing Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 180, warrantyDays: 180, component: 'fw_wheel_bearing' },
  { code: 'fw_rim_repair', name: 'Rim Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 150, warrantyDays: 30 },
  { code: 'fw_tpms_service', name: 'TPMS Service', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 45, warrantyDays: 90 },

  /* ── AC & cooling ──────────────────────────────────────────────────── */
  // The inspection that stops "not cooling" becoming an automatic gas refill.
  { code: 'fw_ac_diagnosis', name: 'AC Diagnosis', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W], durationMin: 60, warrantyDays: 0 },
  { code: 'fw_ac_gas_refill', name: 'AC Gas Refill', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 60, warrantyDays: 90, component: 'fw_ac_refrigerant' },
  { code: 'fw_ac_compressor_repair', name: 'AC Compressor Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 300, warrantyDays: 180, component: 'fw_ac_compressor' },
  { code: 'fw_ac_condenser_repair', name: 'AC Condenser Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 240, warrantyDays: 90, component: 'fw_ac_condenser' },
  { code: 'fw_ac_blower_repair', name: 'Blower Motor Repair', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W, PU], durationMin: 150, warrantyDays: 90, component: 'fw_ac_blower' },
  { code: 'fw_ac_electrical_repair', name: 'AC Electrical Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [D, W, PU], durationMin: 150, warrantyDays: 90 },
  { code: 'fw_cabin_filter_replacement', name: 'Cabin Filter Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W], durationMin: 30, warrantyDays: 0, component: 'fw_cabin_filter' },
  { code: 'fw_ac_service', name: 'AC Service', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 120, warrantyDays: 90 },
  { code: 'fw_coolant_service', name: 'Coolant Service', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 75, warrantyDays: 90, component: 'fw_coolant' },
  { code: 'fw_radiator_repair', name: 'Radiator Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 240, warrantyDays: 90 },
  { code: 'fw_radiator_fan_replacement', name: 'Radiator Fan Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 150, warrantyDays: 180, component: 'fw_radiator_fan' },
  { code: 'fw_water_pump_replacement', name: 'Water Pump Replacement', pricingMode: 'fixed', minSkillLevel: 4, modes: [W, PU], durationMin: 300, warrantyDays: 180, component: 'fw_water_pump' },
  { code: 'fw_thermostat_replacement', name: 'Thermostat Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 120, warrantyDays: 180, component: 'fw_thermostat' },

  /* ── Exhaust, lights, body, glass, interior ────────────────────────── */
  { code: 'fw_exhaust_repair', name: 'Exhaust Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 180, warrantyDays: 90 },
  { code: 'fw_dpf_service', name: 'DPF Service', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 240, warrantyDays: 90 },
  { code: 'fw_light_repair', name: 'Light Repair', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 40, warrantyDays: 90, component: 'fw_bulb' },
  { code: 'fw_dent_removal', name: 'Dent Removal', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 120, warrantyDays: 90 },
  { code: 'fw_scratch_repair', name: 'Scratch Repair', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 120, warrantyDays: 90 },
  { code: 'fw_panel_repair', name: 'Panel Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 480, warrantyDays: 180, component: 'fw_body_panel' },
  { code: 'fw_bumper_repair', name: 'Bumper Repair', pricingMode: 'fixed', minSkillLevel: 2, modes: [W, PU], durationMin: 240, warrantyDays: 90, component: 'fw_bumper' },
  { code: 'fw_painting', name: 'Painting', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 960, warrantyDays: 365 },
  { code: 'fw_rust_treatment', name: 'Rust Treatment', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 480, warrantyDays: 180 },
  { code: 'fw_mirror_replacement', name: 'Mirror Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 45, warrantyDays: 90, component: 'fw_mirror' },
  { code: 'fw_windshield_repair', name: 'Windshield Chip Repair', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 60, warrantyDays: 90 },
  { code: 'fw_windshield_replacement', name: 'Windshield Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W, PU], durationMin: 180, warrantyDays: 365, component: 'fw_windshield' },
  { code: 'fw_glass_replacement', name: 'Glass Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W, PU], durationMin: 150, warrantyDays: 180, component: 'fw_glass' },
  { code: 'fw_power_window_repair', name: 'Power Window Repair', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W, PU], durationMin: 150, warrantyDays: 90, component: 'fw_window_regulator' },
  { code: 'fw_sunroof_repair', name: 'Sunroof Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 300, warrantyDays: 90 },
  { code: 'fw_door_repair', name: 'Door Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 180, warrantyDays: 90 },
  { code: 'fw_interior_repair', name: 'Interior Repair', pricingMode: 'diagnosis_required', minSkillLevel: 2, modes: [D, W, PU], durationMin: 180, warrantyDays: 90 },

  /* ── Electronics, diagnostics, ADAS ────────────────────────────────── */
  { code: 'fw_obd_scan', name: 'OBD / Computer Scan', pricingMode: 'fixed', minSkillLevel: 3, modes: [RS, D, W], durationMin: 45, warrantyDays: 0 },
  { code: 'fw_ecu_service', name: 'ECU Service', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 240, warrantyDays: 90 },
  { code: 'fw_infotainment_repair', name: 'Infotainment Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [D, W, PU], durationMin: 150, warrantyDays: 90 },
  { code: 'fw_infotainment_software_service', name: 'Infotainment Software Service', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, R], durationMin: 60, warrantyDays: 30 },
  { code: 'fw_camera_repair', name: 'Camera Repair', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W, PU], durationMin: 120, warrantyDays: 90, component: 'fw_camera' },
  { code: 'fw_parking_sensor_repair', name: 'Parking Sensor Repair', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W, PU], durationMin: 120, warrantyDays: 90, component: 'fw_parking_sensor' },
  // Needs a calibrated target rig on a level floor — never doorstep.
  { code: 'fw_adas_calibration', name: 'ADAS Calibration', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W], durationMin: 180, warrantyDays: 90 },
  { code: 'fw_airbag_service', name: 'Airbag System Service', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 240, warrantyDays: 180 },
  { code: 'fw_accident_inspection', name: 'Accident Damage Inspection', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 120, warrantyDays: 0 },

  /* ── Maintenance ───────────────────────────────────────────────────── */
  { code: 'fw_periodic_service', name: 'Periodic Service', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 240, warrantyDays: 30 },
  { code: 'fw_oil_change', name: 'Engine Oil Change', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W], durationMin: 60, warrantyDays: 0, component: 'fw_engine_oil' },
  { code: 'fw_air_filter_replacement', name: 'Air Filter Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W], durationMin: 30, warrantyDays: 0, component: 'fw_air_filter' },
  { code: 'fw_multipoint_inspection', name: 'Multi-Point Inspection', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 90, warrantyDays: 0 },
  { code: 'fw_car_wash', name: 'Wash & Detailing', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W], durationMin: 120, warrantyDays: 0 },

  /* ── EV ────────────────────────────────────────────────────────────── *
   * High-voltage work is workshop-bound without exception. A traction pack is
   * heavy, live at several hundred volts, and dangerous to open at a kerbside.
   * `fw_ev_safety_inspection` exists so a suspected thermal or crash fault has
   * somewhere to go that is NOT an ordinary repair booking.                  */
  { code: 'fw_ev_battery_diagnostic', name: 'EV Battery Diagnostic', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W], durationMin: 90, warrantyDays: 0 },
  { code: 'fw_ev_bms_service', name: 'Battery Management System Service', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 240, warrantyDays: 90 },
  { code: 'fw_ev_safety_inspection', name: 'EV High-Voltage Safety Inspection', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W], durationMin: 120, warrantyDays: 0 },
  { code: 'fw_ev_charger_repair', name: 'EV Charger Repair', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W, PU], durationMin: 120, warrantyDays: 180, component: 'fw_ev_charger' },
  { code: 'fw_ev_charging_port_repair', name: 'Charging Port Repair', pricingMode: 'fixed', minSkillLevel: 4, modes: [W, PU], durationMin: 180, warrantyDays: 90, component: 'fw_ev_charging_port' },
  { code: 'fw_ev_motor_diagnostic', name: 'EV Motor Diagnostic', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W], durationMin: 90, warrantyDays: 0 },
  { code: 'fw_ev_controller_repair', name: 'EV Controller Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 300, warrantyDays: 90 },
  { code: 'fw_ev_diagnostic_scan', name: 'EV Diagnostic Scan', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W], durationMin: 60, warrantyDays: 0 },
];

/* ─── Skill levels (§52) ───────────────────────────────────────────────── */

const SKILL_LEVELS = [
  { level: 1, name: 'Roadside', description: 'Jump start, puncture, bulbs, fluids, spare wheel', requiresVerification: false },
  { level: 2, name: 'Service', description: 'Periodic service, brakes, filters, tyres, routine replacement', requiresVerification: false },
  { level: 3, name: 'Advanced', description: 'OBD diagnostics, AC, suspension, electrical, starter and alternator', requiresVerification: true },
  {
    level: 4,
    name: 'Specialist',
    /*
     * Level 4 is the gate for FOUR distinct hazards, and a provider must be
     * verified before any of them reaches them (§41, §17, §33): engine and
     * transmission internals, high-voltage EV work, CNG/LPG pressure systems,
     * and ADAS calibration — where a miscalibrated camera makes a car brake
     * for something that is not there.
     */
    description: 'Engine and transmission internals, EV high-voltage, CNG/LPG systems, ADAS calibration, airbags',
    requiresVerification: true,
  },
];

/* ─── QA checklists (§68) ──────────────────────────────────────────────── */

const QA_CHECKLISTS = [
  {
    code: 'fw_standard', name: 'Car Standard QA', stage: 'after', repairCodes: [],
    items: [
      { code: 'starts', label: 'Starts and idles correctly', required: true },
      { code: 'no_warnings', label: 'No warning lights on the dashboard', required: true },
      { code: 'brakes', label: 'Brakes tested and effective', required: true },
      { code: 'lights', label: 'All exterior lights work', required: true },
      { code: 'no_leaks', label: 'No oil, coolant, fuel or brake fluid leaks', required: true },
      { code: 'test_drive', label: 'Road test completed', required: true },
      { code: 'fluids', label: 'Fluid levels topped and correct', required: true },
      { code: 'fasteners', label: 'All fasteners torqued, wheel nuts checked', required: true },
      { code: 'no_new_damage', label: 'No new cosmetic damage', required: true },
      { code: 'clean', label: 'Interior left clean, seat covers removed', required: false },
    ],
  },
  {
    code: 'fw_ac', name: 'AC QA', stage: 'after',
    repairCodes: ['fw_ac_gas_refill', 'fw_ac_compressor_repair', 'fw_ac_condenser_repair', 'fw_ac_blower_repair', 'fw_ac_service', 'fw_ac_electrical_repair'],
    items: [
      { code: 'vent_temp', label: 'Vent temperature measured and within spec', required: true },
      { code: 'compressor', label: 'Compressor engages and cycles correctly', required: true },
      { code: 'blower_speeds', label: 'All blower speeds work', required: true },
      { code: 'no_leak', label: 'System leak-tested, no loss of refrigerant', required: true },
      { code: 'controls', label: 'All climate controls respond', required: true },
      { code: 'drain', label: 'Condensate drains outside, not into the cabin', required: true },
    ],
  },
  {
    code: 'fw_brakes', name: 'Brake QA', stage: 'after',
    repairCodes: ['fw_brake_pad_replacement', 'fw_brake_disc_replacement', 'fw_brake_fluid_change', 'fw_brake_bleeding', 'fw_brake_service', 'fw_brake_booster_repair'],
    items: [
      { code: 'pedal_firm', label: 'Pedal firm, no travel to the floor', required: true },
      { code: 'even_braking', label: 'Car stops straight, no pulling', required: true },
      { code: 'no_noise', label: 'No squeal or grinding', required: true },
      { code: 'no_leak', label: 'No fluid leak at any caliper, hose or cylinder', required: true },
      { code: 'fluid_level', label: 'Fluid at the correct level', required: true },
      { code: 'no_abs_light', label: 'No ABS warning after the road test', required: true },
      { code: 'road_test', label: 'Braking tested from road speed', required: true },
    ],
  },
  {
    code: 'fw_ev_hv', name: 'EV High-Voltage QA', stage: 'after',
    repairCodes: ['fw_ev_bms_service', 'fw_ev_controller_repair', 'fw_ev_charging_port_repair', 'fw_ev_safety_inspection'],
    items: [
      { code: 'insulation', label: 'Insulation resistance measured and within spec', required: true },
      { code: 'connectors', label: 'All high-voltage connectors seated and locked', required: true },
      { code: 'interlock', label: 'Service disconnect and interlocks restored', required: true },
      { code: 'no_dtc', label: 'No high-voltage fault codes remaining', required: true },
      { code: 'charges', label: 'Accepts charge and reports correct state of charge', required: true },
      { code: 'thermal', label: 'Pack temperature normal after a charge cycle', required: true },
      { code: 'road_test', label: 'Road test completed with no power cut-outs', required: true },
    ],
  },
  {
    code: 'fw_cng', name: 'CNG QA', stage: 'after',
    repairCodes: ['fw_cng_system_service', 'fw_cng_regulator_repair', 'fw_cng_injector_service', 'fw_cng_safety_inspection'],
    items: [
      { code: 'leak_test', label: 'Full system leak test passed', required: true },
      { code: 'no_smell', label: 'No smell of gas in the cabin or engine bay', required: true },
      { code: 'switchover', label: 'Switches between petrol and CNG correctly', required: true },
      { code: 'pressure', label: 'Line pressure within spec', required: true },
      { code: 'mountings', label: 'Cylinder and bracket mountings secure', required: true },
      { code: 'road_test', label: 'Road test on CNG completed', required: true },
    ],
  },
  {
    code: 'fw_adas', name: 'ADAS QA', stage: 'after',
    repairCodes: ['fw_adas_calibration', 'fw_camera_repair', 'fw_parking_sensor_repair', 'fw_windshield_replacement'],
    items: [
      { code: 'calibrated', label: 'Calibration completed and confirmed by the tool', required: true },
      { code: 'no_dtc', label: 'No ADAS fault codes remaining', required: true },
      { code: 'camera_view', label: 'Camera image clear, correctly aligned', required: true },
      { code: 'sensors', label: 'All parking sensors respond at the correct distance', required: true },
      { code: 'road_test', label: 'Road test confirms lane and cruise behaviour', required: true },
    ],
  },
];

module.exports = {
  VERTICAL, BRANDS, PRODUCT_TYPES, FUEL_TYPES, PROBLEM_CATEGORIES, PROBLEMS,
  REPAIRS, SKILL_LEVELS, QA_CHECKLISTS, ALL_BODIES,
};
