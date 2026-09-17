/**
 * Mobile repair catalog seed.
 *
 * This file is SEED DATA, not application constants. Nothing in the running
 * system imports these arrays — they are written to the database once and are
 * fully editable from the admin panel afterwards. That distinction is the whole
 * point of §1: code holds logic, the database holds business data.
 *
 * Every upsert is idempotent and keyed on `code`, so re-running the seed after
 * an admin has edited a record will NOT clobber their edit — it only fills in
 * what is missing. Re-seeding is therefore safe on a live database.
 */

const VERTICAL = 'mobile';

/* ─── §4 Default brands ────────────────────────────────────────────────── */

const BRANDS = [
  { code: 'samsung', name: 'Samsung', displayOrder: 1, isPopular: true },
  { code: 'apple', name: 'Apple / iPhone', displayOrder: 2, isPopular: true },
  { code: 'vivo', name: 'vivo', displayOrder: 3, isPopular: true },
  { code: 'oppo', name: 'OPPO', displayOrder: 4, isPopular: true },
  { code: 'xiaomi', name: 'Xiaomi', displayOrder: 5, isPopular: true },
  { code: 'realme', name: 'realme', displayOrder: 6, isPopular: true },
  { code: 'oneplus', name: 'OnePlus', displayOrder: 7, isPopular: true },
  { code: 'motorola', name: 'Motorola', displayOrder: 8, isPopular: true },
  { code: 'poco', name: 'POCO', displayOrder: 9, isPopular: false },
  { code: 'iqoo', name: 'iQOO', displayOrder: 10, isPopular: false },
  { code: 'nothing', name: 'Nothing', displayOrder: 11, isPopular: false },
  { code: 'google', name: 'Google Pixel', displayOrder: 12, isPopular: false },
];

/* ─── §6 Problem taxonomy ──────────────────────────────────────────────── */

const PROBLEM_CATEGORIES = [
  { code: 'display', name: 'Display', displayOrder: 1, icon: 'monitor-smartphone' },
  { code: 'battery_power', name: 'Battery & Power', displayOrder: 2, icon: 'battery' },
  { code: 'charging', name: 'Charging', displayOrder: 3, icon: 'plug' },
  { code: 'audio', name: 'Audio', displayOrder: 4, icon: 'volume-2' },
  { code: 'camera', name: 'Camera', displayOrder: 5, icon: 'camera' },
  { code: 'physical', name: 'Physical Damage', displayOrder: 6, icon: 'smartphone' },
  { code: 'connectivity', name: 'Connectivity', displayOrder: 7, icon: 'wifi' },
  { code: 'software', name: 'Software', displayOrder: 8, icon: 'cpu' },
  { code: 'liquid_advanced', name: 'Liquid & Advanced', displayOrder: 9, icon: 'droplets' },
];

/**
 * The 65 symptoms from §6. `requiresDiagnosis` marks the ones that cannot be
 * honestly priced before someone opens the device — those skip straight to the
 * quote flow rather than showing a price the customer cannot rely on.
 */
const PROBLEMS = [
  // DISPLAY
  { code: 'cracked_screen', name: 'Cracked screen', categoryCode: 'display', isPopular: true, candidateRepairCodes: ['glass_replacement', 'display_assembly_replacement'] },
  { code: 'broken_glass_display_ok', name: 'Broken glass but display working', categoryCode: 'display', candidateRepairCodes: ['glass_replacement'] },
  { code: 'black_display', name: 'Black display', categoryCode: 'display', isPopular: true, candidateRepairCodes: ['display_assembly_replacement'], requiresDiagnosis: true },
  { code: 'touch_not_working', name: 'Touch not working', categoryCode: 'display', candidateRepairCodes: ['display_assembly_replacement', 'touch_digitizer_repair'] },
  { code: 'ghost_touch', name: 'Ghost touch', categoryCode: 'display', candidateRepairCodes: ['display_assembly_replacement', 'touch_digitizer_repair'] },
  { code: 'green_pink_line', name: 'Green / pink line', categoryCode: 'display', candidateRepairCodes: ['display_assembly_replacement'] },
  { code: 'display_flickering', name: 'Flickering', categoryCode: 'display', candidateRepairCodes: ['display_assembly_replacement'] },
  { code: 'dead_pixels', name: 'Dead pixels', categoryCode: 'display', candidateRepairCodes: ['display_assembly_replacement'] },
  { code: 'display_dimming', name: 'Display dimming', categoryCode: 'display', candidateRepairCodes: ['display_assembly_replacement'] },
  { code: 'screen_burn_in', name: 'Screen burn-in', categoryCode: 'display', candidateRepairCodes: ['display_assembly_replacement'] },
  { code: 'display_touch_failure', name: 'Display + touch failure', categoryCode: 'display', candidateRepairCodes: ['display_assembly_replacement'] },

  // BATTERY / POWER
  { code: 'battery_draining_fast', name: 'Battery draining fast', categoryCode: 'battery_power', isPopular: true, candidateRepairCodes: ['battery_replacement'] },
  { code: 'battery_not_charging', name: 'Battery not charging', categoryCode: 'battery_power', candidateRepairCodes: ['battery_replacement', 'charging_port_repair'] },
  { code: 'battery_swelling', name: 'Battery swelling', categoryCode: 'battery_power', severity: 'critical', candidateRepairCodes: ['battery_replacement'] },
  { code: 'phone_overheating', name: 'Phone overheating', categoryCode: 'battery_power', severity: 'high', candidateRepairCodes: ['battery_replacement'], requiresDiagnosis: true },
  { code: 'random_shutdown', name: 'Random shutdown', categoryCode: 'battery_power', candidateRepairCodes: ['battery_replacement'], requiresDiagnosis: true },
  { code: 'phone_wont_turn_on', name: "Phone won't turn on", categoryCode: 'battery_power', isPopular: true, severity: 'high', requiresDiagnosis: true, candidateRepairCodes: ['battery_replacement', 'power_ic_repair', 'motherboard_repair'] },
  { code: 'battery_percentage_jumping', name: 'Battery percentage jumping', categoryCode: 'battery_power', candidateRepairCodes: ['battery_replacement'] },
  { code: 'fast_charging_not_working', name: 'Fast charging not working', categoryCode: 'battery_power', candidateRepairCodes: ['charging_port_repair', 'battery_replacement'] },

  // CHARGING
  { code: 'charging_port_damaged', name: 'Charging port damaged', categoryCode: 'charging', isPopular: true, candidateRepairCodes: ['charging_port_repair'] },
  { code: 'loose_charging_port', name: 'Loose charging port', categoryCode: 'charging', candidateRepairCodes: ['charging_port_repair'] },
  { code: 'slow_charging', name: 'Slow charging', categoryCode: 'charging', candidateRepairCodes: ['charging_port_repair', 'battery_replacement'] },
  { code: 'cable_not_detecting', name: 'Cable not detecting', categoryCode: 'charging', candidateRepairCodes: ['charging_port_repair'] },
  { code: 'wireless_charging_failure', name: 'Wireless charging failure', categoryCode: 'charging', candidateRepairCodes: ['wireless_charging_repair'] },

  // AUDIO
  { code: 'speaker_not_working', name: 'Speaker not working', categoryCode: 'audio', candidateRepairCodes: ['speaker_replacement'] },
  { code: 'speaker_low_muffled', name: 'Speaker low / muffled', categoryCode: 'audio', candidateRepairCodes: ['speaker_replacement', 'port_cleaning'] },
  { code: 'earpiece_not_working', name: 'Earpiece not working', categoryCode: 'audio', candidateRepairCodes: ['earpiece_replacement'] },
  { code: 'microphone_not_working', name: 'Microphone not working', categoryCode: 'audio', candidateRepairCodes: ['microphone_repair'] },
  { code: 'call_microphone_issue', name: 'Call microphone issue', categoryCode: 'audio', candidateRepairCodes: ['microphone_repair'] },
  { code: 'loudspeaker_distortion', name: 'Loudspeaker distortion', categoryCode: 'audio', candidateRepairCodes: ['speaker_replacement'] },

  // CAMERA
  { code: 'camera_not_opening', name: 'Camera not opening', categoryCode: 'camera', candidateRepairCodes: ['camera_replacement', 'software_flash'] },
  { code: 'blurry_camera', name: 'Blurry camera', categoryCode: 'camera', candidateRepairCodes: ['camera_glass_replacement', 'camera_replacement'] },
  { code: 'autofocus_failure', name: 'Autofocus failure', categoryCode: 'camera', candidateRepairCodes: ['camera_replacement'] },
  { code: 'camera_shaking', name: 'Camera shaking', categoryCode: 'camera', candidateRepairCodes: ['camera_replacement'] },
  { code: 'flash_not_working', name: 'Flash not working', categoryCode: 'camera', candidateRepairCodes: ['camera_replacement'] },
  { code: 'camera_glass_broken', name: 'Camera glass broken', categoryCode: 'camera', candidateRepairCodes: ['camera_glass_replacement'] },
  { code: 'front_camera_failure', name: 'Front camera failure', categoryCode: 'camera', candidateRepairCodes: ['camera_replacement'] },

  // PHYSICAL
  { code: 'back_glass_broken', name: 'Back glass broken', categoryCode: 'physical', isPopular: true, candidateRepairCodes: ['back_glass_replacement'] },
  { code: 'back_panel_damaged', name: 'Back panel damaged', categoryCode: 'physical', candidateRepairCodes: ['back_panel_replacement'] },
  { code: 'frame_housing_damage', name: 'Frame / housing damage', categoryCode: 'physical', candidateRepairCodes: ['housing_replacement'], requiresDiagnosis: true },
  { code: 'power_button_issue', name: 'Power button', categoryCode: 'physical', candidateRepairCodes: ['button_flex_repair'] },
  { code: 'volume_button_issue', name: 'Volume button', categoryCode: 'physical', candidateRepairCodes: ['button_flex_repair'] },
  { code: 'sim_tray_issue', name: 'SIM tray', categoryCode: 'physical', candidateRepairCodes: ['sim_tray_replacement'] },
  { code: 'vibration_motor_issue', name: 'Vibration motor', categoryCode: 'physical', candidateRepairCodes: ['vibration_motor_replacement'] },

  // CONNECTIVITY
  { code: 'wifi_problem', name: 'Wi-Fi problem', categoryCode: 'connectivity', candidateRepairCodes: ['software_flash', 'motherboard_repair'], requiresDiagnosis: true },
  { code: 'bluetooth_problem', name: 'Bluetooth problem', categoryCode: 'connectivity', candidateRepairCodes: ['software_flash'], requiresDiagnosis: true },
  { code: 'network_signal_problem', name: 'Network / signal problem', categoryCode: 'connectivity', candidateRepairCodes: ['software_flash', 'motherboard_repair'], requiresDiagnosis: true },
  { code: 'sim_not_detected', name: 'SIM not detected', categoryCode: 'connectivity', candidateRepairCodes: ['sim_tray_replacement', 'motherboard_repair'], requiresDiagnosis: true },
  { code: 'gps_problem', name: 'GPS problem', categoryCode: 'connectivity', candidateRepairCodes: ['software_flash'], requiresDiagnosis: true },
  { code: 'nfc_problem', name: 'NFC problem', categoryCode: 'connectivity', candidateRepairCodes: ['software_flash'], requiresDiagnosis: true },

  // SOFTWARE
  { code: 'phone_slow', name: 'Phone slow', categoryCode: 'software', candidateRepairCodes: ['software_optimisation'] },
  { code: 'app_crashing', name: 'App crashing', categoryCode: 'software', candidateRepairCodes: ['software_optimisation'] },
  { code: 'boot_loop', name: 'Boot loop', categoryCode: 'software', severity: 'high', candidateRepairCodes: ['software_flash'] },
  { code: 'software_update_failure', name: 'Software update failure', categoryCode: 'software', candidateRepairCodes: ['software_flash'] },
  { code: 'storage_issue', name: 'Storage issue', categoryCode: 'software', candidateRepairCodes: ['software_optimisation'] },
  { code: 'phone_freezing', name: 'Phone freezing', categoryCode: 'software', candidateRepairCodes: ['software_flash', 'software_optimisation'] },
  { code: 'factory_reset', name: 'Factory reset', categoryCode: 'software', candidateRepairCodes: ['software_optimisation'] },
  { code: 'data_transfer', name: 'Data transfer', categoryCode: 'software', candidateRepairCodes: ['data_transfer_service'] },
  { code: 'backup_restore', name: 'Backup / restore', categoryCode: 'software', candidateRepairCodes: ['data_transfer_service'] },

  // LIQUID / ADVANCED — none of these can be priced before inspection
  { code: 'water_liquid_damage', name: 'Water / liquid damage', categoryCode: 'liquid_advanced', severity: 'critical', requiresDiagnosis: true, candidateRepairCodes: ['liquid_damage_treatment', 'motherboard_repair'] },
  { code: 'corrosion', name: 'Corrosion', categoryCode: 'liquid_advanced', severity: 'high', requiresDiagnosis: true, candidateRepairCodes: ['liquid_damage_treatment'] },
  { code: 'short_circuit', name: 'Short circuit', categoryCode: 'liquid_advanced', severity: 'critical', requiresDiagnosis: true, candidateRepairCodes: ['motherboard_repair'] },
  { code: 'motherboard_failure', name: 'Motherboard failure', categoryCode: 'liquid_advanced', severity: 'critical', requiresDiagnosis: true, candidateRepairCodes: ['motherboard_repair'] },
  { code: 'ic_level_repair', name: 'IC-level repair', categoryCode: 'liquid_advanced', severity: 'high', requiresDiagnosis: true, candidateRepairCodes: ['motherboard_repair', 'power_ic_repair'] },
  { code: 'data_recovery_needed', name: 'Data recovery', categoryCode: 'liquid_advanced', severity: 'high', requiresDiagnosis: true, candidateRepairCodes: ['data_recovery'] },
];

/* ─── §9 Repair catalog ────────────────────────────────────────────────── */

const REPAIRS = [
  { code: 'glass_replacement', name: 'Screen Glass Replacement', componentCode: 'screen_glass', minSkillLevel: 3, pricingMode: 'range', warrantyDays: 90, durationMin: 90, modes: ['workshop', 'pickup_repair'] },
  { code: 'display_assembly_replacement', name: 'Display Assembly Replacement', componentCode: 'display_assembly', minSkillLevel: 3, pricingMode: 'range', warrantyDays: 180, durationMin: 60, modes: ['doorstep', 'workshop', 'pickup_repair'] },
  { code: 'touch_digitizer_repair', name: 'Touch Digitizer Repair', componentCode: 'digitizer', minSkillLevel: 3, pricingMode: 'range', warrantyDays: 90, durationMin: 75, modes: ['workshop', 'pickup_repair'] },
  { code: 'battery_replacement', name: 'Battery Replacement', componentCode: 'battery', minSkillLevel: 2, pricingMode: 'fixed', warrantyDays: 180, durationMin: 45, modes: ['doorstep', 'workshop', 'pickup_repair'] },
  { code: 'charging_port_repair', name: 'Charging Port Repair', componentCode: 'charging_port', minSkillLevel: 3, pricingMode: 'range', warrantyDays: 90, durationMin: 60, modes: ['doorstep', 'workshop', 'pickup_repair'] },
  { code: 'wireless_charging_repair', name: 'Wireless Charging Repair', componentCode: 'wireless_coil', minSkillLevel: 3, pricingMode: 'range', warrantyDays: 90, durationMin: 60, modes: ['workshop', 'pickup_repair'] },
  { code: 'speaker_replacement', name: 'Speaker Replacement', componentCode: 'speaker', minSkillLevel: 2, pricingMode: 'fixed', warrantyDays: 90, durationMin: 45, modes: ['doorstep', 'workshop'] },
  { code: 'earpiece_replacement', name: 'Earpiece Replacement', componentCode: 'earpiece', minSkillLevel: 2, pricingMode: 'fixed', warrantyDays: 90, durationMin: 45, modes: ['doorstep', 'workshop'] },
  { code: 'microphone_repair', name: 'Microphone Repair', componentCode: 'microphone', minSkillLevel: 3, pricingMode: 'range', warrantyDays: 90, durationMin: 60, modes: ['doorstep', 'workshop'] },
  { code: 'camera_replacement', name: 'Camera Module Replacement', componentCode: 'camera_module', minSkillLevel: 3, pricingMode: 'range', warrantyDays: 90, durationMin: 60, modes: ['doorstep', 'workshop', 'pickup_repair'] },
  { code: 'camera_glass_replacement', name: 'Camera Glass Replacement', componentCode: 'camera_glass', minSkillLevel: 2, pricingMode: 'fixed', warrantyDays: 60, durationMin: 40, modes: ['doorstep', 'workshop'] },
  { code: 'back_glass_replacement', name: 'Back Glass Replacement', componentCode: 'back_glass', minSkillLevel: 3, pricingMode: 'range', warrantyDays: 60, durationMin: 90, modes: ['workshop', 'pickup_repair'] },
  { code: 'back_panel_replacement', name: 'Back Panel Replacement', componentCode: 'back_panel', minSkillLevel: 2, pricingMode: 'range', warrantyDays: 60, durationMin: 60, modes: ['workshop', 'pickup_repair'] },
  { code: 'housing_replacement', name: 'Frame / Housing Replacement', componentCode: 'housing', minSkillLevel: 4, pricingMode: 'diagnosis_required', warrantyDays: 60, durationMin: 180, modes: ['workshop', 'pickup_repair'] },
  { code: 'button_flex_repair', name: 'Power / Volume Button Repair', componentCode: 'button_flex', minSkillLevel: 3, pricingMode: 'range', warrantyDays: 90, durationMin: 60, modes: ['doorstep', 'workshop'] },
  { code: 'sim_tray_replacement', name: 'SIM Tray Replacement', componentCode: 'sim_tray', minSkillLevel: 1, pricingMode: 'fixed', warrantyDays: 30, durationMin: 20, modes: ['doorstep', 'workshop'] },
  { code: 'vibration_motor_replacement', name: 'Vibration Motor Replacement', componentCode: 'vibration_motor', minSkillLevel: 2, pricingMode: 'fixed', warrantyDays: 90, durationMin: 45, modes: ['doorstep', 'workshop'] },
  { code: 'port_cleaning', name: 'Port & Grille Deep Cleaning', componentCode: null, minSkillLevel: 1, pricingMode: 'fixed', warrantyDays: 0, durationMin: 30, modes: ['doorstep', 'workshop'] },
  { code: 'software_flash', name: 'Software Flashing & OS Recovery', componentCode: null, minSkillLevel: 2, pricingMode: 'fixed', warrantyDays: 30, durationMin: 90, modes: ['doorstep', 'workshop', 'pickup_repair'] },
  { code: 'software_optimisation', name: 'Software Optimisation', componentCode: null, minSkillLevel: 1, pricingMode: 'fixed', warrantyDays: 15, durationMin: 45, modes: ['doorstep', 'workshop'] },
  { code: 'data_transfer_service', name: 'Data Transfer & Backup', componentCode: null, minSkillLevel: 1, pricingMode: 'fixed', warrantyDays: 0, durationMin: 60, modes: ['doorstep', 'workshop'] },
  { code: 'liquid_damage_treatment', name: 'Liquid Damage Treatment', componentCode: null, minSkillLevel: 4, pricingMode: 'diagnosis_required', warrantyDays: 30, durationMin: 240, modes: ['workshop', 'pickup_repair'] },
  { code: 'power_ic_repair', name: 'Power IC Micro-soldering', componentCode: 'power_ic', minSkillLevel: 4, pricingMode: 'diagnosis_required', warrantyDays: 60, durationMin: 240, modes: ['workshop', 'pickup_repair'] },
  { code: 'motherboard_repair', name: 'Motherboard IC Repair', componentCode: 'motherboard', minSkillLevel: 4, pricingMode: 'diagnosis_required', warrantyDays: 60, durationMin: 300, modes: ['workshop', 'pickup_repair'] },
  { code: 'data_recovery', name: 'Data Recovery', componentCode: null, minSkillLevel: 4, pricingMode: 'diagnosis_required', warrantyDays: 0, durationMin: 300, modes: ['workshop', 'pickup_repair'] },
];

/* ─── §13 Part quality grades ──────────────────────────────────────────── */

const PART_QUALITIES = [
  { code: 'oem', name: 'OEM / Genuine', isGenuine: true, rank: 30, defaultWarrantyDays: 180, description: 'Sourced through the manufacturer channel.' },
  { code: 'premium', name: 'Premium Compatible', isGenuine: false, rank: 20, defaultWarrantyDays: 90, description: 'High-grade aftermarket part. Not manufacturer-supplied.' },
  { code: 'standard', name: 'Standard Compatible', isGenuine: false, rank: 10, defaultWarrantyDays: 30, description: 'Budget aftermarket part. Not manufacturer-supplied.' },
];

/* ─── §16 Skill levels ─────────────────────────────────────────────────── */

const SKILL_LEVELS = [
  { level: 1, name: 'Level 1 — Basic', description: 'Cleaning, SIM tray, accessories, basic software.', requiresVerification: false },
  { level: 2, name: 'Level 2 — Component', description: 'Battery, speaker, earpiece and similar module swaps.', requiresVerification: false },
  { level: 3, name: 'Level 3 — Advanced', description: 'Screen, camera, charging port, button flex repairs.', requiresVerification: true },
  { level: 4, name: 'Level 4 — Micro-soldering', description: 'Motherboard, IC-level work, liquid damage, data recovery.', requiresVerification: true },
];

/* ─── §27 QA checklists ────────────────────────────────────────────────── */

const QA_CHECKLISTS = [
  {
    code: 'mobile_standard',
    name: 'Standard Mobile QA',
    stage: 'both',
    repairCodes: [],
    items: [
      { code: 'display', label: 'Display renders correctly, no lines or dead spots', required: true, order: 1 },
      { code: 'touch', label: 'Touch responds across the whole panel', required: true, order: 2 },
      { code: 'front_camera', label: 'Front camera opens and captures', required: true, order: 3 },
      { code: 'rear_camera', label: 'Rear camera opens and captures', required: true, order: 4 },
      { code: 'flash', label: 'Flash fires', required: false, order: 5 },
      { code: 'speaker', label: 'Loudspeaker audible and undistorted', required: true, order: 6 },
      { code: 'earpiece', label: 'Earpiece audible on a call', required: true, order: 7 },
      { code: 'microphone', label: 'Microphone records clearly', required: true, order: 8 },
      { code: 'charging', label: 'Device charges over cable', required: true, order: 9 },
      { code: 'wifi', label: 'Wi-Fi connects', required: true, order: 10 },
      { code: 'bluetooth', label: 'Bluetooth pairs', required: false, order: 11 },
      { code: 'network', label: 'SIM registers on network', required: true, order: 12 },
      { code: 'buttons', label: 'Power and volume buttons respond', required: true, order: 13 },
      { code: 'biometrics', label: 'Fingerprint / face unlock works', required: false, order: 14 },
      { code: 'sealing', label: 'Device reassembled, no gaps or loose frame', required: true, order: 15, requiresPowerOn: false },
    ],
  },
];

module.exports = {
  VERTICAL,
  BRANDS,
  PROBLEM_CATEGORIES,
  PROBLEMS,
  REPAIRS,
  PART_QUALITIES,
  SKILL_LEVELS,
  QA_CHECKLISTS,
};
