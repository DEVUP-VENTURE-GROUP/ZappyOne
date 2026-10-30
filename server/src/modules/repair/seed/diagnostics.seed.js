/**
 * Diagnostic flow seed data.
 *
 * Each flow is a decision TREE stored as data — questions carry a `showIf`
 * predicate naming the earlier answers that must hold for them to appear, and
 * each option names the repair it points at. Nothing here is referenced by
 * code; admin can rewrite any of it without a deploy.
 *
 * The display flow is the worked example from §7: "cracked screen" must not
 * resolve straight to a display swap. Asking whether the panel and touch still
 * work separates a glass-only job from a full assembly — a materially cheaper
 * outcome for the customer, and the difference between an honest quote and an
 * upsell.
 */

const FLOWS = [
  {
    code: 'mobile_display',
    category: 'mobile',
    title: 'Display diagnosis',
    description: 'Separates outer-glass damage from panel failure.',
    problemCodes: [
      'cracked_screen', 'broken_glass_display_ok', 'black_display',
      'touch_not_working', 'ghost_touch', 'green_pink_line',
      'display_flickering', 'dead_pixels', 'display_dimming',
      'screen_burn_in', 'display_touch_failure',
    ],
    questions: [
      {
        id: 'display_on',
        text: 'Is the display still showing a picture?',
        subtitle: 'Even if the glass is cracked, tell us whether you can still see the screen.',
        type: 'single',
        options: [
          { id: 'yes', label: 'Yes, I can see the screen normally', urgency: 'normal' },
          { id: 'partial', label: 'Partly — lines, patches or dim areas', urgency: 'high' },
          { id: 'no', label: 'No, the screen is black', urgency: 'high' },
        ],
      },
      {
        id: 'touch_works',
        // Only worth asking when there is a picture to touch.
        text: 'Does touch still respond everywhere?',
        subtitle: 'Try swiping across all four corners.',
        type: 'single',
        showIf: { display_on: ['yes', 'partial'] },
        options: [
          {
            id: 'yes',
            label: 'Yes, touch works everywhere',
            // Picture fine + touch fine = the panel is healthy, glass only.
            recommendedServiceCode: 'glass_replacement',
            recommendedPartQuality: 'premium',
            tools: ['laser_separator', 'oca_laminator'],
            urgency: 'normal',
          },
          {
            id: 'partial',
            label: 'Some areas do not respond',
            recommendedServiceCode: 'display_assembly_replacement',
            tools: ['heat_gun', 'suction_tool'],
            urgency: 'high',
          },
          {
            id: 'no',
            label: 'Touch does not work at all',
            recommendedServiceCode: 'display_assembly_replacement',
            tools: ['heat_gun', 'suction_tool'],
            urgency: 'high',
          },
        ],
      },
      {
        id: 'glass_only',
        text: 'Is the damage limited to the outer glass?',
        subtitle: 'Cracks you can feel, but the picture underneath is clean.',
        type: 'single',
        showIf: { display_on: ['yes'], touch_works: ['yes'] },
        options: [
          {
            id: 'yes',
            label: 'Yes, only the outer glass is cracked',
            recommendedServiceCode: 'glass_replacement',
            recommendedPartQuality: 'premium',
            priceHint: 'Glass-only repair — significantly cheaper than a full display.',
          },
          {
            id: 'no',
            label: 'There is damage under the glass too',
            recommendedServiceCode: 'display_assembly_replacement',
          },
        ],
      },
      {
        id: 'powers_on',
        // Black screen could be display OR power — this is the fork in §8.
        text: 'Does the phone still power on?',
        subtitle: 'Listen for vibration, sounds, or check if it charges.',
        type: 'single',
        showIf: { display_on: ['no'] },
        options: [
          {
            id: 'yes',
            label: 'Yes — it vibrates or makes sounds',
            recommendedServiceCode: 'display_assembly_replacement',
            urgency: 'high',
          },
          {
            id: 'no',
            label: 'No — completely dead',
            // Not a display job at all; this is a power investigation.
            recommendedServiceCode: 'motherboard_repair',
            urgency: 'urgent',
            tools: ['multimeter', 'dc_power_supply'],
          },
        ],
      },
      {
        id: 'liquid_exposure',
        text: 'Has the phone been exposed to water or moisture recently?',
        type: 'single',
        showIf: { display_on: ['no', 'partial'] },
        options: [
          {
            id: 'yes',
            label: 'Yes',
            recommendedServiceCode: 'liquid_damage_treatment',
            urgency: 'urgent',
          },
          { id: 'no', label: 'No', urgency: 'normal' },
          { id: 'unsure', label: 'Not sure', urgency: 'high' },
        ],
      },
    ],
  },

  {
    code: 'mobile_battery_power',
    category: 'mobile',
    title: 'Battery & power diagnosis',
    description: 'Separates a worn battery from a charging-port or board fault.',
    problemCodes: [
      'battery_draining_fast', 'battery_not_charging', 'battery_swelling',
      'phone_overheating', 'random_shutdown', 'phone_wont_turn_on',
      'battery_percentage_jumping', 'fast_charging_not_working',
      'slow_charging', 'cable_not_detecting', 'charging_port_damaged',
      'loose_charging_port',
    ],
    questions: [
      {
        id: 'charges_at_all',
        text: 'Does the phone charge at all when plugged in?',
        type: 'single',
        options: [
          { id: 'yes', label: 'Yes, it charges normally' },
          { id: 'intermittent', label: 'Only sometimes, or if I hold the cable', urgency: 'high' },
          { id: 'no', label: 'No, it does not charge', urgency: 'high' },
        ],
      },
      {
        id: 'cable_wiggle',
        text: 'Does charging start if you wiggle or reposition the cable?',
        subtitle: 'This usually points at the port rather than the battery.',
        type: 'single',
        showIf: { charges_at_all: ['intermittent', 'no'] },
        options: [
          {
            id: 'yes',
            label: 'Yes, it reacts to the cable position',
            recommendedServiceCode: 'charging_port_repair',
            tools: ['soldering_station'],
            urgency: 'high',
          },
          { id: 'no', label: 'No difference', urgency: 'high' },
        ],
      },
      {
        id: 'battery_symptoms',
        text: 'Which of these is happening?',
        type: 'multi',
        showIf: { charges_at_all: ['yes'] },
        options: [
          {
            id: 'drains_fast',
            label: 'Drains much faster than it used to',
            recommendedServiceCode: 'battery_replacement',
          },
          {
            id: 'percentage_jumps',
            label: 'Percentage jumps around or drops suddenly',
            recommendedServiceCode: 'battery_replacement',
          },
          {
            id: 'swelling',
            label: 'The back or screen is lifting / bulging',
            recommendedServiceCode: 'battery_replacement',
            urgency: 'urgent',
            priceHint: 'A swelling battery is a safety issue — stop using the phone.',
          },
          {
            id: 'overheats',
            label: 'Gets very hot',
            recommendedServiceCode: 'battery_replacement',
            urgency: 'high',
          },
          { id: 'slow_charge', label: 'Charges very slowly', recommendedServiceCode: 'charging_port_repair' },
        ],
      },
      {
        id: 'dead_response',
        text: 'When you hold the power button, does anything happen at all?',
        type: 'single',
        showIf: { charges_at_all: ['no'] },
        options: [
          {
            id: 'vibrates',
            label: 'It vibrates or shows a logo',
            recommendedServiceCode: 'battery_replacement',
            urgency: 'high',
          },
          {
            id: 'nothing',
            label: 'Completely dead, no response',
            recommendedServiceCode: 'power_ic_repair',
            urgency: 'urgent',
            tools: ['multimeter', 'dc_power_supply'],
          },
        ],
      },
    ],
  },

  {
    code: 'mobile_liquid_damage',
    category: 'mobile',
    title: 'Liquid damage assessment',
    description: 'Liquid damage is always inspected before quoting.',
    problemCodes: ['water_liquid_damage', 'corrosion', 'short_circuit'],
    questions: [
      {
        id: 'exposure_time',
        text: 'How long ago did the phone get wet?',
        type: 'single',
        options: [
          { id: 'under_24h', label: 'Less than 24 hours ago', urgency: 'urgent' },
          { id: 'few_days', label: 'A few days ago', urgency: 'high' },
          { id: 'longer', label: 'Longer than a week ago', urgency: 'high' },
        ],
      },
      {
        id: 'powered_since',
        text: 'Have you tried charging or switching it on since it got wet?',
        subtitle: 'Powering a wet board is what usually turns a cleanable phone into a dead one.',
        type: 'single',
        options: [
          { id: 'yes', label: 'Yes', urgency: 'urgent' },
          { id: 'no', label: 'No, I left it off', urgency: 'high' },
        ],
      },
      {
        id: 'current_state',
        text: 'What does the phone do right now?',
        type: 'single',
        options: [
          {
            id: 'works_partly',
            label: 'It works but something is faulty',
            recommendedServiceCode: 'liquid_damage_treatment',
            urgency: 'urgent',
          },
          {
            id: 'dead',
            label: 'Completely dead',
            recommendedServiceCode: 'liquid_damage_treatment',
            urgency: 'urgent',
            tools: ['ultrasonic_cleaner', 'microscope'],
          },
        ],
      },
    ],
  },
];

module.exports = { FLOWS };
