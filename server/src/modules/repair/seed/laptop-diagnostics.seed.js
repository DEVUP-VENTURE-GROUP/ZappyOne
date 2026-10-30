/**
 * Laptop diagnostic flows.
 *
 * §10 is the governing rule: a symptom is not a repair. "Screen flickering" can
 * be the panel, the display cable, the hinge cable chafing that cable, the GPU,
 * the board, a driver, or a refresh-rate setting — seven repairs spanning ₹0 to
 * ₹25,000. Selling a panel because someone typed "flickering" is guesswork with
 * the customer's money.
 *
 * Each tree therefore asks the questions that actually separate those causes,
 * and the cheap ones are tested FIRST: if an external monitor also flickers, the
 * panel is fine and replacing it would be an expensive mistake.
 *
 * Trees are data. Admin edits them without a deploy (§11).
 */

const FLOWS = [
  /* Display: the §10 worked example */
  {
    code: 'laptop_display',
    category: 'laptop',
    title: 'Display diagnosis',
    description: 'Separates panel faults from cable, GPU, board and software causes.',
    problemCodes: [
      'lt_flickering_display', 'lt_horizontal_lines', 'lt_vertical_lines',
      'lt_black_screen', 'lt_screen_not_turning_on', 'lt_white_screen',
      'lt_dim_display', 'lt_backlight_not_working', 'lt_display_color_issue',
      'lt_screen_spots', 'lt_screen_intermittent', 'lt_dead_pixels',
      'lt_external_works_internal_not',
    ],
    questions: [
      {
        id: 'physical_damage',
        text: 'Is the screen physically cracked or damaged?',
        subtitle: 'Visible cracks, impact marks or liquid patches under the glass.',
        type: 'single',
        options: [
          {
            id: 'yes',
            label: 'Yes, there is visible damage',
            // Physical damage settles it — no further electrical triage needed.
            recommendedServiceCode: 'lt_screen_replacement',
            urgency: 'high',
          },
          { id: 'no', label: 'No, the screen looks intact' },
        ],
      },
      {
        id: 'external_monitor',
        // The single most decisive question, and it costs nothing to ask.
        text: 'If you connect an external monitor, does it show the same problem?',
        subtitle: 'This tells us whether the fault is the screen itself or what drives it.',
        type: 'single',
        showIf: { physical_damage: ['no'] },
        options: [
          {
            id: 'external_fine',
            label: 'External monitor is perfect — only the laptop screen is faulty',
            // Panel side: could be panel, its cable, or the hinge chafing it.
            urgency: 'normal',
          },
          {
            id: 'external_same',
            label: 'External monitor has the same problem',
            // Not the panel at all — GPU, board or driver.
            urgency: 'high',
          },
          { id: 'not_tried', label: "I haven't tried / I don't have one" },
        ],
      },
      {
        id: 'lid_angle',
        text: 'Does the problem change when you move the screen back and forth?',
        subtitle: 'Flickering that reacts to the lid angle usually means a chafed cable.',
        type: 'single',
        showIf: { external_monitor: ['external_fine', 'not_tried'] },
        options: [
          {
            id: 'yes',
            label: 'Yes, it changes with the lid angle',
            // Classic cable/hinge wear rather than a dead panel.
            recommendedServiceCode: 'lt_display_cable_repair',
            tools: ['spudger', 'torx_set'],
            urgency: 'high',
            priceHint: 'Often a cable repair rather than a full screen — considerably cheaper.',
          },
          {
            id: 'no',
            label: 'No, it stays the same',
            recommendedServiceCode: 'lt_screen_replacement',
          },
        ],
      },
      {
        id: 'hinge_condition',
        text: 'Is the hinge area loose, stiff or separating from the body?',
        type: 'single',
        showIf: { lid_angle: ['yes'] },
        options: [
          {
            id: 'yes',
            label: 'Yes, the hinge looks damaged',
            // A failing hinge is what destroys the cable; fixing only the cable
            // means the customer is back in a month.
            recommendedServiceCode: 'lt_hinge_repair',
            urgency: 'high',
            priceHint: 'The hinge is likely damaging the cable — both usually need attention.',
          },
          { id: 'no', label: 'No, the hinge seems fine', recommendedServiceCode: 'lt_display_cable_repair' },
        ],
      },
      {
        id: 'after_software_change',
        text: 'Did this start after a Windows update or driver change?',
        type: 'single',
        showIf: { external_monitor: ['external_same'] },
        options: [
          {
            id: 'yes',
            label: 'Yes, right after an update',
            // Cheapest plausible cause, so it is offered before hardware work.
            recommendedServiceCode: 'lt_driver_installation',
            urgency: 'normal',
            priceHint: 'Likely a driver issue — usually fixable without any parts.',
          },
          {
            id: 'no',
            label: 'No, it started on its own',
            urgency: 'high',
          },
        ],
      },
      {
        id: 'artifacts_present',
        text: 'Do you see strange colours, blocks or patterns even in the BIOS/boot screen?',
        subtitle: 'Faults visible before Windows loads point at hardware, not software.',
        type: 'single',
        showIf: { after_software_change: ['no'] },
        options: [
          {
            id: 'yes',
            label: 'Yes, visible even before Windows loads',
            // Present pre-OS ⇒ GPU/board, which cannot be priced remotely.
            urgency: 'urgent',
            tools: ['thermal_camera', 'microscope'],
          },
          { id: 'no', label: 'No, only inside Windows', recommendedServiceCode: 'lt_driver_installation' },
        ],
      },
    ],
  },

  /* Power: the §11 worked example */
  {
    code: 'laptop_power',
    category: 'laptop',
    title: 'Power diagnosis',
    description: 'Separates adapter, battery, charging port and board faults.',
    problemCodes: [
      'lt_wont_turn_on', 'lt_turns_on_shuts_off', 'lt_completely_dead', 'lt_no_power',
      'lt_battery_not_charging', 'lt_battery_draining', 'lt_battery_not_detected',
      'lt_works_only_on_charger', 'lt_random_shutdown', 'lt_charging_port_damaged',
      'lt_loose_charging_port', 'lt_intermittent_charging', 'lt_charger_not_working',
      'lt_charging_angle', 'lt_usbc_charging_not_working', 'lt_battery_stuck_pct',
    ],
    questions: [
      {
        id: 'charge_indicator',
        // §11's opening question, verbatim in intent.
        text: 'When the charger is plugged in, does the charging light come on?',
        type: 'single',
        options: [
          { id: 'yes', label: 'Yes, the light comes on' },
          { id: 'no', label: 'No light at all', urgency: 'high' },
          { id: 'flickers', label: 'It flickers or is inconsistent', urgency: 'high' },
        ],
      },
      {
        id: 'power_button_response',
        text: 'Does the laptop react at all when you press the power button?',
        subtitle: 'Any fan noise, light, or sound counts.',
        type: 'single',
        showIf: { charge_indicator: ['yes'] },
        options: [
          {
            id: 'boots',
            label: 'It powers on and boots normally',
            // Powers fine — so this is a battery-life complaint, not a dead laptop.
            recommendedServiceCode: 'lt_battery_replacement',
          },
          {
            id: 'fans_no_display',
            label: 'Fans/lights come on but nothing on screen',
            urgency: 'high',
            tools: ['post_card'],
          },
          {
            id: 'nothing',
            label: 'No reaction at all',
            // Charging light on + no response = board side. Not priceable remotely.
            urgency: 'urgent',
            tools: ['multimeter', 'dc_power_supply'],
          },
        ],
      },
      {
        id: 'cable_wiggle',
        text: 'Does the charging light appear if you hold or move the cable?',
        type: 'single',
        showIf: { charge_indicator: ['no', 'flickers'] },
        options: [
          {
            id: 'yes',
            label: 'Yes, it reacts to the cable position',
            recommendedServiceCode: 'lt_charging_port_repair',
            tools: ['soldering_station'],
            urgency: 'high',
          },
          { id: 'no', label: 'No difference' },
        ],
      },
      {
        id: 'different_charger',
        text: 'Have you tried a different charger?',
        subtitle: 'The cheapest possible cause, so it is worth ruling out first.',
        type: 'single',
        showIf: { cable_wiggle: ['no'] },
        options: [
          {
            id: 'works',
            label: 'Yes — it works with another charger',
            recommendedServiceCode: 'lt_adapter_replacement',
            priceHint: 'Just the adapter — no internal repair needed.',
          },
          {
            id: 'still_dead',
            label: 'Yes — still nothing',
            urgency: 'urgent',
          },
          { id: 'not_tried', label: "I haven't tried another charger", urgency: 'high' },
        ],
      },
      {
        id: 'battery_removable_test',
        text: 'Does the laptop run with the charger connected but no battery?',
        type: 'single',
        showIf: { power_button_response: ['boots'] },
        options: [
          {
            id: 'yes',
            label: 'Yes, it runs fine on charger alone',
            recommendedServiceCode: 'lt_battery_replacement',
          },
          { id: 'no', label: 'No, it will not run without the battery', urgency: 'high' },
          { id: 'cant_remove', label: 'The battery is internal / I cannot remove it' },
        ],
      },
      {
        id: 'liquid_exposure_power',
        text: 'Has the laptop been exposed to any liquid recently?',
        type: 'single',
        showIf: { different_charger: ['still_dead', 'not_tried'] },
        options: [
          {
            id: 'yes',
            label: 'Yes',
            recommendedServiceCode: 'lt_liquid_damage_treatment',
            urgency: 'urgent',
          },
          { id: 'no', label: 'No', urgency: 'urgent' },
        ],
      },
    ],
  },

  /* Liquid damage: always inspected, never quoted blind */
  {
    code: 'laptop_liquid',
    category: 'laptop',
    title: 'Liquid damage assessment',
    description: 'Establishes exposure and whether power was applied afterwards.',
    problemCodes: [
      'lt_water_spilled', 'lt_coffee_spill', 'lt_liquid_keyboard',
      'lt_liquid_motherboard_ld', 'lt_corrosion_ld', 'lt_no_power_after_liquid',
      'lt_keyboard_liquid', 'lt_trackpad_liquid', 'lt_liquid_motherboard',
    ],
    questions: [
      {
        id: 'liquid_type',
        text: 'What was spilled?',
        subtitle: 'Sugary and salty liquids corrode far faster than clean water.',
        type: 'single',
        options: [
          { id: 'water', label: 'Water', urgency: 'high' },
          { id: 'sugary', label: 'Tea, coffee, juice or soft drink', urgency: 'urgent' },
          { id: 'alcohol', label: 'Alcohol', urgency: 'high' },
          { id: 'other', label: 'Something else', urgency: 'urgent' },
        ],
      },
      {
        id: 'time_since',
        text: 'How long ago did it happen?',
        type: 'single',
        options: [
          { id: 'hours', label: 'Within the last few hours', urgency: 'urgent' },
          { id: 'days', label: 'A few days ago', urgency: 'urgent' },
          { id: 'weeks', label: 'A week or more ago', urgency: 'urgent' },
        ],
      },
      {
        id: 'powered_after',
        text: 'Did you switch it on or charge it after the spill?',
        subtitle: 'Powering a wet board is usually what turns a cleanable laptop into a dead one.',
        type: 'single',
        options: [
          { id: 'yes', label: 'Yes', urgency: 'urgent' },
          { id: 'no', label: 'No, I left it off', urgency: 'high' },
        ],
      },
      {
        id: 'current_behaviour',
        text: 'What does it do now?',
        type: 'single',
        options: [
          {
            id: 'works_mostly',
            label: 'It works, but something is faulty',
            recommendedServiceCode: 'lt_liquid_damage_treatment',
            urgency: 'urgent',
          },
          {
            id: 'dead',
            label: 'Completely dead',
            recommendedServiceCode: 'lt_liquid_damage_treatment',
            urgency: 'urgent',
            tools: ['ultrasonic_cleaner', 'microscope'],
          },
        ],
      },
    ],
  },

  /* Performance / storage triage */
  {
    code: 'laptop_performance',
    category: 'laptop',
    title: 'Performance diagnosis',
    description: 'Separates a slow disk, low memory, thermal throttling and software rot.',
    problemCodes: [
      'lt_laptop_slow', 'lt_freezing', 'lt_high_memory', 'lt_random_crashes',
      'lt_blue_screen_p', 'lt_performance_degradation', 'lt_slow_storage',
      'lt_freezing_sw', 'lt_startup_problems',
    ],
    questions: [
      {
        id: 'storage_type',
        text: 'Does your laptop have a hard disk (HDD) or an SSD?',
        subtitle: "If you're not sure, choose \"I don't know\" — a technician will check.",
        type: 'single',
        options: [
          {
            id: 'hdd',
            label: 'Mechanical hard disk (HDD)',
            // Overwhelmingly the cause of "slow laptop" complaints.
            recommendedServiceCode: 'lt_ssd_upgrade',
            priceHint: 'Moving to an SSD is usually the single biggest speed improvement.',
          },
          { id: 'ssd', label: 'SSD' },
          { id: 'unknown', label: "I don't know" },
        ],
      },
      {
        id: 'when_slow',
        text: 'When is it worst?',
        type: 'single',
        showIf: { storage_type: ['ssd', 'unknown'] },
        options: [
          {
            id: 'always',
            label: 'Always, even just after starting up',
            recommendedServiceCode: 'lt_os_repair',
          },
          {
            id: 'under_load',
            label: 'After a while, or when doing heavy work',
            // Getting slower as it warms up is thermal, not software.
            recommendedServiceCode: 'lt_thermal_service',
            priceHint: 'Sounds like heat — cleaning and fresh thermal paste usually restores speed.',
          },
          {
            id: 'many_apps',
            label: 'When several programs are open',
            recommendedServiceCode: 'lt_ram_upgrade',
          },
        ],
      },
      {
        id: 'hot_or_loud',
        text: 'Does it get hot or does the fan run loudly?',
        type: 'single',
        showIf: { when_slow: ['under_load', 'always'] },
        options: [
          { id: 'yes', label: 'Yes, hot and/or loud', recommendedServiceCode: 'lt_thermal_service', urgency: 'high' },
          { id: 'no', label: 'No, it stays cool and quiet' },
        ],
      },
      {
        id: 'crashes_bsod',
        text: 'Does it crash, freeze or show a blue screen?',
        type: 'single',
        showIf: { storage_type: ['ssd', 'unknown'] },
        options: [
          {
            id: 'bsod',
            label: 'Blue screens',
            // Memory and storage both produce this; a technician must confirm which.
            recommendedServiceCode: 'lt_ram_replacement',
            urgency: 'high',
          },
          { id: 'freezes', label: 'Freezes but no blue screen', recommendedServiceCode: 'lt_os_repair' },
          { id: 'no', label: 'Neither — just slow' },
        ],
      },
    ],
  },

  /* "I don't know what's wrong" — §12 */
  {
    code: 'laptop_triage',
    category: 'laptop',
    title: 'Guided diagnosis',
    description: "For customers who can't categorise the fault themselves.",
    problemCodes: [],
    questions: [
      {
        id: 'turns_on',
        text: 'Does the laptop turn on at all?',
        type: 'single',
        options: [
          { id: 'yes', label: 'Yes, it powers on' },
          { id: 'no', label: 'No, nothing happens', urgency: 'high' },
        ],
      },
      {
        id: 'reaches_desktop',
        text: 'Does it get all the way to the desktop?',
        type: 'single',
        showIf: { turns_on: ['yes'] },
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No, it stops or restarts before that', urgency: 'high' },
        ],
      },
      {
        id: 'main_complaint',
        text: 'What bothers you most about it?',
        type: 'single',
        showIf: { reaches_desktop: ['yes'] },
        options: [
          { id: 'slow', label: "It's too slow", recommendedServiceCode: 'lt_os_repair' },
          { id: 'battery', label: 'Battery does not last', recommendedServiceCode: 'lt_battery_replacement' },
          { id: 'hot', label: 'It gets hot or noisy', recommendedServiceCode: 'lt_thermal_service' },
          { id: 'screen', label: 'Something about the screen', recommendedServiceCode: 'lt_screen_replacement' },
          { id: 'keyboard', label: 'Keyboard or trackpad', recommendedServiceCode: 'lt_keyboard_replacement' },
          { id: 'sound_camera', label: 'Sound or camera', recommendedServiceCode: 'lt_driver_installation' },
          {
            id: 'other',
            label: 'Something else',
            // Honest dead end: triage could not narrow it, so a technician looks.
            urgency: 'normal',
          },
        ],
      },
      {
        id: 'physical_event',
        text: 'Did anything happen just before the problem started?',
        type: 'single',
        showIf: { turns_on: ['no'], reaches_desktop: ['no'] },
        options: [
          { id: 'dropped', label: 'It was dropped or knocked', urgency: 'high' },
          { id: 'liquid', label: 'Liquid was spilled', recommendedServiceCode: 'lt_liquid_damage_treatment', urgency: 'urgent' },
          { id: 'update', label: 'A Windows update', recommendedServiceCode: 'lt_os_repair' },
          { id: 'nothing', label: 'Nothing that I noticed', urgency: 'high' },
        ],
      },
    ],
  },
];

module.exports = { FLOWS };
