/**
 * Laptop vertical seed data.
 *
 * Everything here is DEFAULT CONTENT, not application logic — admin can edit,
 * archive or replace any of it without a deploy (§1). The engine that consumes
 * it is the same one mobile uses; only this file differs (§91).
 *
 * Deliberately absent: a fabricated model catalog. §90 says not to invent model
 * data, and inventing thousands of laptop SKUs would be worse than an empty
 * catalog — a wrong model produces a wrong part. Models arrive through admin
 * entry or customer identification requests instead.
 */

const VERTICAL = 'laptop';

/* ─── Brands (§4) ──────────────────────────────────────────────────────── */

const BRANDS = [
  { code: 'hp', name: 'HP', sortOrder: 1 },
  { code: 'lenovo', name: 'Lenovo', sortOrder: 2 },
  { code: 'dell', name: 'Dell', sortOrder: 3 },
  { code: 'asus', name: 'ASUS', sortOrder: 4 },
  { code: 'acer', name: 'Acer', sortOrder: 5 },
  { code: 'apple-laptop', name: 'Apple / MacBook', sortOrder: 6 },
  { code: 'msi', name: 'MSI', sortOrder: 7 },
  { code: 'microsoft', name: 'Microsoft Surface', sortOrder: 8 },
  { code: 'samsung-laptop', name: 'Samsung', sortOrder: 9 },
  { code: 'lg', name: 'LG', sortOrder: 10 },
  { code: 'huawei', name: 'Huawei', sortOrder: 11 },
  { code: 'infinix-laptop', name: 'Infinix', sortOrder: 12 },
  { code: 'xiaomi-laptop', name: 'Xiaomi', sortOrder: 13 },
  { code: 'realme-laptop', name: 'realme', sortOrder: 14 },
  { code: 'razer', name: 'Razer', sortOrder: 15 },
  { code: 'gigabyte', name: 'Gigabyte / AORUS', sortOrder: 16 },
];

/* ─── Product types (§6) ───────────────────────────────────────────────── */

const PRODUCT_TYPES = [
  { code: 'laptop', name: 'Laptop', displayOrder: 1, isPopular: true },
  { code: 'gaming_laptop', name: 'Gaming Laptop', displayOrder: 2, isPopular: true },
  { code: 'macbook', name: 'MacBook', displayOrder: 3, isPopular: true },
  { code: 'business_laptop', name: 'Business Laptop', displayOrder: 4 },
  { code: 'ultrabook', name: 'Ultrabook', displayOrder: 5 },
  { code: 'convertible', name: '2-in-1 / Convertible', displayOrder: 6 },
  { code: 'chromebook', name: 'Chromebook', displayOrder: 7 },
  { code: 'surface', name: 'Surface Device', displayOrder: 8 },
];

/* ─── Problem taxonomy (§8) ────────────────────────────────────────────── */

const PROBLEM_CATEGORIES = [
  { code: 'display', name: 'Display', icon: 'monitor', displayOrder: 1 },
  { code: 'battery_power', name: 'Battery & Power', icon: 'battery', displayOrder: 2 },
  { code: 'charging', name: 'Charging', icon: 'plug', displayOrder: 3 },
  { code: 'keyboard_touchpad', name: 'Keyboard & Touchpad', icon: 'keyboard', displayOrder: 4 },
  { code: 'body_hinge', name: 'Body & Hinge', icon: 'laptop', displayOrder: 5 },
  { code: 'audio', name: 'Audio', icon: 'volume', displayOrder: 6 },
  { code: 'camera', name: 'Camera', icon: 'camera', displayOrder: 7 },
  { code: 'storage', name: 'Storage', icon: 'hard-drive', displayOrder: 8 },
  { code: 'performance', name: 'Performance', icon: 'cpu', displayOrder: 9 },
  { code: 'software', name: 'Software', icon: 'settings', displayOrder: 10 },
  { code: 'connectivity', name: 'Connectivity', icon: 'wifi', displayOrder: 11 },
  { code: 'overheating', name: 'Overheating', icon: 'thermometer', displayOrder: 12 },
  { code: 'advanced_hardware', name: 'Advanced Hardware', icon: 'chip', displayOrder: 13 },
  { code: 'liquid_damage', name: 'Liquid Damage', icon: 'droplet', displayOrder: 14 },
  { code: 'data_recovery', name: 'Data Recovery', icon: 'database', displayOrder: 15 },
  { code: 'upgrade', name: 'Upgrade', icon: 'trending-up', displayOrder: 16 },
  { code: 'maintenance', name: 'Maintenance', icon: 'tool', displayOrder: 17 },
];

/**
 * The 175 seeded symptoms.
 *
 * `requiresDiagnosis` marks the ones that genuinely cannot be priced remotely —
 * board faults, liquid damage, data recovery. Quoting those from a dropdown
 * would be a number invented before anyone opened the machine (§30C).
 *
 * `candidates` are POSSIBLE repairs, never a decision. Several symptoms map to
 * four or five candidates precisely because the symptom does not identify the
 * fault (§10) — the diagnostic tree narrows them.
 */
const P = (code, name, categoryCode, candidates = [], opts = {}) => ({
  code, name, categoryCode, candidateRepairCodes: candidates, ...opts,
});

const PROBLEMS = [
  // ── Display ───────────────────────────────────────────────────────────
  P('lt_cracked_screen', 'Cracked screen', 'display', ['lt_screen_replacement'], { isPopular: true }),
  P('lt_broken_screen', 'Broken screen', 'display', ['lt_screen_replacement']),
  P('lt_black_screen', 'Black screen', 'display', ['lt_screen_replacement', 'lt_display_cable_repair', 'lt_motherboard_repair'], { severity: 'high' }),
  P('lt_screen_not_turning_on', 'Screen not turning on', 'display', ['lt_screen_replacement', 'lt_display_cable_repair', 'lt_motherboard_repair'], { severity: 'high' }),
  P('lt_flickering_display', 'Flickering display', 'display', ['lt_screen_replacement', 'lt_display_cable_repair', 'lt_driver_installation'], { isPopular: true }),
  P('lt_horizontal_lines', 'Horizontal lines', 'display', ['lt_screen_replacement', 'lt_display_cable_repair']),
  P('lt_vertical_lines', 'Vertical lines', 'display', ['lt_screen_replacement', 'lt_display_cable_repair']),
  P('lt_dead_pixels', 'Dead pixels', 'display', ['lt_screen_replacement']),
  P('lt_white_screen', 'White screen', 'display', ['lt_screen_replacement', 'lt_display_cable_repair']),
  P('lt_dim_display', 'Dim display', 'display', ['lt_screen_replacement', 'lt_backlight_repair']),
  P('lt_backlight_not_working', 'Backlight not working', 'display', ['lt_backlight_repair', 'lt_screen_replacement']),
  P('lt_display_color_issue', 'Display colour issue', 'display', ['lt_screen_replacement', 'lt_driver_installation']),
  P('lt_screen_spots', 'Screen has spots', 'display', ['lt_screen_replacement']),
  P('lt_screen_intermittent', 'Screen intermittently turns off', 'display', ['lt_display_cable_repair', 'lt_hinge_repair', 'lt_screen_replacement']),
  P('lt_external_works_internal_not', 'External monitor works but laptop screen does not', 'display', ['lt_screen_replacement', 'lt_display_cable_repair']),
  P('lt_touchscreen_not_working', 'Touchscreen not working', 'display', ['lt_screen_replacement', 'lt_driver_installation']),
  P('lt_ghost_touch', 'Ghost touch', 'display', ['lt_screen_replacement']),
  P('lt_bezel_damaged', 'Screen bezel/frame damaged', 'display', ['lt_bezel_replacement']),
  P('lt_display_hinge_damaged', 'Display hinge area damaged', 'display', ['lt_hinge_repair'], { severity: 'high' }),

  // ── Battery & Power ───────────────────────────────────────────────────
  P('lt_battery_draining', 'Battery draining fast', 'battery_power', ['lt_battery_replacement'], { isPopular: true }),
  P('lt_battery_not_charging', 'Battery not charging', 'battery_power', ['lt_battery_replacement', 'lt_charging_port_repair', 'lt_motherboard_repair']),
  P('lt_battery_stuck_pct', 'Battery stuck at percentage', 'battery_power', ['lt_battery_replacement']),
  P('lt_battery_not_detected', 'Battery not detected', 'battery_power', ['lt_battery_replacement', 'lt_motherboard_repair']),
  P('lt_works_only_on_charger', 'Laptop works only on charger', 'battery_power', ['lt_battery_replacement']),
  P('lt_random_shutdown', 'Laptop shuts down randomly', 'battery_power', ['lt_battery_replacement', 'lt_thermal_service', 'lt_motherboard_repair'], { severity: 'high' }),
  P('lt_battery_swelling', 'Battery swelling', 'battery_power', ['lt_battery_replacement'], { severity: 'critical' }),
  P('lt_overheating_power', 'Laptop overheating', 'battery_power', ['lt_thermal_service', 'lt_fan_replacement'], { isPopular: true }),
  P('lt_wont_turn_on', 'Laptop will not turn on', 'battery_power', ['lt_battery_replacement', 'lt_adapter_replacement', 'lt_power_button_repair', 'lt_motherboard_repair'], { requiresDiagnosis: true, severity: 'critical', isPopular: true }),
  P('lt_turns_on_shuts_off', 'Laptop turns on and immediately shuts down', 'battery_power', ['lt_battery_replacement', 'lt_thermal_service', 'lt_motherboard_repair'], { requiresDiagnosis: true, severity: 'high' }),
  P('lt_power_button', 'Power button not working', 'battery_power', ['lt_power_button_repair']),
  P('lt_sleep_wake', 'Sleep/wake problem', 'battery_power', ['lt_driver_installation', 'lt_os_repair']),

  // ── Charging ──────────────────────────────────────────────────────────
  P('lt_charger_not_working', 'Charger not working', 'charging', ['lt_adapter_replacement']),
  P('lt_charging_port_damaged', 'Charging port damaged', 'charging', ['lt_charging_port_repair'], { severity: 'high' }),
  P('lt_loose_charging_port', 'Loose charging port', 'charging', ['lt_charging_port_repair']),
  P('lt_intermittent_charging', 'Intermittent charging', 'charging', ['lt_charging_port_repair', 'lt_adapter_replacement']),
  P('lt_adapter_overheating', 'Adapter overheating', 'charging', ['lt_adapter_replacement'], { severity: 'high' }),
  P('lt_wrong_charger_detected', 'Wrong charger detected', 'charging', ['lt_adapter_replacement', 'lt_bios_service']),
  P('lt_usbc_charging_not_working', 'USB-C charging not working', 'charging', ['lt_charging_port_repair', 'lt_motherboard_repair']),
  P('lt_not_charging_usbc', 'Laptop not charging through USB-C', 'charging', ['lt_charging_port_repair']),
  P('lt_charging_angle', 'Charging only at certain angle', 'charging', ['lt_charging_port_repair']),

  // ── Keyboard & Touchpad ───────────────────────────────────────────────
  P('lt_keyboard_not_working', 'Keyboard not working', 'keyboard_touchpad', ['lt_keyboard_replacement'], { isPopular: true }),
  P('lt_single_key', 'Individual key not working', 'keyboard_touchpad', ['lt_keycap_repair', 'lt_keyboard_replacement']),
  P('lt_multiple_keys', 'Multiple keys not working', 'keyboard_touchpad', ['lt_keyboard_replacement']),
  P('lt_wrong_characters', 'Keyboard typing wrong characters', 'keyboard_touchpad', ['lt_keyboard_replacement', 'lt_driver_installation']),
  P('lt_stuck_keys', 'Keyboard stuck keys', 'keyboard_touchpad', ['lt_keycap_repair', 'lt_keyboard_cleaning']),
  P('lt_keyboard_backlight', 'Keyboard backlight not working', 'keyboard_touchpad', ['lt_keyboard_replacement']),
  P('lt_trackpad_not_working', 'Trackpad not working', 'keyboard_touchpad', ['lt_trackpad_replacement', 'lt_driver_installation']),
  P('lt_trackpad_click', 'Trackpad clicking problem', 'keyboard_touchpad', ['lt_trackpad_replacement']),
  P('lt_trackpad_cursor', 'Trackpad cursor moving randomly', 'keyboard_touchpad', ['lt_trackpad_replacement', 'lt_driver_installation']),
  P('lt_trackpad_damaged', 'Trackpad physically damaged', 'keyboard_touchpad', ['lt_trackpad_replacement']),
  P('lt_palmrest_damage', 'Palm-rest damage', 'keyboard_touchpad', ['lt_palmrest_replacement']),

  // ── Body & Hinge ──────────────────────────────────────────────────────
  P('lt_hinge_broken', 'Hinge broken', 'body_hinge', ['lt_hinge_repair'], { severity: 'high', isPopular: true }),
  P('lt_hinge_stiff', 'Hinge stiff', 'body_hinge', ['lt_hinge_repair']),
  P('lt_hinge_loose', 'Hinge loose', 'body_hinge', ['lt_hinge_repair']),
  P('lt_frame_separating', 'Screen frame separating', 'body_hinge', ['lt_hinge_repair', 'lt_bezel_replacement']),
  P('lt_body_cracked', 'Laptop body cracked', 'body_hinge', ['lt_body_panel_replacement']),
  P('lt_bottom_panel', 'Bottom panel damaged', 'body_hinge', ['lt_body_panel_replacement']),
  P('lt_top_cover', 'Top cover damaged', 'body_hinge', ['lt_body_panel_replacement']),
  P('lt_palmrest_damaged_body', 'Palm rest damaged', 'body_hinge', ['lt_palmrest_replacement']),
  P('lt_screw_thread', 'Screw/thread damage', 'body_hinge', ['lt_body_panel_replacement']),
  P('lt_wont_close', 'Laptop will not close properly', 'body_hinge', ['lt_hinge_repair']),
  P('lt_wont_open', 'Laptop will not open properly', 'body_hinge', ['lt_hinge_repair']),

  // ── Audio ─────────────────────────────────────────────────────────────
  P('lt_speaker_not_working', 'Speaker not working', 'audio', ['lt_speaker_replacement', 'lt_driver_installation']),
  P('lt_speaker_low', 'Speaker low', 'audio', ['lt_speaker_replacement', 'lt_driver_installation']),
  P('lt_speaker_distorted', 'Speaker distorted', 'audio', ['lt_speaker_replacement']),
  P('lt_one_speaker', 'One speaker not working', 'audio', ['lt_speaker_replacement']),
  P('lt_headphone_jack', 'Headphone jack not working', 'audio', ['lt_audio_jack_repair']),
  P('lt_mic_not_working', 'Microphone not working', 'audio', ['lt_microphone_repair', 'lt_driver_installation']),
  P('lt_mic_low', 'Microphone low', 'audio', ['lt_microphone_repair', 'lt_driver_installation']),
  P('lt_mic_not_detected', 'Internal microphone not detected', 'audio', ['lt_microphone_repair', 'lt_driver_installation']),

  // ── Camera ────────────────────────────────────────────────────────────
  P('lt_webcam_not_working', 'Webcam not working', 'camera', ['lt_webcam_replacement', 'lt_driver_installation']),
  P('lt_webcam_not_detected', 'Webcam not detected', 'camera', ['lt_webcam_replacement', 'lt_driver_installation']),
  P('lt_camera_blurry', 'Camera blurry', 'camera', ['lt_webcam_replacement']),
  P('lt_camera_black', 'Camera black screen', 'camera', ['lt_webcam_replacement', 'lt_driver_installation']),
  P('lt_camera_driver', 'Camera driver issue', 'camera', ['lt_driver_installation']),
  P('lt_privacy_shutter', 'Privacy shutter issue', 'camera', ['lt_webcam_replacement']),

  // ── Storage ───────────────────────────────────────────────────────────
  P('lt_ssd_failure', 'SSD failure', 'storage', ['lt_ssd_replacement', 'lt_data_recovery'], { severity: 'high' }),
  P('lt_hdd_failure', 'HDD failure', 'storage', ['lt_hdd_replacement', 'lt_data_recovery'], { severity: 'high' }),
  P('lt_storage_not_detected', 'Storage not detected', 'storage', ['lt_ssd_replacement', 'lt_motherboard_repair'], { severity: 'high' }),
  P('lt_slow_storage', 'Slow storage', 'storage', ['lt_ssd_upgrade', 'lt_os_repair']),
  P('lt_bad_sectors', 'Bad sectors', 'storage', ['lt_ssd_replacement', 'lt_data_recovery']),
  P('lt_boot_drive_failure', 'Boot drive failure', 'storage', ['lt_ssd_replacement', 'lt_os_installation'], { severity: 'high' }),
  P('lt_ssd_upgrade_p', 'SSD upgrade', 'storage', ['lt_ssd_upgrade'], { isPopular: true }),
  P('lt_hdd_upgrade_p', 'HDD upgrade', 'storage', ['lt_hdd_replacement']),
  P('lt_storage_upgrade_p', 'Storage upgrade', 'storage', ['lt_ssd_upgrade']),
  P('lt_data_migration_p', 'Data migration', 'storage', ['lt_data_migration']),

  // ── Performance ───────────────────────────────────────────────────────
  P('lt_ram_failure', 'RAM failure', 'performance', ['lt_ram_replacement'], { severity: 'high' }),
  P('lt_ram_not_detected', 'RAM not detected', 'performance', ['lt_ram_replacement', 'lt_motherboard_repair']),
  P('lt_ram_upgrade_p', 'RAM upgrade', 'performance', ['lt_ram_upgrade'], { isPopular: true }),
  P('lt_laptop_slow', 'Laptop slow', 'performance', ['lt_os_repair', 'lt_ssd_upgrade', 'lt_ram_upgrade', 'lt_thermal_service'], { isPopular: true }),
  P('lt_freezing', 'Laptop freezing', 'performance', ['lt_os_repair', 'lt_ram_replacement', 'lt_thermal_service']),
  P('lt_high_memory', 'High memory usage', 'performance', ['lt_os_repair', 'lt_ram_upgrade']),
  P('lt_random_crashes', 'Random crashes', 'performance', ['lt_ram_replacement', 'lt_os_repair', 'lt_thermal_service']),
  P('lt_blue_screen_p', 'Blue screen', 'performance', ['lt_os_repair', 'lt_ram_replacement', 'lt_ssd_replacement'], { severity: 'high' }),
  P('lt_performance_degradation', 'Performance degradation', 'performance', ['lt_thermal_service', 'lt_os_repair', 'lt_ssd_upgrade']),

  // ── Software ──────────────────────────────────────────────────────────
  P('lt_windows_not_booting', 'Windows not booting', 'software', ['lt_os_repair', 'lt_os_installation'], { severity: 'high' }),
  P('lt_windows_corrupted', 'Windows corrupted', 'software', ['lt_os_repair', 'lt_os_installation']),
  P('lt_boot_loop', 'Boot loop', 'software', ['lt_os_repair', 'lt_os_installation'], { severity: 'high' }),
  P('lt_bsod', 'Blue Screen of Death', 'software', ['lt_os_repair', 'lt_ram_replacement'], { severity: 'high' }),
  P('lt_driver_problems', 'Driver problems', 'software', ['lt_driver_installation']),
  P('lt_windows_update_failure', 'Windows update failure', 'software', ['lt_os_repair']),
  P('lt_software_crashing', 'Software crashing', 'software', ['lt_os_repair', 'lt_driver_installation']),
  P('lt_freezing_sw', 'Laptop freezing (software)', 'software', ['lt_os_repair']),
  P('lt_factory_reset', 'Factory reset', 'software', ['lt_os_installation']),
  P('lt_windows_installation', 'Windows installation', 'software', ['lt_os_installation']),
  P('lt_os_installation_p', 'OS installation', 'software', ['lt_os_installation']),
  P('lt_driver_installation_p', 'Driver installation', 'software', ['lt_driver_installation']),
  P('lt_bios_update', 'BIOS update issue', 'software', ['lt_bios_service'], { severity: 'high' }),
  P('lt_bios_password', 'BIOS password issue', 'software', ['lt_bios_service'], { requiresDiagnosis: true }),
  P('lt_software_cleanup', 'Software cleanup', 'software', ['lt_os_repair']),
  P('lt_malware', 'Malware/virus cleanup', 'software', ['lt_virus_removal'], { isPopular: true }),
  P('lt_startup_problems', 'Startup problems', 'software', ['lt_os_repair']),

  // ── Connectivity ──────────────────────────────────────────────────────
  P('lt_wifi_not_working', 'Wi-Fi not working', 'connectivity', ['lt_wifi_card_replacement', 'lt_driver_installation'], { isPopular: true }),
  P('lt_wifi_disconnecting', 'Wi-Fi disconnecting', 'connectivity', ['lt_wifi_card_replacement', 'lt_driver_installation']),
  P('lt_bluetooth', 'Bluetooth not working', 'connectivity', ['lt_wifi_card_replacement', 'lt_driver_installation']),
  P('lt_ethernet', 'Ethernet not working', 'connectivity', ['lt_port_repair', 'lt_driver_installation']),
  P('lt_usb_port', 'USB port not working', 'connectivity', ['lt_port_repair', 'lt_motherboard_repair']),
  P('lt_hdmi', 'HDMI not working', 'connectivity', ['lt_port_repair', 'lt_driver_installation']),
  P('lt_displayport', 'DisplayPort not working', 'connectivity', ['lt_port_repair']),
  P('lt_thunderbolt', 'Thunderbolt/USB-C issue', 'connectivity', ['lt_port_repair', 'lt_motherboard_repair']),
  P('lt_sd_reader', 'SD card reader not working', 'connectivity', ['lt_port_repair']),

  // ── Overheating ───────────────────────────────────────────────────────
  P('lt_overheating', 'Laptop overheating', 'overheating', ['lt_thermal_service', 'lt_fan_replacement'], { isPopular: true }),
  P('lt_fan_not_working', 'Fan not working', 'overheating', ['lt_fan_replacement'], { severity: 'high' }),
  P('lt_fan_noisy', 'Fan noisy', 'overheating', ['lt_fan_replacement', 'lt_internal_cleaning']),
  P('lt_fan_continuous', 'Fan running continuously', 'overheating', ['lt_thermal_service', 'lt_internal_cleaning']),
  P('lt_thermal_throttling', 'Thermal throttling', 'overheating', ['lt_thermal_service']),
  P('lt_heat_shutdown', 'Laptop shutting down from heat', 'overheating', ['lt_thermal_service', 'lt_fan_replacement'], { severity: 'high' }),
  P('lt_thermal_paste', 'Thermal paste replacement', 'overheating', ['lt_thermal_service']),
  P('lt_dust_cleaning', 'Internal dust cleaning', 'overheating', ['lt_internal_cleaning']),
  P('lt_cooling_service', 'Cooling system service', 'overheating', ['lt_thermal_service']),

  // ── Advanced hardware — none of these can be priced remotely ──────────
  P('lt_motherboard_failure', 'Motherboard failure', 'advanced_hardware', ['lt_motherboard_repair'], { requiresDiagnosis: true, severity: 'critical' }),
  P('lt_completely_dead', 'Laptop completely dead', 'advanced_hardware', ['lt_motherboard_repair', 'lt_adapter_replacement', 'lt_battery_replacement'], { requiresDiagnosis: true, severity: 'critical' }),
  P('lt_no_power', 'No power', 'advanced_hardware', ['lt_motherboard_repair', 'lt_adapter_replacement', 'lt_power_button_repair'], { requiresDiagnosis: true, severity: 'critical' }),
  P('lt_short_circuit', 'Short circuit', 'advanced_hardware', ['lt_motherboard_repair', 'lt_liquid_damage_treatment'], { requiresDiagnosis: true, severity: 'critical' }),
  P('lt_charging_ic', 'Charging IC issue', 'advanced_hardware', ['lt_motherboard_repair', 'lt_charging_port_repair'], { requiresDiagnosis: true, severity: 'high' }),
  P('lt_power_ic', 'Power IC issue', 'advanced_hardware', ['lt_motherboard_repair'], { requiresDiagnosis: true, severity: 'high' }),
  P('lt_bios_chip', 'BIOS chip issue', 'advanced_hardware', ['lt_bios_service', 'lt_motherboard_repair'], { requiresDiagnosis: true, severity: 'high' }),
  P('lt_component_repair', 'Component-level repair', 'advanced_hardware', ['lt_motherboard_repair'], { requiresDiagnosis: true, severity: 'high' }),
  P('lt_gpu_failure', 'GPU failure', 'advanced_hardware', ['lt_motherboard_repair'], { requiresDiagnosis: true, severity: 'critical' }),
  P('lt_cpu_board', 'CPU-related board issue', 'advanced_hardware', ['lt_motherboard_repair'], { requiresDiagnosis: true, severity: 'critical' }),
  P('lt_liquid_motherboard', 'Liquid-damaged motherboard', 'advanced_hardware', ['lt_liquid_damage_treatment', 'lt_motherboard_repair'], { requiresDiagnosis: true, severity: 'critical' }),
  P('lt_corrosion_adv', 'Corrosion', 'advanced_hardware', ['lt_liquid_damage_treatment', 'lt_motherboard_repair'], { requiresDiagnosis: true, severity: 'high' }),
  P('lt_chip_repair', 'Chip-level repair', 'advanced_hardware', ['lt_motherboard_repair'], { requiresDiagnosis: true, severity: 'high' }),

  // ── Liquid damage — always inspected first ────────────────────────────
  P('lt_water_spilled', 'Water spilled', 'liquid_damage', ['lt_liquid_damage_treatment', 'lt_internal_cleaning'], { requiresDiagnosis: true, severity: 'critical', isPopular: true }),
  P('lt_coffee_spill', 'Coffee/tea spill', 'liquid_damage', ['lt_liquid_damage_treatment', 'lt_internal_cleaning'], { requiresDiagnosis: true, severity: 'critical' }),
  P('lt_liquid_keyboard', 'Liquid inside keyboard', 'liquid_damage', ['lt_liquid_damage_treatment', 'lt_keyboard_replacement'], { requiresDiagnosis: true, severity: 'high' }),
  P('lt_liquid_motherboard_ld', 'Liquid inside motherboard', 'liquid_damage', ['lt_liquid_damage_treatment', 'lt_motherboard_repair'], { requiresDiagnosis: true, severity: 'critical' }),
  P('lt_corrosion_ld', 'Corrosion', 'liquid_damage', ['lt_liquid_damage_treatment'], { requiresDiagnosis: true, severity: 'high' }),
  P('lt_no_power_after_liquid', 'Laptop will not turn on after liquid', 'liquid_damage', ['lt_liquid_damage_treatment', 'lt_motherboard_repair'], { requiresDiagnosis: true, severity: 'critical' }),
  P('lt_keyboard_liquid', 'Keyboard liquid damage', 'liquid_damage', ['lt_liquid_damage_treatment', 'lt_keyboard_replacement'], { requiresDiagnosis: true, severity: 'high' }),
  P('lt_trackpad_liquid', 'Trackpad liquid damage', 'liquid_damage', ['lt_liquid_damage_treatment', 'lt_trackpad_replacement'], { requiresDiagnosis: true, severity: 'high' }),

  // ── Data recovery — outcome is never guaranteed ───────────────────────
  P('lt_data_recovery_p', 'Data recovery', 'data_recovery', ['lt_data_recovery', 'lt_data_migration'], { requiresDiagnosis: true, severity: 'high', isPopular: true }),
  P('lt_deleted_files', 'Deleted files', 'data_recovery', ['lt_data_recovery'], { requiresDiagnosis: true }),
  P('lt_failed_ssd_recovery', 'Failed SSD data recovery', 'data_recovery', ['lt_data_recovery', 'lt_ssd_replacement'], { requiresDiagnosis: true, severity: 'high' }),
  P('lt_failed_hdd_recovery', 'Failed HDD data recovery', 'data_recovery', ['lt_data_recovery', 'lt_hdd_replacement'], { requiresDiagnosis: true, severity: 'high' }),
  P('lt_wont_boot_data_needed', 'Laptop will not boot but data needed', 'data_recovery', ['lt_data_recovery', 'lt_os_repair'], { requiresDiagnosis: true, severity: 'high' }),
  P('lt_os_corrupt_data_needed', 'OS corrupted but data needed', 'data_recovery', ['lt_data_recovery', 'lt_os_repair'], { requiresDiagnosis: true }),
  P('lt_backup', 'Backup', 'data_recovery', ['lt_data_migration']),
  P('lt_data_transfer', 'Data transfer', 'data_recovery', ['lt_data_migration']),
  P('lt_drive_cloning', 'Drive cloning', 'data_recovery', ['lt_data_migration']),

  // ── Upgrades ──────────────────────────────────────────────────────────
  P('lt_ram_upgrade_u', 'RAM upgrade', 'upgrade', ['lt_ram_upgrade'], { isPopular: true }),
  P('lt_ssd_upgrade_u', 'SSD upgrade', 'upgrade', ['lt_ssd_upgrade'], { isPopular: true }),
  P('lt_hdd_to_ssd', 'HDD → SSD migration', 'upgrade', ['lt_ssd_upgrade', 'lt_data_migration']),
  P('lt_storage_expansion', 'Storage expansion', 'upgrade', ['lt_ssd_upgrade']),
  P('lt_wifi_upgrade', 'Wi-Fi card upgrade', 'upgrade', ['lt_wifi_card_replacement']),
  P('lt_battery_replacement_u', 'Battery replacement', 'upgrade', ['lt_battery_replacement']),
  P('lt_thermal_upgrade', 'Thermal upgrade/service', 'upgrade', ['lt_thermal_service']),
  P('lt_os_upgrade', 'Operating system upgrade', 'upgrade', ['lt_os_installation']),

  // ── Maintenance ───────────────────────────────────────────────────────
  P('lt_internal_cleaning_m', 'Internal cleaning', 'maintenance', ['lt_internal_cleaning'], { isPopular: true }),
  P('lt_fan_cleaning', 'Fan cleaning', 'maintenance', ['lt_internal_cleaning']),
  P('lt_thermal_paste_m', 'Thermal paste replacement', 'maintenance', ['lt_thermal_service']),
  P('lt_keyboard_cleaning_m', 'Keyboard cleaning', 'maintenance', ['lt_keyboard_cleaning']),
  P('lt_screen_cleaning', 'Screen cleaning', 'maintenance', ['lt_internal_cleaning']),
  P('lt_full_servicing', 'Full laptop servicing', 'maintenance', ['lt_full_service'], { isPopular: true }),
  P('lt_preventive_maintenance', 'Preventive maintenance', 'maintenance', ['lt_full_service']),
];

/* ─── Repairs (§13) ────────────────────────────────────────────────────── */

const D = 'doorstep', W = 'workshop', PU = 'pickup_repair', R = 'remote_support';

/**
 * Service modes per repair are a real operational claim, not a formality (§27).
 * Board work is workshop-only because it needs a bench, a microscope and hot
 * air; offering it doorstep would be a promise broken on arrival. Software work
 * is remote-capable because nothing physical has to change hands.
 */
const REPAIRS = [
  { code: 'lt_screen_replacement', name: 'Screen Replacement', pricingMode: 'range', minSkillLevel: 3, modes: [D, W, PU], durationMin: 75, warrantyDays: 180, component: 'lt_display' },
  { code: 'lt_backlight_repair', name: 'Backlight Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 120, warrantyDays: 90 },
  { code: 'lt_display_cable_repair', name: 'Display Cable Repair', pricingMode: 'range', minSkillLevel: 3, modes: [W, PU], durationMin: 90, warrantyDays: 90, component: 'lt_display_cable' },
  { code: 'lt_bezel_replacement', name: 'Bezel Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 45, warrantyDays: 90, component: 'lt_bezel' },
  { code: 'lt_hinge_repair', name: 'Hinge Repair', pricingMode: 'range', minSkillLevel: 3, modes: [W, PU], durationMin: 120, warrantyDays: 90, component: 'lt_hinge' },
  { code: 'lt_battery_replacement', name: 'Battery Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 40, warrantyDays: 365, component: 'lt_battery' },
  { code: 'lt_adapter_replacement', name: 'Charger / Adapter Replacement', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W, PU], durationMin: 15, warrantyDays: 180, component: 'lt_adapter' },
  { code: 'lt_charging_port_repair', name: 'Charging Port Repair', pricingMode: 'range', minSkillLevel: 4, modes: [W, PU], durationMin: 120, warrantyDays: 90, component: 'lt_charging_port' },
  { code: 'lt_power_button_repair', name: 'Power Button Repair', pricingMode: 'range', minSkillLevel: 3, modes: [W, PU], durationMin: 60, warrantyDays: 90 },
  { code: 'lt_keyboard_replacement', name: 'Keyboard Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 60, warrantyDays: 180, component: 'lt_keyboard' },
  { code: 'lt_keycap_repair', name: 'Keycap Repair', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W], durationMin: 20, warrantyDays: 30 },
  { code: 'lt_keyboard_cleaning', name: 'Keyboard Cleaning', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W], durationMin: 30, warrantyDays: 0 },
  { code: 'lt_trackpad_replacement', name: 'Trackpad Replacement', pricingMode: 'range', minSkillLevel: 3, modes: [W, PU], durationMin: 90, warrantyDays: 90, component: 'lt_trackpad' },
  { code: 'lt_palmrest_replacement', name: 'Palm Rest Replacement', pricingMode: 'range', minSkillLevel: 3, modes: [W, PU], durationMin: 90, warrantyDays: 90, component: 'lt_palmrest' },
  { code: 'lt_body_panel_replacement', name: 'Body Panel Replacement', pricingMode: 'range', minSkillLevel: 2, modes: [W, PU], durationMin: 60, warrantyDays: 90, component: 'lt_body_panel' },
  { code: 'lt_speaker_replacement', name: 'Speaker Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [W, PU], durationMin: 60, warrantyDays: 90, component: 'lt_speaker' },
  { code: 'lt_audio_jack_repair', name: 'Audio Jack Repair', pricingMode: 'range', minSkillLevel: 3, modes: [W, PU], durationMin: 75, warrantyDays: 90 },
  { code: 'lt_microphone_repair', name: 'Microphone Repair', pricingMode: 'range', minSkillLevel: 3, modes: [W, PU], durationMin: 60, warrantyDays: 90 },
  { code: 'lt_webcam_replacement', name: 'Webcam Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 60, warrantyDays: 90, component: 'lt_webcam' },
  { code: 'lt_ssd_replacement', name: 'SSD Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 40, warrantyDays: 365, component: 'lt_ssd' },
  { code: 'lt_ssd_upgrade', name: 'SSD Upgrade', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 45, warrantyDays: 365, component: 'lt_ssd' },
  { code: 'lt_hdd_replacement', name: 'HDD Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 45, warrantyDays: 365, component: 'lt_hdd' },
  { code: 'lt_ram_replacement', name: 'RAM Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 30, warrantyDays: 365, component: 'lt_ram' },
  { code: 'lt_ram_upgrade', name: 'RAM Upgrade', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 30, warrantyDays: 365, component: 'lt_ram' },
  { code: 'lt_wifi_card_replacement', name: 'Wi-Fi Card Replacement', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 45, warrantyDays: 180, component: 'lt_wifi_card' },
  { code: 'lt_port_repair', name: 'Port Repair', pricingMode: 'range', minSkillLevel: 4, modes: [W, PU], durationMin: 120, warrantyDays: 90 },
  { code: 'lt_fan_replacement', name: 'Fan Replacement', pricingMode: 'fixed', minSkillLevel: 3, modes: [W, PU], durationMin: 90, warrantyDays: 180, component: 'lt_fan' },
  { code: 'lt_thermal_service', name: 'Thermal Service', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 90, warrantyDays: 90 },
  { code: 'lt_internal_cleaning', name: 'Internal Cleaning', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W, PU], durationMin: 60, warrantyDays: 30 },
  { code: 'lt_full_service', name: 'Full Laptop Service', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 120, warrantyDays: 90 },
  { code: 'lt_os_installation', name: 'OS Installation', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W, PU, R], durationMin: 90, warrantyDays: 30 },
  { code: 'lt_os_repair', name: 'OS Repair', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W, PU, R], durationMin: 60, warrantyDays: 30 },
  { code: 'lt_driver_installation', name: 'Driver Installation', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W, R], durationMin: 45, warrantyDays: 30 },
  { code: 'lt_virus_removal', name: 'Virus & Malware Removal', pricingMode: 'fixed', minSkillLevel: 1, modes: [D, W, PU, R], durationMin: 60, warrantyDays: 30 },
  { code: 'lt_bios_service', name: 'BIOS Service', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 90, warrantyDays: 30 },
  { code: 'lt_data_migration', name: 'Data Migration', pricingMode: 'fixed', minSkillLevel: 2, modes: [D, W, PU], durationMin: 120, warrantyDays: 0 },
  { code: 'lt_data_recovery', name: 'Data Recovery', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 480, warrantyDays: 0 },
  { code: 'lt_motherboard_repair', name: 'Motherboard Repair', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 480, warrantyDays: 90 },
  { code: 'lt_liquid_damage_treatment', name: 'Liquid Damage Treatment', pricingMode: 'diagnosis_required', minSkillLevel: 4, modes: [W, PU], durationMin: 480, warrantyDays: 30 },
];

/* ─── Skill levels (§23) ───────────────────────────────────────────────── */

const SKILL_LEVELS = [
  { level: 1, name: 'Basic', description: 'Cleaning, software, basic maintenance', requiresVerification: false },
  { level: 2, name: 'Component', description: 'Battery, keyboard, RAM, SSD, basic replacement', requiresVerification: false },
  { level: 3, name: 'Advanced', description: 'Screen, charging, fan, camera, complex hardware', requiresVerification: true },
  { level: 4, name: 'Board-level', description: 'Motherboard, component-level, IC, liquid, data recovery', requiresVerification: true },
];

/* ─── QA checklists (§53) ──────────────────────────────────────────────── */

const QA_CHECKLISTS = [
  {
    code: 'lt_standard', name: 'Laptop Standard QA', stage: 'after', repairCodes: [],
    items: [
      { code: 'powers_on', label: 'Powers on and boots', required: true },
      { code: 'display', label: 'Display output correct across full panel', required: true },
      { code: 'keyboard', label: 'All keys register', required: true },
      { code: 'trackpad', label: 'Trackpad and click work', required: true },
      { code: 'charging', label: 'Charges and reports battery correctly', required: true },
      { code: 'wifi', label: 'Wi-Fi connects', required: true },
      { code: 'audio', label: 'Speakers and microphone work', required: false },
      { code: 'camera', label: 'Webcam works', required: false },
      { code: 'ports', label: 'USB and HDMI ports work', required: false },
      { code: 'thermals', label: 'Fan runs, temperatures normal under load', required: false },
      { code: 'no_new_damage', label: 'No new cosmetic damage', required: true },
      { code: 'screws', label: 'All screws refitted', required: true },
    ],
  },
  {
    code: 'lt_storage', name: 'Storage QA', stage: 'after', repairCodes: ['lt_ssd_replacement', 'lt_ssd_upgrade', 'lt_hdd_replacement', 'lt_data_migration'],
    items: [
      { code: 'detected', label: 'Drive detected at correct capacity', required: true },
      { code: 'boots', label: 'System boots from the drive', required: true },
      { code: 'smart', label: 'SMART health reported clean', required: true },
      { code: 'data_intact', label: 'Customer data present and openable', required: true },
      { code: 'speed', label: 'Read/write speed as expected', required: false },
    ],
  },
  {
    code: 'lt_ram', name: 'Memory QA', stage: 'after', repairCodes: ['lt_ram_replacement', 'lt_ram_upgrade'],
    items: [
      { code: 'detected', label: 'Full capacity detected in BIOS and OS', required: true },
      { code: 'stability', label: 'Passes a memory stability test', required: true },
      { code: 'no_bsod', label: 'No crashes under load', required: true },
    ],
  },
];

module.exports = {
  VERTICAL, BRANDS, PRODUCT_TYPES, PROBLEM_CATEGORIES, PROBLEMS,
  REPAIRS, SKILL_LEVELS, QA_CHECKLISTS,
};
