/**
 * Photos of repair problems, by catalog code.
 *
 * Files live in the global assets folder (assets/web/problems/<vertical>,
 * served at /problems/<vertical>), 480px webp, about 20KB each. A picture an
 * admin uploads for a problem or heading always wins; these fill the rest so
 * the catalog looks deliberate without anyone uploading 60 photos.
 */
const PHOTOS = {
  mobile: new Set(['app_crashing', 'autofocus_failure', 'back_glass_broken', 'back_panel_damaged', 'backup_restore', 'battery_draining_fast', 'battery_not_charging', 'battery_percentage_jumping', 'battery_swelling', 'black_display', 'bluetooth_problem', 'blurry_camera', 'boot_loop', 'broken_glass_display_ok', 'cable_not_detecting', 'call_microphone_issue', 'camera_glass_broken', 'camera_not_opening', 'camera_shaking', 'charging_port_damaged', 'cracked_screen', 'data_transfer', 'dead_pixels', 'display_dimming', 'display_flickering', 'display_touch_failure', 'earpiece_not_working', 'factory_reset', 'fast_charging_not_working', 'flash_not_working', 'frame_housing_damage', 'front_camera_failure', 'ghost_touch', 'gps_problem', 'green_pink_line', 'loose_charging_port', 'loudspeaker_distortion', 'microphone_not_working', 'network_signal_problem', 'nfc_problem', 'phone_freezing', 'phone_overheating', 'phone_slow', 'phone_wont_turn_on', 'power_button_issue', 'random_shutdown', 'screen_burn_in', 'sim_not_detected', 'sim_tray_issue', 'slow_charging', 'software_update_failure', 'speaker_low_muffled', 'speaker_not_working', 'storage_issue', 'touch_not_working', 'vibration_motor_issue', 'volume_button_issue', 'wifi_problem', 'wireless_charging_failure']),
};

/** The photo that stands for a whole heading (Display, Camera…). */
const COVERS = {
  mobile: {
    display: 'cracked_screen',
    battery_power: 'battery_swelling',
    charging: 'charging_port_damaged',
    audio: 'speaker_not_working',
    camera: 'camera_glass_broken',
    physical: 'back_glass_broken',
    connectivity: 'network_signal_problem',
    software: 'phone_slow',
  },
};

/** Service codes and booking-flow names that mean the same vertical. */
const VERTICAL = { mobile: 'mobile', mobile_repair: 'mobile' };

const url = (v, code) => (PHOTOS[v]?.has(code) ? `/problems/${v}/${code}.webp` : null);

/** A problem's picture: its own upload, else ours, else null. */
export function problemPhoto(vertical, problem) {
  if (problem?.imageUrl) return problem.imageUrl;
  return url(VERTICAL[vertical], problem?.code);
}

/** A heading's picture: its own upload, its cover, else any of its problems'. */
export function categoryPhoto(vertical, category) {
  if (category?.imageUrl) return category.imageUrl;
  const v = VERTICAL[vertical];
  if (!v) return null;
  const cover = url(v, COVERS[v]?.[category?.code]);
  if (cover) return cover;
  for (const p of category?.problems || []) {
    const u = url(v, p.code);
    if (u) return u;
  }
  return null;
}
