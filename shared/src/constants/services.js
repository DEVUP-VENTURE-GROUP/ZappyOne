/**
 * Single source of truth for all service types in the platform.
 * Used by Heatmap, Promos, worker skills, pricing, and anywhere a
 * service selector is needed. To add a new service, add it here only.
 */
export const SERVICE_SLUGS = [
  // Home services
  'electrical', 'plumbing', 'ac_repair', 'carpenter', 'helper',
  'cleaning', 'painting', 'delivery', 'laundry', 'beauty',
  'gardening', 'security', 'appliance', 'internet',
  // Mobile repair
  'screen_replacement', 'battery_replacement', 'charging_issue',
  'speaker_mic_issue', 'software_issue', 'water_damage_check',
  // Construction
  'mason',
  // Vehicle
  'puncture', 'battery_jump_start', 'fuel_delivery',
  'bike_wash', 'car_wash', 'minor_roadside_repair',
];

/** Human-readable label for a service slug */
export function serviceLabel(slug) {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** All services including the sentinel 'all' option for filter dropdowns */
export const SERVICE_FILTER_OPTIONS = ['all', ...SERVICE_SLUGS];

/** Emoji shown on nearby-worker map markers when that service is active */
export const SERVICE_WORKER_EMOJI = {
  // Vehicle
  puncture:              '🚲',
  bike_wash:             '🚲',
  car_wash:              '🚗',
  battery_jump_start:    '🔋',
  fuel_delivery:         '⛽',
  minor_roadside_repair: '🔧',
  // Home
  electrical:            '⚡',
  plumbing:              '🪠',
  ac_repair:             '❄️',
  carpenter:             '🪚',
  cleaning:              '🧹',
  painting:              '🎨',
  helper:                '🙋',
  delivery:              '📦',
  laundry:               '👕',
  beauty:                '💇',
  gardening:             '🌱',
  security:              '🔒',
  appliance:             '🔌',
  internet:              '📡',
  // Mobile
  screen_replacement:    '📱',
  battery_replacement:   '🔋',
  charging_issue:        '🔌',
  speaker_mic_issue:     '🎙️',
  software_issue:        '💻',
  water_damage_check:    '💧',
  // Construction
  mason:                 '🧱',
};

export const SERVICE_COLORS = {
  puncture:            '#ef4444',
  plumbing:            '#3b82f6',
  electrical:          '#eab308',
  helper:              '#6b7280',
  carpenter:           '#f59e0b',
  ac_repair:           '#06b6d4',
  cleaning:            '#22c55e',
  painting:            '#a855f7',
  delivery:            '#f97316',
  laundry:             '#14b8a6',
  beauty:              '#ec4899',
  gardening:           '#84cc16',
  security:            '#64748b',
  appliance:           '#8b5cf6',
  internet:            '#0ea5e9',
  screen_replacement:  '#f43f5e',
  battery_replacement: '#fb923c',
  charging_issue:      '#fbbf24',
  speaker_mic_issue:   '#a3e635',
  software_issue:      '#34d399',
  water_damage_check:  '#38bdf8',
  mason:               '#a16207',
  battery_jump_start:  '#dc2626',
  fuel_delivery:       '#92400e',
  bike_wash:           '#0891b2',
  car_wash:            '#1d4ed8',
  minor_roadside_repair: '#b45309',
};
