/**
 * Two-wheeler diagnostic flows.
 *
 * §10 governs: a symptom is not a repair. "Won't start" can be a flat battery,
 * a dead starter motor, a fouled plug, an empty tank, a blown fuse or a seized
 * engine — six repairs spanning ₹150 to ₹15,000. Dispatching a battery because
 * someone tapped "won't start" is guesswork with the customer's money, and on a
 * roadside job it is also a wasted trip for the technician.
 *
 * Two rules shape every tree here:
 *
 *   CHEAP AND DECISIVE QUESTIONS FIRST. "Is there fuel in the tank?" costs
 *   nothing to ask and ends the diagnosis a surprising share of the time.
 *
 *   NEVER TRIAGE A SAFETY INCIDENT INTO A REPAIR. The EV battery tree opens by
 *   asking about heat, smell and swelling, and any yes routes straight to a
 *   safety inspection — not to a cheaper battery job, however much the customer
 *   would prefer that answer.
 *
 * Trees are data. Admin edits them without a deploy (§11).
 */

const FLOWS = [
  /* ─── Petrol: won't start — the §10 worked example ────────────────────── */
  {
    code: 'tw_no_start_petrol',
    category: 'two_wheeler',
    title: 'Starting diagnosis',
    description: 'Separates fuel, battery, starter, ignition and engine causes before anyone is dispatched.',
    problemCodes: [
      'tw_wont_start_roadside', 'tw_engine_not_starting', 'tw_self_start_not_working',
      'tw_kick_start_not_working', 'tw_engine_starts_and_stops', 'tw_stalling',
    ],
    questions: [
      {
        id: 'fuel',
        // Cheapest possible question, and it ends the diagnosis outright often
        // enough to be worth asking before anything electrical.
        text: 'Is there fuel in the tank?',
        subtitle: 'Worth checking the gauge before anything else — it is the most common cause.',
        type: 'single',
        options: [
          { id: 'empty', label: 'Empty or nearly empty', recommendedServiceCode: 'tw_fuel_delivery', urgency: 'high' },
          { id: 'has_fuel', label: 'There is fuel' },
          { id: 'unsure', label: 'Not sure' },
        ],
      },
      {
        id: 'lights',
        // Separates "no electrical power at all" from "power but won't turn over".
        text: 'When you turn the key, do the lights and dashboard come on?',
        subtitle: 'This tells us whether the battery is delivering power at all.',
        type: 'single',
        showIf: { fuel: ['has_fuel', 'unsure'] },
        options: [
          { id: 'nothing', label: 'Nothing at all — completely dead', urgency: 'high' },
          { id: 'dim', label: 'They come on but look weak or dim' },
          { id: 'normal', label: 'They come on normally' },
        ],
      },
      {
        id: 'self_start_sound',
        text: 'When you press the self-start, what happens?',
        subtitle: 'The sound tells us whether the starter is turning the engine over.',
        type: 'single',
        showIf: { lights: ['dim', 'normal'] },
        options: [
          {
            id: 'click',
            label: 'A single click, engine does not turn',
            // Classic weak-battery or starter-relay signature.
            recommendedServiceCode: 'tw_battery_replacement',
            urgency: 'high',
          },
          {
            id: 'silence',
            label: 'No sound at all',
            recommendedServiceCode: 'tw_starter_repair',
            urgency: 'high',
          },
          {
            id: 'cranks_no_fire',
            label: 'Engine turns over but does not fire',
            // Power is fine — this is fuel or spark.
            urgency: 'normal',
          },
          { id: 'cranks_slow', label: 'Turns over slowly', recommendedServiceCode: 'tw_battery_replacement' },
        ],
      },
      {
        id: 'kick_start',
        text: 'Does it start on the kick?',
        subtitle: 'If the kick works, the engine is fine and the fault is electrical.',
        type: 'single',
        showIf: { self_start_sound: ['click', 'silence'] },
        options: [
          {
            id: 'kick_works',
            label: 'Yes, it starts on the kick',
            // Engine proven good — narrow to the electrical start path.
            recommendedServiceCode: 'tw_battery_replacement',
            urgency: 'normal',
          },
          { id: 'kick_fails', label: 'No, it does not start on the kick either', urgency: 'high' },
          { id: 'no_kick', label: 'This vehicle has no kick-start' },
        ],
      },
      {
        id: 'recent_history',
        text: 'Anything unusual before this happened?',
        subtitle: 'Recent history often points straight at the cause.',
        type: 'single',
        // ONE key only. `showIf` is an AND across its keys, so naming both
        // `self_start_sound` and `kick_start` here meant the question could
        // only appear when the customer had answered both — which the tree
        // never asks them to. A bike that cranks without firing is the branch
        // that needs this question; the no-kick path already has an answer.
        showIf: { self_start_sound: ['cranks_no_fire'] },
        options: [
          { id: 'rain', label: 'Ridden through water or heavy rain', recommendedServiceCode: 'tw_spark_plug_replacement' },
          { id: 'stood', label: 'Stood unused for weeks', recommendedServiceCode: 'tw_carburetor_service' },
          { id: 'sputtering', label: 'Had been sputtering or losing power', recommendedServiceCode: 'tw_carburetor_service' },
          { id: 'noise', label: 'Made a loud noise then stopped', recommendedServiceCode: 'tw_engine_repair', urgency: 'high' },
          { id: 'nothing_unusual', label: 'Nothing unusual — it just stopped starting' },
        ],
      },
    ],
  },

  /* ─── Electric: no power / won't move, WITH the safety gate ───────────── */
  {
    code: 'tw_ev_no_power',
    category: 'two_wheeler',
    title: 'Electric vehicle power diagnosis',
    description: 'Checks for a thermal hazard first, then separates battery, controller, motor and charging faults.',
    problemCodes: [
      'tw_ev_battery_not_charging', 'tw_ev_battery_drains_fast', 'tw_ev_motor_not_running',
      'tw_ev_power_cutoff', 'tw_ev_not_accepting_charge', 'tw_ev_battery_not_detected',
      'tw_ev_reduced_range', 'tw_ev_slow_charging', 'tw_ev_charging_interrupted',
    ],
    questions: [
      {
        id: 'hazard',
        /*
         * This question comes first and cannot be skipped.
         *
         * A lithium pack that is hot, swollen or smells of burning is a fire
         * risk, and the correct response is to stop, not to book a technician
         * for Thursday. Every "yes" routes to the safety inspection regardless
         * of what the customer originally selected.
         */
        text: 'Is the battery hot, swollen, leaking, or does anything smell of burning?',
        subtitle: 'Please check before continuing. If any of these are true, stop using the vehicle and move it away from anything flammable.',
        type: 'single',
        options: [
          {
            id: 'hazard_yes',
            label: 'Yes — one or more of these is true',
            recommendedServiceCode: 'tw_ev_safety_inspection',
            urgency: 'urgent',
          },
          { id: 'hazard_no', label: 'No — nothing hot, swollen, leaking or burning' },
        ],
      },
      {
        id: 'dashboard',
        text: 'Does the dashboard or display turn on?',
        subtitle: 'This separates a dead pack from a fault further down the line.',
        type: 'single',
        showIf: { hazard: ['hazard_no'] },
        options: [
          { id: 'dash_off', label: 'Nothing lights up at all', urgency: 'high' },
          { id: 'dash_on', label: 'Yes, it lights up normally' },
          { id: 'dash_error', label: 'It lights up but shows an error', recommendedServiceCode: 'tw_ev_diagnostic_scan' },
        ],
      },
      {
        id: 'charging',
        text: 'What happens when you plug in the charger?',
        subtitle: 'The charger’s own indicator tells us a lot before anyone opens anything.',
        type: 'single',
        showIf: { dashboard: ['dash_off', 'dash_on', 'dash_error'] },
        options: [
          {
            id: 'charger_dead',
            label: 'The charger shows no light at all',
            recommendedServiceCode: 'tw_ev_charger_repair',
          },
          {
            id: 'charger_on_no_charge',
            label: 'Charger lights up but the vehicle does not charge',
            recommendedServiceCode: 'tw_ev_battery_diagnostic',
            urgency: 'high',
          },
          {
            id: 'charges_stops',
            label: 'It starts charging then stops partway',
            recommendedServiceCode: 'tw_ev_bms_service',
          },
          { id: 'charges_fine', label: 'It charges normally' },
        ],
      },
      {
        id: 'motor',
        text: 'With charge showing, does the vehicle move when you twist the throttle?',
        subtitle: 'Separates a drive fault from a battery one.',
        type: 'single',
        showIf: { charging: ['charges_fine'] },
        options: [
          {
            id: 'no_move',
            label: 'It does not move at all',
            recommendedServiceCode: 'tw_ev_motor_diagnostic',
            urgency: 'high',
          },
          {
            id: 'weak',
            label: 'It moves but feels weak or cuts out',
            recommendedServiceCode: 'tw_ev_controller_repair',
          },
          {
            id: 'range_short',
            label: 'It rides fine but the range is much shorter than it was',
            recommendedServiceCode: 'tw_ev_battery_diagnostic',
          },
        ],
      },
    ],
  },

  /* ─── Puncture: decides the repair before the technician leaves ───────── */
  {
    code: 'tw_puncture_triage',
    category: 'two_wheeler',
    title: 'Puncture diagnosis',
    description: 'Establishes tube or tubeless, and whether the tyre is repairable at all.',
    problemCodes: ['tw_puncture', 'tw_slow_puncture'],
    questions: [
      {
        id: 'tyre_type',
        // Decides which kit the technician packs. Getting this wrong is a
        // second trip, which on a roadside job is the whole service failing.
        text: 'Is the tyre tubeless or does it have a tube?',
        subtitle: 'Tubeless tyres usually say "TUBELESS" on the sidewall. If unsure, we will bring both.',
        type: 'single',
        options: [
          { id: 'tubeless', label: 'Tubeless', recommendedServiceCode: 'tw_puncture_tubeless' },
          { id: 'tube', label: 'Has a tube', recommendedServiceCode: 'tw_puncture_tube' },
          { id: 'unsure', label: 'Not sure' },
        ],
      },
      {
        id: 'condition',
        text: 'What does the tyre look like?',
        subtitle: 'A split sidewall cannot be safely patched, whatever the cause.',
        type: 'single',
        options: [
          { id: 'flat_only', label: 'Just flat — no visible damage' },
          { id: 'nail', label: 'There is a nail or object in the tread' },
          {
            id: 'sidewall',
            label: 'The side wall is cut or split',
            // Never patched — a sidewall repair fails at speed.
            recommendedServiceCode: 'tw_tyre_replacement',
            urgency: 'high',
          },
          { id: 'worn', label: 'The tyre is badly worn', recommendedServiceCode: 'tw_tyre_replacement' },
        ],
      },
    ],
  },

  /* ─── Brakes: a safety system, triaged as one ─────────────────────────── */
  {
    code: 'tw_brake_triage',
    category: 'two_wheeler',
    title: 'Brake diagnosis',
    description: 'Separates worn pads from hydraulic faults and disc damage.',
    problemCodes: [
      'tw_front_brake_problem', 'tw_rear_brake_problem', 'tw_brake_noise',
      'tw_brake_vibration', 'tw_brake_lever_soft', 'tw_brake_lever_hard',
    ],
    questions: [
      {
        id: 'symptom',
        text: 'What is the brake doing?',
        type: 'single',
        options: [
          { id: 'squeal', label: 'Squealing or grinding noise', recommendedServiceCode: 'tw_brake_pad_replacement' },
          {
            id: 'spongy',
            label: 'Lever feels soft or goes to the handlebar',
            // Air or fluid loss in a hydraulic system — never ride it.
            recommendedServiceCode: 'tw_brake_bleeding',
            urgency: 'high',
          },
          { id: 'hard', label: 'Lever feels hard or stiff', recommendedServiceCode: 'tw_brake_cable_replacement' },
          { id: 'pulsing', label: 'Pulsing or vibration when braking', recommendedServiceCode: 'tw_brake_disc_replacement' },
          { id: 'weak', label: 'Brakes but does not stop well', recommendedServiceCode: 'tw_brake_service', urgency: 'high' },
        ],
      },
      {
        id: 'fluid',
        text: 'Is there any fluid leaking near the lever, hose or caliper?',
        subtitle: 'A wet patch near the brake is always urgent.',
        type: 'single',
        showIf: { symptom: ['spongy', 'weak'] },
        options: [
          {
            id: 'leak',
            label: 'Yes, something is wet or leaking',
            recommendedServiceCode: 'tw_brake_fluid_change',
            urgency: 'urgent',
          },
          { id: 'no_leak', label: 'No, everything looks dry' },
        ],
      },
    ],
  },

  /* ─── Scooter: poor pickup is a CVT question, not an engine one ───────── */
  {
    code: 'tw_cvt_triage',
    category: 'two_wheeler',
    title: 'Scooter transmission diagnosis',
    description: 'Separates belt, roller and clutch-shoe wear from engine causes.',
    problemCodes: [
      'tw_scooter_poor_pickup', 'tw_cvt_noise', 'tw_cvt_vibration',
      'tw_transmission_slipping', 'tw_cvt_belt_issue',
    ],
    questions: [
      {
        id: 'behaviour',
        text: 'What does it feel like when you accelerate?',
        type: 'single',
        options: [
          {
            id: 'revs_no_speed',
            label: 'Engine revs high but the scooter barely moves',
            // The belt is slipping — the definitive CVT symptom.
            recommendedServiceCode: 'tw_cvt_belt_replacement',
            urgency: 'high',
          },
          { id: 'slow_pickup', label: 'Pickup is slow but steady', recommendedServiceCode: 'tw_cvt_roller_replacement' },
          { id: 'juddering', label: 'Juddering or shuddering as it pulls away', recommendedServiceCode: 'tw_clutch_shoe_replacement' },
          { id: 'noise_only', label: 'Mainly a noise — pickup is fine', recommendedServiceCode: 'tw_cvt_service' },
        ],
      },
      {
        id: 'distance',
        text: 'Roughly how far has the scooter run?',
        subtitle: 'Belts and rollers are wear items with a known service life.',
        type: 'single',
        /*
         * CONTEXT, NOT A DIAGNOSIS — so no option here recommends a repair.
         *
         * The engine weights later answers more heavily, on the sound
         * assumption that a follow-up question is MORE specific than the one
         * before it. That is true of a narrowing question and false of a
         * supplementary one: mileage tells the technician what to expect to
         * find, it does not identify the fault. When this question carried a
         * recommendation it outvoted "engine revs but the scooter barely
         * moves" — which is the textbook slipping belt — and the customer was
         * sold a service instead of the belt they actually needed.
         *
         * Rule for authoring: only give an option a `recommendedServiceCode`
         * if answering it that way genuinely settles the diagnosis.
         */
        options: [
          { id: 'under_15k', label: 'Under 15,000 km' },
          { id: '15k_30k', label: '15,000 – 30,000 km' },
          { id: 'over_30k', label: 'Over 30,000 km' },
          { id: 'unknown', label: 'Not sure' },
        ],
      },
    ],
  },

  /* ─── Battery & charging on a petrol bike ─────────────────────────────── */
  {
    code: 'tw_battery_triage',
    category: 'two_wheeler',
    title: 'Battery diagnosis',
    description: 'Separates a worn battery from a charging-system fault that would kill the next one too.',
    problemCodes: [
      'tw_battery_draining', 'tw_battery_weak', 'tw_battery_not_charging',
      'tw_battery_dead_roadside', 'tw_headlight_dim',
    ],
    questions: [
      {
        id: 'age',
        text: 'How old is the battery?',
        type: 'single',
        options: [
          { id: 'under_1', label: 'Less than a year' },
          { id: '1_to_3', label: '1 – 3 years' },
          { id: 'over_3', label: 'More than 3 years', recommendedServiceCode: 'tw_battery_replacement' },
          { id: 'unknown', label: 'Not sure' },
        ],
      },
      {
        id: 'after_ride',
        /*
         * The question that stops the same fault happening twice.
         *
         * A battery that dies again after a long ride was never the problem —
         * the charging system is not replenishing it, and fitting a new battery
         * just sells the customer the same failure a month later.
         */
        text: 'After riding for 20–30 minutes, does it start again normally?',
        subtitle: 'If riding does not recharge it, the charging system is at fault, not the battery.',
        type: 'single',
        showIf: { age: ['under_1', '1_to_3', 'unknown'] },
        options: [
          { id: 'starts_after', label: 'Yes, it starts fine after a ride', recommendedServiceCode: 'tw_battery_replacement' },
          {
            id: 'still_dead',
            label: 'No, it still will not start',
            recommendedServiceCode: 'tw_stator_repair',
            urgency: 'high',
          },
          { id: 'not_tried', label: 'I have not been able to ride it' },
        ],
      },
    ],
  },
];

module.exports = { FLOWS };
