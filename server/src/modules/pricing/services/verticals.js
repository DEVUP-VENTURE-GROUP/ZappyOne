

/** Which pricing engine a service code belongs to. */

// Vertical routing — maps service codes to pricing engines

// DISABLED: Generic home/construction services (architecture preserved)
// const HOME_SERVICES = new Set(['plumbing','electrical','helper','carpenter','ac_repair','cleaning','painting']);
// const CONSTRUCTION_SERVICES = new Set(['mason']);

const MOBILE_SERVICES = new Set([
  'screen_replacement', 'battery_replacement', 'charging_issue',
  'speaker_mic_issue', 'microphone_issue', 'software_issue',
  'water_damage', 'camera_issue', 'data_recovery', 'device_not_turning_on',
]);

const LAPTOP_SERVICES = new Set([
  'laptop_slow', 'laptop_ssd_upgrade', 'laptop_ram_upgrade',
  'laptop_keyboard_issue', 'laptop_motherboard_issue', 'laptop_charging_issue',
  'laptop_screen_issue', 'laptop_virus_removal', 'laptop_data_recovery',
]);

const SMART_DEVICE_SERVICES = new Set([
  'smart_tv_install', 'smart_tv_repair', 'router_setup', 'router_troubleshoot',
  'cctv_install', 'cctv_repair', 'smart_lock_install', 'home_automation_setup',
]);

const VEHICLE_SERVICES = new Set([
  'puncture', 'bike_chain_issue', 'bike_brake_issue', 'bike_battery_issue',
  'bike_wash', 'bike_breakdown', 'bike_service',
  'car_wash', 'car_detailing', 'battery_jump_start', 'car_puncture',
  'car_breakdown', 'fuel_delivery', 'car_service',
  'commercial_emergency', 'commercial_scheduled_maintenance', 'fleet_support',
  'auto_repair', 'van_repair',
]);

// Towing is priced separately — base hookup fee + per-km on the TOW leg
// (pickup → destination), which is longer and costlier than a service visit.
const TOWING_SERVICES = new Set(['car_towing', 'bike_towing']);

// Tank & water cleaning — flat per-service visit pricing (crew + equipment).
const TANK_CLEANING_SERVICES = new Set([
  'water_tank_cleaning', 'overhead_tank_cleaning', 'underground_sump_cleaning',
  'sintex_tank_cleaning',
]);

const FAMILY_SERVICES = new Set([
  'medicine_pickup', 'hospital_companion', 'grocery_assistance',
  'bill_payment_assist', 'document_submission', 'home_visit_check',
  'elder_doctor_visit', 'elder_companion', 'elder_home_visit', 'elder_transport',
]);

const EVENT_SERVICES = new Set([
  'event_decorator', 'event_setup_crew', 'event_cleaning_crew',
  'event_helper', 'event_sound_crew', 'event_lighting_crew',
  'event_security_crew', 'event_birthday_setup', 'event_wedding_setup',
  'event_photography_assist', 'event_catering_assist',
]);

const PET_SERVICES = new Set([
  'pet_grooming', 'pet_walking', 'pet_transport',
  'pet_sitting', 'pet_vet_assist', 'pet_training_assist',
]);

module.exports = {
  MOBILE_SERVICES,
  LAPTOP_SERVICES,
  SMART_DEVICE_SERVICES,
  VEHICLE_SERVICES,
  TOWING_SERVICES,
  TANK_CLEANING_SERVICES,
  FAMILY_SERVICES,
  EVENT_SERVICES,
  PET_SERVICES,
};
