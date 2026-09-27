/**
 * Two-wheeler vertical seed data.
 *
 * DEFAULT CONTENT, not application logic — admin can edit, archive or replace
 * any of it without a deploy (§1). The engine that consumes it is the same one
 * mobile and laptop use; only this file differs (§91). Adding this vertical
 * needed two lines of code: `two_wheeler` in the vertical registry and
 * `roadside` in the service-mode list. Everything below is data.
 *
 * Three things make two-wheelers genuinely different from a phone, and each is
 * handled as data rather than a code branch:
 *
 *   1. MOST DEMAND IS EMERGENCY. A dead phone is an inconvenience; a bike that
 *      will not start has left someone at the side of a road. Hence the
 *      `roadside` mode, and hence `severity: 'high'` on the strandings.
 *
 *   2. THE VEHICLE TYPE CHANGES THE PART, NOT JUST THE NAME. A scooter has a
 *      CVT and no chain; a motorcycle has a chain and no CVT; an EV has
 *      neither. So problems are scoped by `appliesToProductTypeCodes` and a customer on a
 *      scooter is never asked about chain slack.
 *
 *   3. EV BATTERY FAULTS CAN BE DANGEROUS. Swelling, smoke or a burning smell
 *      is not a repair booking — it is a safety incident. Those problems are
 *      marked `severity: 'critical'` and `requiresDiagnosis`, so they can never
 *      be auto-priced and dispatched to whoever is nearest.
 *
 * Deliberately absent: a fabricated model catalog and any invented prices (§90,
 * §66). Seeding "Activa 6G — ₹450 puncture" would be a number nobody verified
 * presented as Zappy's. Models arrive through admin entry; prices come from
 * providers.
 */

const VERTICAL = 'two_wheeler';

/* ─── Vehicle types (§4) ───────────────────────────────────────────────── */

/**
 * Shorthands used by `appliesToProductTypeCodes` below. A problem with no list applies to
 * every type — most do.
 */
const MC = 'motorcycle', SC = 'scooter', MO = 'moped';
const ES = 'electric_scooter', EM = 'electric_motorcycle';

/** Everything that runs on petrol — the chain, clutch and carburettor world. */
const PETROL = [MC, SC, MO];
/** Everything battery-driven — no engine, no gears, no chain. */
const ELECTRIC = [ES, EM];
/** Geared petrol bikes only: a scooter has no chain and no gear lever. */
const GEARED = [MC];
/** Scooters only: the CVT belt world. */
const CVT = [SC, MO];

const PRODUCT_TYPES = [
  { code: MC, name: 'Motorcycle', displayOrder: 1, isPopular: true },
  { code: SC, name: 'Scooter', displayOrder: 2, isPopular: true },
  { code: ES, name: 'Electric Scooter', displayOrder: 3, isPopular: true },
  { code: EM, name: 'Electric Motorcycle', displayOrder: 4 },
  { code: MO, name: 'Moped', displayOrder: 5 },
];

/* ─── Brands (§4) ──────────────────────────────────────────────────────── */

const BRANDS = [
  // Petrol — ordered by Indian market share, because that is the order a
  // customer scans the list in.
  { code: 'hero', name: 'Hero MotoCorp', sortOrder: 1 },
  { code: 'honda-2w', name: 'Honda', sortOrder: 2 },
  { code: 'tvs', name: 'TVS', sortOrder: 3 },
  { code: 'bajaj', name: 'Bajaj', sortOrder: 4 },
  { code: 'royal-enfield', name: 'Royal Enfield', sortOrder: 5 },
  { code: 'yamaha', name: 'Yamaha', sortOrder: 6 },
  { code: 'suzuki', name: 'Suzuki', sortOrder: 7 },
  { code: 'ktm', name: 'KTM', sortOrder: 8 },
  { code: 'jawa', name: 'Jawa', sortOrder: 9 },
  { code: 'yezdi', name: 'Yezdi', sortOrder: 10 },
  { code: 'mahindra-2w', name: 'Mahindra', sortOrder: 11 },
  { code: 'piaggio', name: 'Vespa / Piaggio', sortOrder: 12 },
  { code: 'aprilia', name: 'Aprilia', sortOrder: 13 },
  { code: 'kawasaki', name: 'Kawasaki', sortOrder: 14 },
  { code: 'triumph', name: 'Triumph', sortOrder: 15 },
  { code: 'harley-davidson', name: 'Harley-Davidson', sortOrder: 16 },
  { code: 'bmw-motorrad', name: 'BMW Motorrad', sortOrder: 17 },
  { code: 'benelli', name: 'Benelli', sortOrder: 18 },
  { code: 'husqvarna', name: 'Husqvarna', sortOrder: 19 },
  // Electric
  { code: 'ola-electric', name: 'Ola Electric', sortOrder: 20 },
  { code: 'ather', name: 'Ather Energy', sortOrder: 21 },
  { code: 'hero-vida', name: 'Vida (Hero)', sortOrder: 22 },
  { code: 'bajaj-chetak', name: 'Chetak (Bajaj)', sortOrder: 23 },
  { code: 'tvs-iqube', name: 'iQube (TVS)', sortOrder: 24 },
  { code: 'ampere', name: 'Ampere', sortOrder: 25 },
  { code: 'okinawa', name: 'Okinawa', sortOrder: 26 },
  { code: 'hero-electric', name: 'Hero Electric', sortOrder: 27 },
  { code: 'revolt', name: 'Revolt', sortOrder: 28 },
  { code: 'bgauss', name: 'BGauss', sortOrder: 29 },
  { code: 'kinetic-green', name: 'Kinetic Green', sortOrder: 30 },
  { code: 'simple-energy', name: 'Simple Energy', sortOrder: 31 },
  { code: 'ultraviolette', name: 'Ultraviolette', sortOrder: 32 },
  { code: 'pure-ev', name: 'PURE EV', sortOrder: 33 },
  { code: 'river', name: 'River', sortOrder: 34 },
];

/* ─── Problem taxonomy (§8) ────────────────────────────────────────────── */

const PROBLEM_CATEGORIES = [
  { code: 'tw_roadside', name: 'Roadside Emergency', icon: 'alert-triangle', displayOrder: 1 },
  { code: 'tw_starting', name: 'Starting & Ignition', icon: 'power', displayOrder: 2 },
  { code: 'tw_engine', name: 'Engine & Performance', icon: 'settings', displayOrder: 3 },
  { code: 'tw_battery_electrical', name: 'Battery & Electrical', icon: 'battery', displayOrder: 4 },
  { code: 'tw_lights_controls', name: 'Lights & Controls', icon: 'lightbulb', displayOrder: 5, isActive: false },
  { code: 'tw_brakes', name: 'Brakes', icon: 'disc', displayOrder: 6 },
  { code: 'tw_tyres_wheels', name: 'Tyres & Wheels', icon: 'circle', displayOrder: 7 },
  { code: 'tw_chain_drive', name: 'Chain & Drive', icon: 'link', displayOrder: 8 },
  { code: 'tw_clutch_gear', name: 'Clutch & Gears', icon: 'git-merge', displayOrder: 9 },
  { code: 'tw_cvt', name: 'CVT / Transmission', icon: 'repeat', displayOrder: 10, isActive: false },
  { code: 'tw_suspension_steering', name: 'Suspension & Steering', icon: 'move-vertical', displayOrder: 11, isActive: false },
  { code: 'tw_fuel', name: 'Fuel System', icon: 'droplet', displayOrder: 12, isActive: false },
  { code: 'tw_cooling', name: 'Cooling', icon: 'thermometer', displayOrder: 13 },
  { code: 'tw_body', name: 'Body & Exterior', icon: 'shield', displayOrder: 14, isActive: false },
  { code: 'tw_maintenance', name: 'Service & Maintenance', icon: 'tool', displayOrder: 15 },
  // ── Electric-only ──
  { code: 'tw_ev_battery', name: 'EV Battery', icon: 'battery-charging', displayOrder: 16 },
  { code: 'tw_ev_charging', name: 'EV Charging', icon: 'plug', displayOrder: 17 },
  { code: 'tw_ev_motor', name: 'EV Motor', icon: 'zap', displayOrder: 18 },
  { code: 'tw_ev_controller', name: 'EV Controller', icon: 'cpu', displayOrder: 19 },
  { code: 'tw_ev_dashboard', name: 'Dashboard & Connectivity', icon: 'monitor', displayOrder: 20 },
];

/**
 * Problems.
 *
 * `candidates` are POSSIBLE repairs, never a decision (§10). "Bike won't start"
 * lists five because the symptom genuinely does not identify the fault — the
 * diagnostic tree, or a technician with the vehicle in front of them, narrows
 * it. Mapping it straight to "battery replacement" is how a customer pays for a
 * battery when the fuse had blown.
 *
 * `appliesToProductTypeCodes` keeps the list honest per vehicle: chain questions never
 * reach a scooter rider, CVT questions never reach a motorcyclist, and engine
 * questions never reach an EV.
 */
const P = (code, name, categoryCode, candidates = [], opts = {}) => ({
  code, name, categoryCode, candidateRepairCodes: candidates, ...opts,
});

const PROBLEMS = [
  /* ── Roadside emergency — someone is stranded right now ──────────────── */
  P('tw_wont_start_roadside', 'Vehicle won\'t start', 'tw_roadside',
    ['tw_jump_start', 'tw_battery_replacement', 'tw_starter_repair', 'tw_spark_plug_replacement', 'tw_roadside_minor_repair'],
    { isPopular: true, severity: 'high' }),
  P('tw_puncture', 'Puncture / flat tyre', 'tw_roadside',
    ['tw_puncture_tubeless', 'tw_puncture_tube', 'tw_tyre_replacement'],
    { isPopular: true, severity: 'high' }),
  P('tw_out_of_fuel', 'Out of fuel', 'tw_roadside', ['tw_fuel_delivery'],
    { isPopular: true, severity: 'high', appliesToProductTypeCodes: PETROL }),
  P('tw_battery_dead_roadside', 'Battery dead', 'tw_roadside',
    ['tw_jump_start', 'tw_battery_replacement'], { isPopular: true, severity: 'high' }),
  P('tw_breakdown', 'Broken down — cannot ride', 'tw_roadside',
    ['tw_roadside_minor_repair', 'tw_towing'], { severity: 'high', requiresDiagnosis: true }),
  P('tw_accident_damage', 'Accident damage', 'tw_roadside', ['tw_towing'],
    { severity: 'critical', requiresDiagnosis: true }),
  P('tw_key_lost', 'Key lost or locked', 'tw_roadside', ['tw_lock_service'], { severity: 'high' }),
  P('tw_ev_out_of_charge', 'Out of charge', 'tw_roadside', ['tw_towing', 'tw_ev_charge_assist'],
    { severity: 'high', appliesToProductTypeCodes: ELECTRIC }),

  /* ── Starting & ignition ─────────────────────────────────────────────── */
  P('tw_self_start_not_working', 'Self-start not working', 'tw_starting',
    ['tw_starter_repair', 'tw_battery_replacement', 'tw_starter_relay_replacement'], { isPopular: true }),
  P('tw_kick_start_not_working', 'Kick-start not working', 'tw_starting',
    ['tw_kick_start_repair'], { appliesToProductTypeCodes: PETROL }),
  P('tw_starter_motor_issue', 'Starter motor issue', 'tw_starting', ['tw_starter_repair']),
  P('tw_starter_relay_issue', 'Starter relay issue', 'tw_starting', ['tw_starter_relay_replacement']),
  P('tw_ignition_problem', 'Ignition problem', 'tw_starting',
    ['tw_ignition_repair', 'tw_spark_plug_replacement'], { appliesToProductTypeCodes: PETROL }),
  P('tw_spark_plug_issue', 'Spark plug issue', 'tw_starting',
    ['tw_spark_plug_replacement'], { appliesToProductTypeCodes: PETROL, isPopular: true }),
  P('tw_ignition_coil_issue', 'Ignition coil issue', 'tw_starting',
    ['tw_ignition_coil_replacement'], { appliesToProductTypeCodes: PETROL }),
  P('tw_key_switch_issue', 'Key / ignition switch issue', 'tw_starting', ['tw_ignition_switch_replacement']),
  P('tw_engine_cutoff_switch', 'Engine cut-off switch issue', 'tw_starting',
    ['tw_switch_repair'], { appliesToProductTypeCodes: PETROL }),

  /* ── Engine & performance — petrol only ──────────────────────────────── */
  P('tw_engine_not_starting', 'Engine not starting', 'tw_engine',
    ['tw_spark_plug_replacement', 'tw_carburetor_service', 'tw_fuel_injector_service', 'tw_engine_repair'],
    { appliesToProductTypeCodes: PETROL, severity: 'high', isPopular: true }),
  P('tw_engine_starts_and_stops', 'Engine starts then stops', 'tw_engine',
    ['tw_carburetor_service', 'tw_fuel_filter_replacement', 'tw_spark_plug_replacement'], { appliesToProductTypeCodes: PETROL }),
  P('tw_engine_misfiring', 'Engine misfiring', 'tw_engine',
    ['tw_spark_plug_replacement', 'tw_ignition_coil_replacement', 'tw_carburetor_service'], { appliesToProductTypeCodes: PETROL }),
  P('tw_engine_overheating', 'Engine overheating', 'tw_engine',
    ['tw_coolant_service', 'tw_engine_oil_change', 'tw_engine_repair'],
    { appliesToProductTypeCodes: PETROL, severity: 'high' }),
  P('tw_low_power', 'Low power', 'tw_engine',
    ['tw_air_filter_replacement', 'tw_carburetor_service', 'tw_engine_tuning'], { appliesToProductTypeCodes: PETROL }),
  P('tw_poor_pickup', 'Poor pickup / acceleration', 'tw_engine',
    ['tw_carburetor_service', 'tw_air_filter_replacement', 'tw_engine_tuning'],
    { appliesToProductTypeCodes: PETROL, isPopular: true }),
  P('tw_excessive_vibration', 'Excessive vibration', 'tw_engine',
    ['tw_engine_repair', 'tw_engine_tuning'], { appliesToProductTypeCodes: PETROL, requiresDiagnosis: true }),
  P('tw_unusual_engine_noise', 'Unusual engine noise', 'tw_engine',
    ['tw_engine_repair'], { appliesToProductTypeCodes: PETROL, requiresDiagnosis: true }),
  P('tw_knocking_noise', 'Knocking noise', 'tw_engine',
    ['tw_engine_repair'], { appliesToProductTypeCodes: PETROL, severity: 'high', requiresDiagnosis: true }),
  P('tw_excessive_smoke', 'Excessive smoke', 'tw_engine',
    ['tw_engine_repair', 'tw_engine_oil_change'], { appliesToProductTypeCodes: PETROL, requiresDiagnosis: true }),
  P('tw_stalling', 'Stalling', 'tw_engine',
    ['tw_carburetor_service', 'tw_fuel_filter_replacement'], { appliesToProductTypeCodes: PETROL }),
  P('tw_poor_mileage', 'Poor fuel efficiency', 'tw_engine',
    ['tw_general_service', 'tw_carburetor_service', 'tw_air_filter_replacement'],
    { appliesToProductTypeCodes: PETROL, isPopular: true }),
  P('tw_engine_warning_light', 'Engine warning light', 'tw_engine',
    ['tw_diagnostic_scan'], { appliesToProductTypeCodes: PETROL, requiresDiagnosis: true }),

  /* ── Battery & electrical ────────────────────────────────────────────── */
  P('tw_battery_draining', 'Battery draining', 'tw_battery_electrical',
    ['tw_battery_replacement', 'tw_wiring_repair', 'tw_stator_repair'], { isPopular: true }),
  P('tw_battery_weak', 'Battery weak', 'tw_battery_electrical', ['tw_battery_replacement']),
  P('tw_battery_not_charging', 'Battery not charging', 'tw_battery_electrical',
    ['tw_stator_repair', 'tw_rectifier_replacement', 'tw_battery_replacement']),
  P('tw_battery_replacement_req', 'Battery replacement', 'tw_battery_electrical',
    ['tw_battery_replacement'], { isPopular: true }),
  P('tw_stator_issue', 'Alternator / stator issue', 'tw_battery_electrical', ['tw_stator_repair']),
  P('tw_fuse_blown', 'Fuse blown', 'tw_battery_electrical', ['tw_fuse_replacement']),
  P('tw_wiring_issue', 'Wiring issue', 'tw_battery_electrical',
    ['tw_wiring_repair'], { requiresDiagnosis: true }),
  P('tw_electrical_short', 'Electrical short', 'tw_battery_electrical',
    ['tw_wiring_repair'], { severity: 'high', requiresDiagnosis: true }),

  /* ── Lights & controls ───────────────────────────────────────────────── */
  P('tw_headlight_not_working', 'Headlight not working', 'tw_lights_controls',
    ['tw_headlight_repair', 'tw_bulb_replacement'], { isPopular: true }),
  P('tw_headlight_dim', 'Headlight dim', 'tw_lights_controls', ['tw_headlight_repair', 'tw_stator_repair']),
  P('tw_tail_light_not_working', 'Tail light not working', 'tw_lights_controls', ['tw_bulb_replacement', 'tw_wiring_repair']),
  P('tw_brake_light_not_working', 'Brake light not working', 'tw_lights_controls',
    ['tw_bulb_replacement', 'tw_brake_switch_replacement'], { severity: 'high' }),
  P('tw_indicator_not_working', 'Indicator not working', 'tw_lights_controls', ['tw_bulb_replacement', 'tw_indicator_repair']),
  P('tw_horn_not_working', 'Horn not working', 'tw_lights_controls', ['tw_horn_replacement'], { isPopular: true }),
  P('tw_switch_issue', 'Switch issue', 'tw_lights_controls', ['tw_switch_repair']),
  P('tw_speedometer_issue', 'Speedometer / cluster issue', 'tw_lights_controls', ['tw_cluster_repair']),

  /* ── Brakes ──────────────────────────────────────────────────────────── */
  P('tw_front_brake_problem', 'Front brake problem', 'tw_brakes',
    ['tw_brake_pad_replacement', 'tw_brake_service'], { severity: 'high', isPopular: true }),
  P('tw_rear_brake_problem', 'Rear brake problem', 'tw_brakes',
    ['tw_brake_shoe_replacement', 'tw_brake_service'], { severity: 'high' }),
  P('tw_brake_noise', 'Brake noise', 'tw_brakes', ['tw_brake_pad_replacement', 'tw_brake_service'], { isPopular: true }),
  P('tw_brake_vibration', 'Brake vibration', 'tw_brakes', ['tw_brake_disc_replacement', 'tw_brake_service']),
  P('tw_brake_lever_hard', 'Brake lever hard', 'tw_brakes', ['tw_brake_service', 'tw_brake_cable_replacement']),
  P('tw_brake_lever_soft', 'Brake lever soft / spongy', 'tw_brakes',
    ['tw_brake_bleeding', 'tw_brake_fluid_change'], { severity: 'high' }),
  P('tw_brake_fluid_issue', 'Brake fluid issue', 'tw_brakes', ['tw_brake_fluid_change'], { severity: 'high' }),
  P('tw_brake_pad_replacement_req', 'Brake pad replacement', 'tw_brakes', ['tw_brake_pad_replacement'], { isPopular: true }),
  P('tw_brake_disc_issue', 'Brake disc issue', 'tw_brakes', ['tw_brake_disc_replacement']),
  P('tw_brake_drum_issue', 'Brake drum issue', 'tw_brakes', ['tw_brake_shoe_replacement']),

  /* ── Tyres & wheels ──────────────────────────────────────────────────── */
  P('tw_slow_puncture', 'Slow puncture', 'tw_tyres_wheels', ['tw_puncture_tubeless', 'tw_puncture_tube']),
  P('tw_tyre_replacement_req', 'Tyre replacement', 'tw_tyres_wheels', ['tw_tyre_replacement'], { isPopular: true }),
  P('tw_tyre_wear', 'Tyre worn out', 'tw_tyres_wheels', ['tw_tyre_replacement'], { severity: 'high' }),
  P('tw_wheel_alignment', 'Wheel alignment', 'tw_tyres_wheels', ['tw_wheel_alignment']),
  P('tw_wheel_balancing', 'Wheel balancing', 'tw_tyres_wheels', ['tw_wheel_balancing']),
  P('tw_rim_damage', 'Rim damage / bent rim', 'tw_tyres_wheels', ['tw_rim_repair', 'tw_rim_replacement']),
  P('tw_valve_issue', 'Valve issue', 'tw_tyres_wheels', ['tw_valve_replacement']),
  P('tw_wheel_bearing_issue', 'Wheel bearing issue', 'tw_tyres_wheels', ['tw_wheel_bearing_replacement']),

  /* ── Chain & drive — geared bikes only ───────────────────────────────── */
  P('tw_chain_loose', 'Chain loose', 'tw_chain_drive', ['tw_chain_adjustment'], { appliesToProductTypeCodes: GEARED, isPopular: true }),
  P('tw_chain_noise', 'Chain noise', 'tw_chain_drive', ['tw_chain_service', 'tw_chain_replacement'], { appliesToProductTypeCodes: GEARED }),
  P('tw_chain_dry', 'Chain dry / needs lubrication', 'tw_chain_drive', ['tw_chain_service'], { appliesToProductTypeCodes: GEARED }),
  P('tw_chain_replacement_req', 'Chain replacement', 'tw_chain_drive', ['tw_chain_replacement'], { appliesToProductTypeCodes: GEARED }),
  P('tw_sprocket_worn', 'Sprocket worn', 'tw_chain_drive', ['tw_chain_sprocket_replacement'], { appliesToProductTypeCodes: GEARED }),
  P('tw_drive_noise', 'Drive noise', 'tw_chain_drive', ['tw_chain_service'], { appliesToProductTypeCodes: GEARED, requiresDiagnosis: true }),

  /* ── Clutch & gears — geared bikes only ──────────────────────────────── */
  P('tw_clutch_slipping', 'Clutch slipping', 'tw_clutch_gear', ['tw_clutch_plate_replacement'], { appliesToProductTypeCodes: GEARED }),
  P('tw_clutch_hard', 'Clutch hard', 'tw_clutch_gear', ['tw_clutch_adjustment', 'tw_clutch_cable_replacement'], { appliesToProductTypeCodes: GEARED }),
  P('tw_clutch_cable_issue', 'Clutch cable issue', 'tw_clutch_gear', ['tw_clutch_cable_replacement'], { appliesToProductTypeCodes: GEARED }),
  P('tw_gear_shifting_hard', 'Gear shifting hard', 'tw_clutch_gear', ['tw_clutch_adjustment', 'tw_gearbox_repair'], { appliesToProductTypeCodes: GEARED }),
  P('tw_gear_not_shifting', 'Gear not shifting', 'tw_clutch_gear', ['tw_gearbox_repair'], { appliesToProductTypeCodes: GEARED, severity: 'high' }),
  P('tw_gearbox_noise', 'Gearbox noise', 'tw_clutch_gear', ['tw_gearbox_repair'], { appliesToProductTypeCodes: GEARED, requiresDiagnosis: true }),

  /* ── CVT — scooters only ─────────────────────────────────────────────── */
  P('tw_cvt_noise', 'CVT noise', 'tw_cvt', ['tw_cvt_service', 'tw_cvt_belt_replacement'], { appliesToProductTypeCodes: CVT }),
  P('tw_cvt_vibration', 'CVT vibration', 'tw_cvt', ['tw_cvt_service', 'tw_clutch_shoe_replacement'], { appliesToProductTypeCodes: CVT }),
  P('tw_cvt_belt_issue', 'CVT belt issue', 'tw_cvt', ['tw_cvt_belt_replacement'], { appliesToProductTypeCodes: CVT, isPopular: true }),
  P('tw_roller_issue', 'Roller weight issue', 'tw_cvt', ['tw_cvt_roller_replacement'], { appliesToProductTypeCodes: CVT }),
  P('tw_scooter_poor_pickup', 'Poor pickup', 'tw_cvt', ['tw_cvt_service', 'tw_cvt_roller_replacement'], { appliesToProductTypeCodes: CVT, isPopular: true }),
  P('tw_transmission_slipping', 'Transmission slipping', 'tw_cvt', ['tw_cvt_belt_replacement', 'tw_clutch_shoe_replacement'], { appliesToProductTypeCodes: CVT }),
  P('tw_cvt_service_req', 'CVT servicing', 'tw_cvt', ['tw_cvt_service'], { appliesToProductTypeCodes: CVT }),

  /* ── Suspension & steering ───────────────────────────────────────────── */
  P('tw_front_suspension_issue', 'Front suspension issue', 'tw_suspension_steering', ['tw_fork_service', 'tw_fork_seal_replacement']),
  P('tw_rear_suspension_issue', 'Rear suspension issue', 'tw_suspension_steering', ['tw_shock_absorber_replacement']),
  P('tw_fork_leak', 'Fork oil leak', 'tw_suspension_steering', ['tw_fork_seal_replacement'], { isPopular: true }),
  P('tw_hard_suspension', 'Suspension too hard', 'tw_suspension_steering', ['tw_fork_service', 'tw_shock_absorber_replacement']),
  P('tw_handlebar_alignment', 'Handlebar misaligned', 'tw_suspension_steering', ['tw_handlebar_alignment']),
  P('tw_hard_steering', 'Hard steering', 'tw_suspension_steering', ['tw_steering_bearing_replacement']),
  P('tw_steering_vibration', 'Steering vibration', 'tw_suspension_steering', ['tw_wheel_balancing', 'tw_steering_bearing_replacement']),

  /* ── Fuel system — petrol only ───────────────────────────────────────── */
  // Petrol on the ground is an ignition risk, not a booking. Critical severity
  // with `requiresDiagnosis` so it can never be auto-priced and auto-dispatched
  // — the same rule the EV thermal faults carry, for the same reason.
  P('tw_fuel_leakage', 'Fuel leakage', 'tw_fuel', ['tw_fuel_line_repair', 'tw_fuel_tank_repair'],
    { appliesToProductTypeCodes: PETROL, severity: 'critical', requiresDiagnosis: true }),
  P('tw_fuel_pump_issue', 'Fuel pump issue', 'tw_fuel', ['tw_fuel_pump_replacement'], { appliesToProductTypeCodes: PETROL }),
  P('tw_fuel_injector_issue', 'Fuel injector issue', 'tw_fuel', ['tw_fuel_injector_service'], { appliesToProductTypeCodes: PETROL }),
  P('tw_carburetor_issue', 'Carburettor issue', 'tw_fuel', ['tw_carburetor_service'], { appliesToProductTypeCodes: PETROL }),
  P('tw_fuel_filter_issue', 'Fuel filter issue', 'tw_fuel', ['tw_fuel_filter_replacement'], { appliesToProductTypeCodes: PETROL }),

  /* ── Cooling ─────────────────────────────────────────────────────────── */
  P('tw_coolant_leak', 'Coolant leak', 'tw_cooling', ['tw_coolant_service', 'tw_radiator_repair'],
    { appliesToProductTypeCodes: PETROL, severity: 'high' }),
  P('tw_radiator_issue', 'Radiator issue', 'tw_cooling', ['tw_radiator_repair'], { appliesToProductTypeCodes: PETROL }),
  P('tw_radiator_fan_issue', 'Radiator fan issue', 'tw_cooling', ['tw_radiator_fan_replacement'], { appliesToProductTypeCodes: PETROL }),
  P('tw_coolant_replacement_req', 'Coolant replacement', 'tw_cooling', ['tw_coolant_service'], { appliesToProductTypeCodes: PETROL }),

  /* ── Body & exterior ─────────────────────────────────────────────────── */
  P('tw_panel_damage', 'Panel / body damage', 'tw_body', ['tw_panel_replacement']),
  P('tw_mudguard_damage', 'Mudguard damage', 'tw_body', ['tw_panel_replacement']),
  P('tw_mirror_damage', 'Mirror damage', 'tw_body', ['tw_mirror_replacement']),
  P('tw_seat_damage', 'Seat damage', 'tw_body', ['tw_seat_repair']),
  P('tw_seat_lock_issue', 'Seat lock issue', 'tw_body', ['tw_lock_service']),
  P('tw_footrest_damage', 'Footrest damage', 'tw_body', ['tw_panel_replacement']),
  P('tw_crash_guard_damage', 'Crash guard damage', 'tw_body', ['tw_panel_replacement']),

  /* ── Maintenance ─────────────────────────────────────────────────────── */
  P('tw_general_service_req', 'General service', 'tw_maintenance', ['tw_general_service'], { isPopular: true }),
  P('tw_engine_oil_req', 'Engine oil change', 'tw_maintenance', ['tw_engine_oil_change'],
    { appliesToProductTypeCodes: PETROL, isPopular: true }),
  P('tw_oil_filter_req', 'Oil filter replacement', 'tw_maintenance', ['tw_oil_filter_replacement'], { appliesToProductTypeCodes: PETROL }),
  P('tw_air_filter_req', 'Air filter replacement', 'tw_maintenance', ['tw_air_filter_replacement'], { appliesToProductTypeCodes: PETROL }),
  P('tw_full_inspection_req', 'Full inspection', 'tw_maintenance', ['tw_full_inspection']),
  P('tw_periodic_service_req', 'Periodic / preventive maintenance', 'tw_maintenance', ['tw_general_service']),
  P('tw_washing_req', 'Washing & detailing', 'tw_maintenance', ['tw_washing']),

  /* ── EV battery ──────────────────────────────────────────────────────── *
   * The first four are ordinary faults. The five marked `critical` are NOT:
   * a swollen or smoking lithium pack is a fire risk, and the correct response
   * is safety instructions and an escalation, never "a technician will be with
   * you in 25 minutes". They are all `requiresDiagnosis` so no price can be
   * quoted and no auto-dispatch can happen.                                  */
  P('tw_ev_battery_not_charging', 'Battery not charging', 'tw_ev_battery',
    ['tw_ev_battery_diagnostic', 'tw_ev_charger_repair'], { appliesToProductTypeCodes: ELECTRIC, isPopular: true }),
  P('tw_ev_battery_drains_fast', 'Battery drains quickly', 'tw_ev_battery',
    ['tw_ev_battery_diagnostic', 'tw_ev_battery_replacement'], { appliesToProductTypeCodes: ELECTRIC, isPopular: true }),
  P('tw_ev_reduced_range', 'Reduced range', 'tw_ev_battery',
    ['tw_ev_battery_diagnostic'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_percentage_incorrect', 'Battery percentage incorrect or jumping', 'tw_ev_battery',
    ['tw_ev_battery_diagnostic', 'tw_ev_bms_service'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_battery_not_detected', 'Battery not detected', 'tw_ev_battery',
    ['tw_ev_battery_diagnostic', 'tw_ev_bms_service'], { appliesToProductTypeCodes: ELECTRIC, severity: 'high' }),
  P('tw_ev_battery_health', 'Battery health check', 'tw_ev_battery',
    ['tw_ev_battery_diagnostic'], { appliesToProductTypeCodes: ELECTRIC }),

  P('tw_ev_battery_overheating', 'Battery overheating', 'tw_ev_battery', ['tw_ev_safety_inspection'],
    { appliesToProductTypeCodes: ELECTRIC, severity: 'critical', requiresDiagnosis: true }),
  P('tw_ev_battery_swollen', 'Battery swollen or bulging', 'tw_ev_battery', ['tw_ev_safety_inspection'],
    { appliesToProductTypeCodes: ELECTRIC, severity: 'critical', requiresDiagnosis: true }),
  P('tw_ev_battery_smoke', 'Smoke or burning smell', 'tw_ev_battery', ['tw_ev_safety_inspection'],
    { appliesToProductTypeCodes: ELECTRIC, severity: 'critical', requiresDiagnosis: true }),
  P('tw_ev_battery_leak', 'Battery leaking', 'tw_ev_battery', ['tw_ev_safety_inspection'],
    { appliesToProductTypeCodes: ELECTRIC, severity: 'critical', requiresDiagnosis: true }),
  P('tw_ev_battery_damage', 'Visible battery damage after a crash', 'tw_ev_battery', ['tw_ev_safety_inspection'],
    { appliesToProductTypeCodes: ELECTRIC, severity: 'critical', requiresDiagnosis: true }),

  /* ── EV charging ─────────────────────────────────────────────────────── */
  P('tw_ev_charger_not_working', 'Charger not working', 'tw_ev_charging',
    ['tw_ev_charger_repair'], { appliesToProductTypeCodes: ELECTRIC, isPopular: true }),
  P('tw_ev_charging_port_issue', 'Charging port issue', 'tw_ev_charging',
    ['tw_ev_charging_port_repair'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_slow_charging', 'Slow charging', 'tw_ev_charging',
    ['tw_ev_battery_diagnostic', 'tw_ev_charger_repair'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_charging_interrupted', 'Charging stops partway', 'tw_ev_charging',
    ['tw_ev_battery_diagnostic', 'tw_ev_bms_service'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_not_accepting_charge', 'Vehicle not accepting charge', 'tw_ev_charging',
    ['tw_ev_charging_port_repair', 'tw_ev_bms_service'], { appliesToProductTypeCodes: ELECTRIC, severity: 'high' }),
  P('tw_ev_cable_issue', 'Charging cable issue', 'tw_ev_charging',
    ['tw_ev_charger_repair'], { appliesToProductTypeCodes: ELECTRIC }),

  /* ── EV motor ────────────────────────────────────────────────────────── */
  P('tw_ev_motor_not_running', 'Motor not running', 'tw_ev_motor',
    ['tw_ev_motor_diagnostic', 'tw_ev_controller_repair'], { appliesToProductTypeCodes: ELECTRIC, severity: 'high' }),
  P('tw_ev_low_motor_power', 'Low motor power', 'tw_ev_motor',
    ['tw_ev_motor_diagnostic', 'tw_ev_controller_repair'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_motor_noise', 'Motor noise', 'tw_ev_motor', ['tw_ev_motor_diagnostic'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_motor_overheating', 'Motor overheating', 'tw_ev_motor',
    ['tw_ev_motor_diagnostic'], { appliesToProductTypeCodes: ELECTRIC, severity: 'high' }),
  P('tw_ev_motor_vibration', 'Motor vibration', 'tw_ev_motor', ['tw_ev_motor_diagnostic'], { appliesToProductTypeCodes: ELECTRIC }),

  /* ── EV controller & electrical ──────────────────────────────────────── */
  P('tw_ev_controller_failure', 'Controller failure', 'tw_ev_controller',
    ['tw_ev_controller_repair'], { appliesToProductTypeCodes: ELECTRIC, severity: 'high' }),
  P('tw_ev_power_cutoff', 'Power cuts out while riding', 'tw_ev_controller',
    ['tw_ev_controller_repair', 'tw_ev_bms_service'], { appliesToProductTypeCodes: ELECTRIC, severity: 'high' }),
  P('tw_ev_acceleration_issue', 'Acceleration issue', 'tw_ev_controller',
    ['tw_ev_controller_repair', 'tw_ev_throttle_replacement'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_error_code', 'Error code shown', 'tw_ev_controller',
    ['tw_ev_diagnostic_scan'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_dcdc_issue', 'DC-DC converter issue', 'tw_ev_controller',
    ['tw_ev_dcdc_replacement'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_12v_battery_issue', '12V battery issue', 'tw_ev_controller',
    ['tw_battery_replacement'], { appliesToProductTypeCodes: ELECTRIC }),

  /* ── EV dashboard & connectivity ─────────────────────────────────────── */
  P('tw_ev_dashboard_not_working', 'Dashboard not working', 'tw_ev_dashboard',
    ['tw_cluster_repair'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_display_issue', 'Speed or battery display wrong', 'tw_ev_dashboard',
    ['tw_cluster_repair', 'tw_ev_firmware_update'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_touchscreen_issue', 'Touchscreen issue', 'tw_ev_dashboard',
    ['tw_cluster_repair'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_bluetooth_issue', 'Bluetooth issue', 'tw_ev_dashboard',
    ['tw_ev_firmware_update'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_app_connection_issue', 'Mobile app not connecting', 'tw_ev_dashboard',
    ['tw_ev_firmware_update'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_gps_issue', 'GPS issue', 'tw_ev_dashboard', ['tw_ev_firmware_update'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_smart_key_issue', 'Smart key or lock issue', 'tw_ev_dashboard',
    ['tw_lock_service', 'tw_ev_firmware_update'], { appliesToProductTypeCodes: ELECTRIC }),
  P('tw_ev_firmware_issue', 'Software / firmware issue', 'tw_ev_dashboard',
    ['tw_ev_firmware_update'], { appliesToProductTypeCodes: ELECTRIC }),
];

/* ─── Repairs (§13) ────────────────────────────────────────────────────── */

const D = 'doorstep', W = 'workshop', PU = 'pickup_repair', R = 'remote_support', RS = 'roadside';

/**
 * Service modes per repair are an operational claim, not a formality (§27).
 *
 * A puncture is roadside work by definition — offering it workshop-only would
 * miss the whole point. An engine rebuild is workshop-only because it needs a
 * bench and a stand; promising it at the kerbside is a promise broken on
 * arrival. EV high-voltage work is workshop-only for safety, never doorstep.
 *
 * Every price here is left to the provider (§66): `pricingMode: 'fixed'` means
 * "one firm number per quality grade", not "Zappy has decided the number".
 */
const REPAIRS = [
  /* ── Roadside ──────────────────────────────────────────────────────── */
  { code: 'tw_puncture_tubeless', name: 'Tubeless Puncture Repair', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 25, warrantyDays: 30 },
  { code: 'tw_puncture_tube', name: 'Tube Puncture Repair', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 40, warrantyDays: 30 },
  { code: 'tw_jump_start', name: 'Jump Start', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D], durationMin: 15, warrantyDays: 0 },
  { code: 'tw_fuel_delivery', name: 'Fuel Delivery', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS], durationMin: 25, warrantyDays: 0 },
  { code: 'tw_roadside_minor_repair', name: 'Minor Roadside Repair', pricingMode: 'diagnosis_required', minSkillLevel: 2, modes: [RS, D], durationMin: 40, warrantyDays: 30 },
  { code: 'tw_towing', name: 'Towing / Vehicle Transport', pricingMode: 'diagnosis_required', minSkillLevel: 1, modes: [RS], durationMin: 60, warrantyDays: 0 },
  { code: 'tw_ev_charge_assist', name: 'EV Charging Assistance', pricingMode: 'fixed', minSkillLevel: 2, modes: [RS], durationMin: 45, warrantyDays: 0 },
  { code: 'tw_lock_service', name: 'Lock & Key Service', pricingMode: 'diagnosis_required', minSkillLevel: 2, modes: [RS, D, W], durationMin: 45, warrantyDays: 30 },

  /* ── Starting & ignition ───────────────────────────────────────────── */
  { code: 'tw_battery_replacement', name: 'Battery Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 25, warrantyDays: 365, component: 'tw_battery' },
  { code: 'tw_starter_repair', name: 'Starter Motor Repair', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W, PU], durationMin: 90, warrantyDays: 90, component: 'tw_starter_motor' },
  { code: 'tw_starter_relay_replacement', name: 'Starter Relay Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [RS, D, W], durationMin: 30, warrantyDays: 90, component: 'tw_starter_relay' },
  { code: 'tw_kick_start_repair', name: 'Kick-Start Repair', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 90, warrantyDays: 90 },
  { code: 'tw_spark_plug_replacement', name: 'Spark Plug Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 20, warrantyDays: 90, component: 'tw_spark_plug' },
  { code: 'tw_ignition_coil_replacement', name: 'Ignition Coil Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W], durationMin: 60, warrantyDays: 180, component: 'tw_ignition_coil' },
  { code: 'tw_ignition_repair', name: 'Ignition System Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 90, warrantyDays: 90 },
  { code: 'tw_ignition_switch_replacement', name: 'Ignition Switch Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 60, warrantyDays: 180, component: 'tw_ignition_switch' },

  /* ── Engine ────────────────────────────────────────────────────────── */
  { code: 'tw_engine_repair', name: 'Engine Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 480, warrantyDays: 90 },
  { code: 'tw_engine_tuning', name: 'Engine Tuning', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W], durationMin: 60, warrantyDays: 30 },
  { code: 'tw_engine_oil_change', name: 'Engine Oil Change', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W], durationMin: 30, warrantyDays: 0, component: 'tw_engine_oil' },
  { code: 'tw_oil_filter_replacement', name: 'Oil Filter Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W], durationMin: 20, warrantyDays: 0, component: 'tw_oil_filter' },
  { code: 'tw_air_filter_replacement', name: 'Air Filter Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W], durationMin: 20, warrantyDays: 0, component: 'tw_air_filter' },
  { code: 'tw_diagnostic_scan', name: 'Electronic Diagnostic Scan', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W], durationMin: 40, warrantyDays: 0 },

  /* ── Electrical ────────────────────────────────────────────────────── */
  { code: 'tw_stator_repair', name: 'Stator / Alternator Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 150, warrantyDays: 90 },
  { code: 'tw_rectifier_replacement', name: 'Rectifier Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W], durationMin: 60, warrantyDays: 180, component: 'tw_rectifier' },
  { code: 'tw_wiring_repair', name: 'Wiring Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 120, warrantyDays: 90 },
  { code: 'tw_fuse_replacement', name: 'Fuse Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 15, warrantyDays: 30, component: 'tw_fuse' },
  { code: 'tw_bulb_replacement', name: 'Bulb Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 20, warrantyDays: 90, component: 'tw_bulb' },
  { code: 'tw_headlight_repair', name: 'Headlight Repair', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 45, warrantyDays: 90, component: 'tw_headlight' },
  { code: 'tw_indicator_repair', name: 'Indicator Repair', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 30, warrantyDays: 90, component: 'tw_indicator' },
  { code: 'tw_horn_replacement', name: 'Horn Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 25, warrantyDays: 180, component: 'tw_horn' },
  { code: 'tw_switch_repair', name: 'Switch Repair', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 40, warrantyDays: 90, component: 'tw_switch' },
  { code: 'tw_brake_switch_replacement', name: 'Brake Light Switch Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 30, warrantyDays: 90, component: 'tw_brake_switch' },
  { code: 'tw_cluster_repair', name: 'Instrument Cluster Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 120, warrantyDays: 90 },

  /* ── Brakes ────────────────────────────────────────────────────────── */
  { code: 'tw_brake_pad_replacement', name: 'Brake Pad Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [RS, D, W], durationMin: 45, warrantyDays: 180, component: 'tw_brake_pad' },
  { code: 'tw_brake_shoe_replacement', name: 'Brake Shoe Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 60, warrantyDays: 180, component: 'tw_brake_shoe' },
  { code: 'tw_brake_disc_replacement', name: 'Brake Disc Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 90, warrantyDays: 180, component: 'tw_brake_disc' },
  { code: 'tw_brake_cable_replacement', name: 'Brake Cable Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 30, warrantyDays: 90, component: 'tw_brake_cable' },
  { code: 'tw_brake_fluid_change', name: 'Brake Fluid Change', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 45, warrantyDays: 0, component: 'tw_brake_fluid' },
  { code: 'tw_brake_bleeding', name: 'Brake Bleeding', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 40, warrantyDays: 30 },
  { code: 'tw_brake_service', name: 'Brake Service', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 60, warrantyDays: 90 },

  /* ── Tyres & wheels ────────────────────────────────────────────────── */
  { code: 'tw_tyre_replacement', name: 'Tyre Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [RS, D, W], durationMin: 45, warrantyDays: 0, component: 'tw_tyre' },
  { code: 'tw_wheel_alignment', name: 'Wheel Alignment', pricingMode: 'fixed', minSkillLevel: 2, modes: [W], durationMin: 45, warrantyDays: 30 },
  { code: 'tw_wheel_balancing', name: 'Wheel Balancing', pricingMode: 'fixed', minSkillLevel: 2, modes: [W], durationMin: 45, warrantyDays: 30 },
  { code: 'tw_rim_repair', name: 'Rim Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 120, warrantyDays: 30 },
  { code: 'tw_rim_replacement', name: 'Rim Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 90, warrantyDays: 180, component: 'tw_rim' },
  { code: 'tw_valve_replacement', name: 'Valve Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 25, warrantyDays: 90, component: 'tw_valve' },
  { code: 'tw_wheel_bearing_replacement', name: 'Wheel Bearing Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 90, warrantyDays: 180, component: 'tw_wheel_bearing' },

  /* ── Chain, clutch & gears ─────────────────────────────────────────── */
  { code: 'tw_chain_adjustment', name: 'Chain Adjustment', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 20, warrantyDays: 30 },
  { code: 'tw_chain_service', name: 'Chain Cleaning & Lubrication', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W], durationMin: 30, warrantyDays: 0 },
  { code: 'tw_chain_replacement', name: 'Chain Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 60, warrantyDays: 180, component: 'tw_chain' },
  { code: 'tw_chain_sprocket_replacement', name: 'Chain & Sprocket Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 90, warrantyDays: 180, component: 'tw_chain_sprocket' },
  { code: 'tw_clutch_plate_replacement', name: 'Clutch Plate Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 150, warrantyDays: 180, component: 'tw_clutch_plate' },
  { code: 'tw_clutch_cable_replacement', name: 'Clutch Cable Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 30, warrantyDays: 90, component: 'tw_clutch_cable' },
  { code: 'tw_clutch_adjustment', name: 'Clutch Adjustment', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 20, warrantyDays: 30 },
  { code: 'tw_gearbox_repair', name: 'Gearbox Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 480, warrantyDays: 90 },

  /* ── CVT ───────────────────────────────────────────────────────────── */
  { code: 'tw_cvt_service', name: 'CVT Service', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 90, warrantyDays: 90 },
  { code: 'tw_cvt_belt_replacement', name: 'CVT Belt Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W, PU], durationMin: 90, warrantyDays: 180, component: 'tw_cvt_belt' },
  { code: 'tw_cvt_roller_replacement', name: 'Roller Weight Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W, PU], durationMin: 90, warrantyDays: 180, component: 'tw_cvt_roller' },
  { code: 'tw_clutch_shoe_replacement', name: 'Clutch Shoe Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 120, warrantyDays: 180, component: 'tw_clutch_shoe' },

  /* ── Suspension & steering ─────────────────────────────────────────── */
  { code: 'tw_fork_service', name: 'Front Fork Service', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 120, warrantyDays: 90 },
  { code: 'tw_fork_seal_replacement', name: 'Fork Seal Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 120, warrantyDays: 180, component: 'tw_fork_seal' },
  { code: 'tw_shock_absorber_replacement', name: 'Shock Absorber Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 90, warrantyDays: 180, component: 'tw_shock_absorber' },
  { code: 'tw_handlebar_alignment', name: 'Handlebar Alignment', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 45, warrantyDays: 30 },
  { code: 'tw_steering_bearing_replacement', name: 'Steering Bearing Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 150, warrantyDays: 180, component: 'tw_steering_bearing' },

  /* ── Fuel & cooling ────────────────────────────────────────────────── */
  { code: 'tw_carburetor_service', name: 'Carburettor Service', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W, PU], durationMin: 90, warrantyDays: 90 },
  { code: 'tw_fuel_injector_service', name: 'Fuel Injector Service', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 90, warrantyDays: 90 },
  { code: 'tw_fuel_pump_replacement', name: 'Fuel Pump Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 120, warrantyDays: 180, component: 'tw_fuel_pump' },
  { code: 'tw_fuel_filter_replacement', name: 'Fuel Filter Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 40, warrantyDays: 90, component: 'tw_fuel_filter' },
  { code: 'tw_fuel_line_repair', name: 'Fuel Line Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 90, warrantyDays: 90 },
  { code: 'tw_fuel_tank_repair', name: 'Fuel Tank Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 240, warrantyDays: 90 },
  { code: 'tw_coolant_service', name: 'Coolant Service', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 60, warrantyDays: 90, component: 'tw_coolant' },
  { code: 'tw_radiator_repair', name: 'Radiator Repair', pricingMode: 'diagnosis_required', minSkillLevel: 3, modes: [W, PU], durationMin: 150, warrantyDays: 90 },
  { code: 'tw_radiator_fan_replacement', name: 'Radiator Fan Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 90, warrantyDays: 180, component: 'tw_radiator_fan' },

  /* ── Body & maintenance ────────────────────────────────────────────── */
  { code: 'tw_panel_replacement', name: 'Panel / Body Part Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 60, warrantyDays: 90, component: 'tw_body_panel' },
  { code: 'tw_mirror_replacement', name: 'Mirror Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [RS, D, W], durationMin: 20, warrantyDays: 90, component: 'tw_mirror' },
  { code: 'tw_seat_repair', name: 'Seat Repair / Recover', pricingMode: 'fixed', minSkillLevel: 2, modes: [W, PU], durationMin: 120, warrantyDays: 90 },
  { code: 'tw_general_service', name: 'General Service', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 120, warrantyDays: 30 },
  { code: 'tw_full_inspection', name: 'Full Inspection', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 60, warrantyDays: 0 },
  { code: 'tw_washing', name: 'Washing & Detailing', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W], durationMin: 60, warrantyDays: 0 },

  /* ── EV ────────────────────────────────────────────────────────────── *
   * All high-voltage work is workshop-bound. A pack is heavy, live, and
   * dangerous to open at a kerbside, and `tw_ev_safety_inspection` exists so a
   * suspected thermal fault has somewhere to go that is NOT a normal repair
   * booking.                                                                */
  { code: 'tw_ev_battery_diagnostic', name: 'EV Battery Diagnostic', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W], durationMin: 60, warrantyDays: 0 },
  { code: 'tw_ev_battery_replacement', name: 'EV Battery Replacement', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 180, warrantyDays: 365, component: 'tw_ev_battery' },
  { code: 'tw_ev_bms_service', name: 'Battery Management System Service', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 150, warrantyDays: 90 },
  { code: 'tw_ev_safety_inspection', name: 'EV Safety Inspection', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W], durationMin: 90, warrantyDays: 0 },
  { code: 'tw_ev_charger_repair', name: 'EV Charger Repair', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W, PU], durationMin: 90, warrantyDays: 180, component: 'tw_ev_charger' },
  { code: 'tw_ev_charging_port_repair', name: 'Charging Port Repair', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 120, warrantyDays: 90, component: 'tw_ev_charging_port' },
  { code: 'tw_ev_motor_diagnostic', name: 'EV Motor Diagnostic', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W], durationMin: 60, warrantyDays: 0 },
  { code: 'tw_ev_controller_repair', name: 'EV Controller Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 180, warrantyDays: 90, component: 'tw_ev_controller' },
  { code: 'tw_ev_throttle_replacement', name: 'Throttle Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W], durationMin: 45, warrantyDays: 90, component: 'tw_ev_throttle' },
  { code: 'tw_ev_dcdc_replacement', name: 'DC-DC Converter Replacement', pricingMode: 'fixed', minSkillLevel: 4, modes: [W, PU], durationMin: 120, warrantyDays: 180, component: 'tw_ev_dcdc' },
  { code: 'tw_ev_diagnostic_scan', name: 'EV Diagnostic Scan', pricingMode: 'fixed', minSkillLevel: 3, modes: [D, W], durationMin: 45, warrantyDays: 0 },
  { code: 'tw_ev_firmware_update', name: 'Firmware / Software Service', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, R], durationMin: 45, warrantyDays: 30 },
];

/* ─── Skill levels (§23) ───────────────────────────────────────────────── */

const SKILL_LEVELS = [
  { level: 1, name: 'Roadside', description: 'Puncture, jump start, bulbs, cables, fluids', requiresVerification: false },
  { level: 2, name: 'Service', description: 'General service, brakes, chain, filters, routine replacement', requiresVerification: false },
  { level: 3, name: 'Advanced', description: 'Carburettor, CVT, suspension, electrical, starter, EV diagnostics', requiresVerification: true },
  {
    level: 4,
    name: 'Specialist',
    // Level 4 is the gate for engine internals AND all high-voltage work. A
    // provider must be verified before either reaches them (§8).
    description: 'Engine internals, gearbox, EV high-voltage, battery and controller work',
    requiresVerification: true,
  },
];

/* ─── QA checklists (§53) ──────────────────────────────────────────────── */

const QA_CHECKLISTS = [
  {
    code: 'tw_standard', name: 'Two-Wheeler Standard QA', stage: 'after', repairCodes: [],
    items: [
      { code: 'starts', label: 'Starts on first attempt', required: true },
      { code: 'idle', label: 'Idles steadily', required: true },
      { code: 'brakes', label: 'Both brakes bite correctly', required: true },
      { code: 'lights', label: 'Head, tail, brake lights and indicators work', required: true },
      { code: 'horn', label: 'Horn works', required: true },
      { code: 'test_ride', label: 'Short test ride completed', required: true },
      { code: 'no_leaks', label: 'No oil, fuel or coolant leaks', required: true },
      { code: 'fasteners', label: 'All fasteners torqued and refitted', required: true },
      { code: 'no_new_damage', label: 'No new cosmetic damage', required: true },
      { code: 'cleaned', label: 'Work area and vehicle left clean', required: false },
    ],
  },
  {
    code: 'tw_brakes', name: 'Brake QA', stage: 'after',
    repairCodes: ['tw_brake_pad_replacement', 'tw_brake_shoe_replacement', 'tw_brake_disc_replacement', 'tw_brake_fluid_change', 'tw_brake_bleeding', 'tw_brake_service'],
    items: [
      { code: 'lever_firm', label: 'Lever firm, no sponginess', required: true },
      { code: 'bite_point', label: 'Bite point correct and consistent', required: true },
      { code: 'no_drag', label: 'Wheel spins free with brake released', required: true },
      { code: 'no_noise', label: 'No squeal or grinding under braking', required: true },
      { code: 'fluid_level', label: 'Fluid at correct level, no leaks', required: true },
      { code: 'road_test', label: 'Braking tested under road conditions', required: true },
    ],
  },
  {
    code: 'tw_tyre', name: 'Tyre & Wheel QA', stage: 'after',
    repairCodes: ['tw_puncture_tubeless', 'tw_puncture_tube', 'tw_tyre_replacement', 'tw_valve_replacement', 'tw_wheel_bearing_replacement'],
    items: [
      { code: 'holds_pressure', label: 'Holds pressure after repair', required: true },
      { code: 'pressure_set', label: 'Inflated to the manufacturer figure', required: true },
      { code: 'seated', label: 'Bead seated evenly all round', required: true },
      { code: 'no_wobble', label: 'No wobble when spun', required: true },
      { code: 'axle_torque', label: 'Axle nut torqued', required: true },
    ],
  },
  {
    code: 'tw_ev_hv', name: 'EV High-Voltage QA', stage: 'after',
    repairCodes: ['tw_ev_battery_replacement', 'tw_ev_bms_service', 'tw_ev_controller_repair', 'tw_ev_dcdc_replacement', 'tw_ev_charging_port_repair'],
    items: [
      { code: 'insulation', label: 'Insulation resistance checked and within spec', required: true },
      { code: 'connectors', label: 'All high-voltage connectors seated and locked', required: true },
      { code: 'no_error', label: 'No error codes on the dashboard', required: true },
      { code: 'charges', label: 'Accepts charge and reports correct percentage', required: true },
      { code: 'thermal', label: 'Pack temperature normal after a charge cycle', required: true },
      { code: 'motor', label: 'Motor drives smoothly through the range', required: true },
      { code: 'test_ride', label: 'Short test ride completed with no cut-outs', required: true },
    ],
  },
];

module.exports = {
  VERTICAL, BRANDS, PRODUCT_TYPES, PROBLEM_CATEGORIES, PROBLEMS,
  REPAIRS, SKILL_LEVELS, QA_CHECKLISTS,
};
