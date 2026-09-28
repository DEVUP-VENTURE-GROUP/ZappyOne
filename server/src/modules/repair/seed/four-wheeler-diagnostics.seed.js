/**
 * Four-wheeler diagnostic flows.
 *
 * §10 governs: a symptom is not a repair. "AC not cooling" can be low
 * refrigerant, a dead compressor, a blocked condenser, a failed blower, a relay
 * or a cabin filter — six outcomes spanning ₹500 to ₹40,000. Selling a gas
 * refill because someone typed "not cooling" is the single most common way this
 * category cheats customers: the gas leaks back out, and they pay again in a
 * month for the same fault.
 *
 * Three rules shape every tree here:
 *
 *   CHEAP AND DECISIVE FIRST. "Is air coming from the vents?" costs nothing and
 *   separates a blower fault from a refrigeration fault immediately.
 *
 *   A WARNING LIGHT IS NOT A DIAGNOSIS. Anything that ends at a dashboard
 *   symbol routes to a scan, never to a part.
 *
 *   NEVER TRIAGE A SAFETY INCIDENT INTO A REPAIR. The EV and CNG trees open by
 *   asking about heat, smoke and smell, and any yes routes to an inspection —
 *   not to the cheaper answer the customer was hoping for.
 *
 * Trees are data. Admin edits them without a deploy (§48).
 */

const FLOWS = [
  /* AC not cooling — the §24 worked example */
  {
    code: 'fw_ac_triage',
    category: 'four_wheeler',
    title: 'Air conditioning diagnosis',
    description: 'Separates blower, refrigerant, compressor, condenser and electrical causes before anyone books a gas refill.',
    problemCodes: [
      'fw_ac_not_cooling', 'fw_ac_weak_cooling', 'fw_ac_intermittent',
      'fw_blower_not_working', 'fw_ac_compressor_noise', 'fw_ac_smell',
    ],
    questions: [
      {
        id: 'airflow',
        // Costs nothing to ask and immediately separates "the fan is dead" from
        // "the refrigeration side is dead" — two completely different jobs.
        text: 'Is air blowing from the vents at all?',
        subtitle: 'Set the fan to maximum and check.',
        type: 'single',
        options: [
          {
            id: 'no_air',
            label: 'No air at all',
            recommendedServiceCode: 'fw_ac_blower_repair',
            urgency: 'normal',
          },
          { id: 'weak_air', label: 'Air comes, but weakly', recommendedServiceCode: 'fw_cabin_filter_replacement' },
          { id: 'good_air', label: 'Plenty of air, it is just not cold' },
        ],
      },
      {
        id: 'compressor',
        /*
         * The question that stops the automatic gas refill.
         *
         * If the compressor never engages, refrigerant is not the story — it is
         * electrical, a pressure switch, or the compressor itself. Refilling gas
         * into a system whose compressor never runs is money spent on nothing.
         */
        text: 'With the AC on, does the engine note change or do you hear a click from under the bonnet?',
        subtitle: 'That click is the compressor clutch engaging. No click usually means it is not running at all.',
        type: 'single',
        showIf: { airflow: ['good_air', 'weak_air'] },
        options: [
          {
            id: 'no_engage',
            label: 'No click, nothing changes',
            recommendedServiceCode: 'fw_ac_diagnosis',
            urgency: 'normal',
          },
          { id: 'engages', label: 'Yes, I hear it engage' },
          {
            id: 'cycles_fast',
            label: 'It clicks on and off every few seconds',
            // Short-cycling is the classic low-charge signature.
            recommendedServiceCode: 'fw_ac_gas_refill',
          },
          { id: 'noise', label: 'It makes a harsh or grinding noise', recommendedServiceCode: 'fw_ac_compressor_repair', urgency: 'high' },
          { id: 'unsure', label: 'I cannot tell' },
        ],
      },
      {
        id: 'history',
        text: 'How did the cooling get worse?',
        subtitle: 'A gradual fade and an overnight failure have different causes.',
        type: 'single',
        showIf: { compressor: ['engages', 'unsure'] },
        options: [
          {
            id: 'gradual',
            label: 'Slowly over months',
            // Gradual loss with a working compressor is a slow leak.
            recommendedServiceCode: 'fw_ac_gas_refill',
          },
          {
            id: 'sudden',
            label: 'Suddenly, it was fine yesterday',
            recommendedServiceCode: 'fw_ac_diagnosis',
            urgency: 'normal',
          },
          {
            id: 'only_idle',
            label: 'Only warm when standing still, cold when driving',
            // Airflow across the condenser only at speed — cooling fan or a
            // blocked condenser, never a refill.
            recommendedServiceCode: 'fw_ac_condenser_repair',
          },
          { id: 'after_service', label: 'Right after some other work was done', recommendedServiceCode: 'fw_ac_electrical_repair' },
        ],
      },
    ],
  },

  /* Car won't start */
  {
    code: 'fw_no_start',
    category: 'four_wheeler',
    title: 'Starting diagnosis',
    description: 'Separates battery, starter, fuel and management causes before a technician is sent.',
    problemCodes: [
      'fw_wont_start_roadside', 'fw_cranks_no_start', 'fw_no_crank',
      'fw_battery_dead_roadside', 'fw_intermittent_start', 'fw_engine_stalls',
    ],
    questions: [
      {
        id: 'dash',
        text: 'When you turn the key, do the dashboard lights come on?',
        subtitle: 'This tells us whether the battery is delivering power at all.',
        type: 'single',
        options: [
          { id: 'dead', label: 'Nothing at all — completely dead', urgency: 'high' },
          { id: 'dim', label: 'Lights come on but look dim' },
          { id: 'normal', label: 'Lights come on normally' },
        ],
      },
      {
        id: 'crank',
        text: 'What happens next?',
        subtitle: 'The sound separates an electrical fault from a fuel or ignition one.',
        type: 'single',
        showIf: { dash: ['dead', 'dim', 'normal'] },
        options: [
          {
            id: 'click',
            label: 'A single click, engine does not turn',
            recommendedServiceCode: 'fw_battery_replacement',
            urgency: 'high',
          },
          {
            id: 'slow_crank',
            label: 'Turns over slowly then gives up',
            recommendedServiceCode: 'fw_battery_replacement',
            urgency: 'high',
          },
          {
            id: 'silence',
            label: 'No sound at all from the engine',
            recommendedServiceCode: 'fw_starter_repair',
            urgency: 'high',
          },
          {
            id: 'cranks_no_fire',
            label: 'Turns over normally but will not fire',
            // Battery and starter are proven good — this is fuel, spark or ECU.
            urgency: 'normal',
          },
        ],
      },
      {
        id: 'context',
        text: 'Anything else you have noticed?',
        subtitle: 'Recent history usually points straight at the cause.',
        type: 'single',
        showIf: { crank: ['cranks_no_fire'] },
        options: [
          {
            id: 'warning_light',
            label: 'A warning light is on',
            // A light names a system, never a part — it gets scanned.
            recommendedServiceCode: 'fw_obd_scan',
            urgency: 'high',
          },
          { id: 'no_fuel', label: 'The fuel gauge is very low', recommendedServiceCode: 'fw_fuel_delivery' },
          { id: 'fuel_smell', label: 'Strong smell of fuel', recommendedServiceCode: 'fw_obd_scan' },
          { id: 'stood', label: 'The car has not been used for weeks', recommendedServiceCode: 'fw_battery_replacement' },
          { id: 'nothing', label: 'Nothing unusual', recommendedServiceCode: 'fw_obd_scan' },
        ],
      },
    ],
  },

  /* Warning lights — a light is a system, not a part */
  {
    code: 'fw_warning_light',
    category: 'four_wheeler',
    title: 'Warning light diagnosis',
    description: 'Establishes urgency and routes to a scan rather than guessing at a component.',
    problemCodes: [
      'fw_check_engine_light', 'fw_unknown_warning_light', 'fw_multiple_warnings',
      'fw_abs_warning', 'fw_esc_warning', 'fw_emission_warning',
    ],
    questions: [
      {
        id: 'colour',
        // Red means stop now; amber means get it looked at. The distinction
        // decides whether this is a roadside job or a booking for Saturday.
        text: 'What colour is the warning light?',
        subtitle: 'Red generally means stop as soon as it is safe. Amber means have it checked soon.',
        type: 'single',
        options: [
          { id: 'red', label: 'Red', urgency: 'urgent' },
          { id: 'amber', label: 'Amber or yellow' },
          { id: 'unsure', label: 'Not sure' },
        ],
      },
      {
        id: 'behaviour',
        text: 'Is the car driving differently?',
        subtitle: 'A light with a change in behaviour is more urgent than a light on its own.',
        type: 'single',
        options: [
          {
            id: 'undriveable',
            label: 'It will not drive, or is unsafe to drive',
            recommendedServiceCode: 'fw_towing',
            urgency: 'urgent',
          },
          {
            id: 'limp',
            label: 'It drives but with very little power',
            recommendedServiceCode: 'fw_obd_scan',
            urgency: 'urgent',
          },
          {
            id: 'noise_smoke',
            label: 'There is smoke, a burning smell or a loud noise',
            recommendedServiceCode: 'fw_towing',
            urgency: 'urgent',
          },
          {
            id: 'drives_fine',
            label: 'It drives normally',
            // Still a scan. The code is the only honest next step.
            recommendedServiceCode: 'fw_obd_scan',
          },
        ],
      },
    ],
  },

  /* EV / hybrid, WITH the high-voltage safety gate */
  {
    code: 'fw_ev_triage',
    category: 'four_wheeler',
    title: 'Electric vehicle diagnosis',
    description: 'Checks for a high-voltage hazard first, then separates charging, battery and drive faults.',
    problemCodes: [
      'fw_ev_not_charging', 'fw_ev_reduced_range', 'fw_ev_percentage_wrong',
      'fw_ev_slow_charging', 'fw_ev_charging_stops', 'fw_ev_wont_accept_charge',
      'fw_ev_low_power', 'fw_ev_power_cutoff', 'fw_ev_battery_warning',
    ],
    questions: [
      {
        id: 'hazard',
        /*
         * First, and impossible to skip.
         *
         * A traction pack that is hot, smoking or smells of burning is a fire
         * risk that cannot be put out conventionally. The correct response is
         * to park it away from structures and stop — not to book a technician
         * for Thursday. Every "yes" routes to the safety inspection whatever
         * the customer originally selected.
         */
        text: 'Is there smoke, a burning smell, unusual heat from under the car, or a red high-voltage warning?',
        subtitle: 'Please check before continuing. If any of these are true, park away from buildings and other vehicles, get everyone out, and do not charge it.',
        type: 'single',
        options: [
          {
            id: 'hazard_yes',
            label: 'Yes — one or more of these is true',
            recommendedServiceCode: 'fw_ev_safety_inspection',
            urgency: 'urgent',
          },
          { id: 'hazard_no', label: 'No — nothing hot, smoking or burning' },
        ],
      },
      {
        id: 'symptom',
        text: 'What is the car actually doing?',
        type: 'single',
        showIf: { hazard: ['hazard_no'] },
        options: [
          { id: 'no_charge', label: 'It will not charge at all', urgency: 'high' },
          { id: 'slow_charge', label: 'It charges, but very slowly' },
          { id: 'stops_charge', label: 'Charging starts then stops', recommendedServiceCode: 'fw_ev_bms_service' },
          { id: 'range', label: 'It charges fine but the range has dropped', recommendedServiceCode: 'fw_ev_battery_diagnostic' },
          { id: 'power', label: 'It has lost power or cuts out while driving', recommendedServiceCode: 'fw_ev_controller_repair', urgency: 'high' },
        ],
      },
      {
        id: 'charger',
        text: 'Does it behave the same on a different charger?',
        subtitle: 'The quickest way to tell the car apart from the charger.',
        type: 'single',
        showIf: { symptom: ['no_charge', 'slow_charge'] },
        options: [
          {
            id: 'other_works',
            label: 'Another charger works fine',
            // The car is healthy; the customer's own charger is the fault.
            recommendedServiceCode: 'fw_ev_charger_repair',
          },
          {
            id: 'same_everywhere',
            label: 'Same problem on every charger',
            recommendedServiceCode: 'fw_ev_battery_diagnostic',
            urgency: 'high',
          },
          { id: 'not_tried', label: 'I have only tried one' },
        ],
      },
    ],
  },

  /* CNG, WITH the gas safety gate */
  {
    code: 'fw_cng_triage',
    category: 'four_wheeler',
    title: 'CNG system diagnosis',
    description: 'Checks for a gas leak first, then separates switchover, regulator and injector faults.',
    problemCodes: [
      'fw_cng_not_switching', 'fw_cng_poor_pickup', 'fw_cng_poor_mileage',
      'fw_cng_not_filling', 'fw_cng_starting_issue', 'fw_cng_warning',
    ],
    questions: [
      {
        id: 'leak',
        /*
         * Same principle as the EV tree, different physics.
         *
         * CNG is stored at around 200 bar and a leak in an enclosed car is an
         * explosion risk. A smell of gas is never a "book me for Saturday"
         * situation, so it routes to inspection regardless of the symptom the
         * customer originally chose.
         */
        text: 'Can you smell gas in or around the car?',
        subtitle: 'If yes: do not start the engine, open the windows, and park it outdoors away from any flame or spark.',
        type: 'single',
        options: [
          {
            id: 'leak_yes',
            label: 'Yes, there is a smell of gas',
            recommendedServiceCode: 'fw_cng_safety_inspection',
            urgency: 'urgent',
          },
          { id: 'leak_no', label: 'No smell of gas' },
        ],
      },
      {
        id: 'switchover',
        text: 'What happens when it should switch to CNG?',
        type: 'single',
        showIf: { leak: ['leak_no'] },
        options: [
          {
            id: 'never_switches',
            label: 'It never switches — stays on petrol',
            recommendedServiceCode: 'fw_cng_system_service',
          },
          {
            id: 'switches_stalls',
            label: 'It switches then the engine stalls',
            recommendedServiceCode: 'fw_cng_regulator_repair',
            urgency: 'high',
          },
          {
            id: 'runs_badly',
            label: 'It runs on CNG but poorly',
            recommendedServiceCode: 'fw_cng_injector_service',
          },
          { id: 'wont_fill', label: 'It will not take gas at the pump', recommendedServiceCode: 'fw_cng_system_service' },
        ],
      },
    ],
  },

  /* Brakes */
  {
    code: 'fw_brake_triage',
    category: 'four_wheeler',
    title: 'Brake diagnosis',
    description: 'Separates worn friction material from hydraulic faults and warped discs.',
    problemCodes: [
      'fw_brake_noise', 'fw_brake_soft', 'fw_brake_hard',
      'fw_brake_judder', 'fw_brake_fluid_leak',
    ],
    questions: [
      {
        id: 'symptom',
        text: 'What are the brakes doing?',
        type: 'single',
        options: [
          { id: 'squeal', label: 'Squealing or grinding', recommendedServiceCode: 'fw_brake_pad_replacement' },
          {
            id: 'soft',
            label: 'Pedal feels soft or sinks towards the floor',
            // Air or fluid loss in a hydraulic circuit — never drive it.
            recommendedServiceCode: 'fw_brake_bleeding',
            urgency: 'urgent',
          },
          { id: 'hard', label: 'Pedal feels very hard', recommendedServiceCode: 'fw_brake_booster_repair', urgency: 'high' },
          { id: 'judder', label: 'Steering or pedal shudders when braking', recommendedServiceCode: 'fw_brake_disc_replacement' },
          { id: 'pulls', label: 'Car pulls to one side when braking', recommendedServiceCode: 'fw_brake_service', urgency: 'high' },
        ],
      },
      {
        id: 'fluid',
        text: 'Is there any fluid on the ground or is the reservoir low?',
        subtitle: 'Losing brake fluid is always urgent.',
        type: 'single',
        showIf: { symptom: ['soft', 'pulls'] },
        options: [
          {
            id: 'leaking',
            label: 'Yes, there is a leak or the level has dropped',
            recommendedServiceCode: 'fw_brake_service',
            urgency: 'urgent',
          },
          { id: 'dry', label: 'No, everything looks dry and the level is fine' },
        ],
      },
    ],
  },

  /* Overheating */
  {
    code: 'fw_overheating_triage',
    category: 'four_wheeler',
    title: 'Overheating diagnosis',
    description: 'Separates coolant loss, fan failure and thermostat faults, and stops the customer driving on.',
    problemCodes: [
      'fw_engine_overheating', 'fw_overheating_roadside', 'fw_coolant_leak', 'fw_radiator_fan_issue',
    ],
    questions: [
      {
        id: 'driving_now',
        // Asked first because the answer changes what they should do in the
        // next five minutes, not just what we quote.
        text: 'Are you driving right now with the temperature high?',
        subtitle: 'Continuing to drive an overheating engine can destroy it within minutes.',
        type: 'single',
        options: [
          {
            id: 'driving',
            label: 'Yes, I am on the road',
            recommendedServiceCode: 'fw_towing',
            urgency: 'urgent',
          },
          { id: 'stopped', label: 'No, the car is parked' },
        ],
      },
      {
        id: 'when',
        text: 'When does it overheat?',
        type: 'single',
        showIf: { driving_now: ['stopped'] },
        options: [
          {
            id: 'in_traffic',
            label: 'Mainly in slow traffic, fine when moving',
            // No airflow at low speed points at the cooling fan.
            recommendedServiceCode: 'fw_radiator_fan_replacement',
          },
          {
            id: 'always',
            label: 'All the time, including on the open road',
            recommendedServiceCode: 'fw_coolant_service',
            urgency: 'high',
          },
          {
            id: 'quickly',
            label: 'Very soon after starting',
            recommendedServiceCode: 'fw_thermostat_replacement',
          },
        ],
      },
      {
        id: 'coolant',
        text: 'Is there coolant under the car or is the reservoir empty?',
        type: 'single',
        showIf: { when: ['always', 'in_traffic', 'quickly'] },
        options: [
          { id: 'leak', label: 'Yes, there is a leak or it is empty', recommendedServiceCode: 'fw_radiator_repair', urgency: 'high' },
          { id: 'no_leak', label: 'No, the level looks normal' },
        ],
      },
    ],
  },
];

module.exports = { FLOWS };
