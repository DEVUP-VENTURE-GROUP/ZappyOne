/**
 * Water & Tank Care diagnostic flows.
 *
 * §10 governs: a symptom is not a repair. "There's a leak" can be a loose
 * fitting a technician tightens in five minutes, or it can be a structural
 * crack in a tank nobody should reach without checking the space is safe to
 * enter first — recommending a repair price before knowing which is
 * guesswork with the customer's money, and in the second case a safety risk.
 *
 * THE SAFETY RULE (§24), same pattern as the EV and CNG hazard gates built for
 * the vehicle verticals: the confined-space / flooding question is asked
 * FIRST, with no `showIf`, so it can never be skipped. Any answer indicating
 * danger routes straight to an inspection — never to a priced repair, and
 * never auto-dispatched to whoever is nearest. A technician without the
 * confined-space qualification (skill level 3) must not be sent in blind.
 *
 * Trees are data. Admin edits them without a deploy (§16).
 */

const FLOWS = [
  /* ─── Leakage — the safety-gated worked example (§24) ─────────────────── */
  {
    code: 'wt_leak_triage',
    category: 'water_tank_care',
    title: 'Leakage diagnosis',
    description: 'Checks for an unsafe or confined-space situation first, then separates a simple fitting leak from structural damage.',
    problemCodes: ['wt_leakage'],
    questions: [
      {
        id: 'hazard',
        /*
         * Cannot be skipped. Flooding near electrical points, or a leak inside
         * a confined space, is not a same-day-fitting job — it needs someone
         * qualified to judge the space is safe before anyone climbs in or
         * works near standing water.
         */
        text: 'Is water actively flooding the area, or is the leak inside an underground / hard-to-access tank you cannot safely see into?',
        subtitle: 'If there is standing water near any electrical points, switch off power to that area if you can do so safely.',
        type: 'single',
        options: [
          {
            id: 'unsafe',
            label: 'Yes — flooding, or a confined/hard-to-reach tank',
            recommendedServiceCode: 'wt_health_inspection',
            urgency: 'urgent',
          },
          { id: 'safe', label: 'No — it is a visible drip I can point to' },
        ],
      },
      {
        id: 'location',
        text: 'Where exactly is it leaking from?',
        subtitle: 'This decides whether a technician can fix it on the spot or needs to open the tank up first.',
        type: 'single',
        showIf: { hazard: ['safe'] },
        options: [
          {
            id: 'fitting',
            label: 'A pipe joint, valve or fitting',
            recommendedServiceCode: 'wt_fitting_repair',
          },
          {
            id: 'wall',
            label: 'The tank wall or base itself',
            // A wall/base leak is structural, not a fitting swap — it needs
            // the tank opened up before anyone can quote it honestly.
            recommendedServiceCode: 'wt_structural_repair',
            urgency: 'high',
          },
          {
            id: 'not_sure',
            label: 'Not sure where it is coming from',
            recommendedServiceCode: 'wt_health_inspection',
          },
        ],
      },
      {
        id: 'severity',
        text: 'How much water is it losing?',
        type: 'single',
        showIf: { location: ['fitting'] },
        options: [
          { id: 'drip', label: 'A slow drip' },
          {
            id: 'steady',
            label: 'A steady, visible flow',
            recommendedServiceCode: 'wt_fitting_repair',
            urgency: 'high',
          },
        ],
      },
    ],
  },

  /* ─── Confined-space entry for damage/repair reports ──────────────────── */
  {
    code: 'wt_confined_space_check',
    category: 'water_tank_care',
    title: 'Access & safety check',
    description: 'Establishes whether reaching the tank needs confined-space entry before any repair is priced.',
    problemCodes: ['wt_crack_damage', 'wt_repair_unsure'],
    questions: [
      {
        id: 'access',
        text: 'Does reaching this tank mean climbing into a confined space — an underground sump, a tight service shaft, or similar?',
        subtitle: 'This is about how a technician reaches the tank, not how bad the damage looks.',
        type: 'single',
        options: [
          {
            id: 'confined',
            label: 'Yes, it needs confined-space entry',
            // Routed to an inspection so a confined-space-qualified technician
            // assesses it first — never straight to a priced repair.
            recommendedServiceCode: 'wt_health_inspection',
            urgency: 'urgent',
          },
          { id: 'open', label: 'No, it is easily and safely accessible' },
        ],
      },
      {
        id: 'observed',
        text: 'What have you actually noticed?',
        type: 'single',
        showIf: { access: ['open'] },
        options: [
          {
            id: 'crack',
            label: 'A visible crack',
            recommendedServiceCode: 'wt_structural_repair',
            urgency: 'high',
          },
          {
            id: 'unclear',
            label: 'Damage, but not sure of the cause',
            recommendedServiceCode: 'wt_health_inspection',
          },
        ],
      },
    ],
  },

  /* ─── Cleaning: when a symptom means "clean it" vs "look first" ───────── */
  {
    code: 'wt_cleaning_triage',
    category: 'water_tank_care',
    title: 'Water quality diagnosis',
    description: 'Separates routine overdue cleaning from a fresh tank that may have a different cause.',
    problemCodes: ['wt_visible_algae', 'wt_sediment_visible', 'wt_bad_smell', 'wt_water_dirty'],
    questions: [
      {
        id: 'recency',
        text: 'Has this tank been cleaned in the last 6 months?',
        type: 'single',
        options: [
          {
            id: 'recent',
            label: 'Yes, recently',
            /*
             * A tank cleaned within 6 months showing these symptoms again
             * usually has a different cause (a leak letting in contamination,
             * a damaged lid) — an inspection finds it rather than a repeat
             * clean that will not fix it.
             */
            recommendedServiceCode: 'wt_health_inspection',
          },
          { id: 'overdue', label: 'No, or not sure' },
        ],
      },
      {
        id: 'strength',
        text: 'How bad is it?',
        type: 'single',
        showIf: { recency: ['overdue'] },
        options: [
          { id: 'mild', label: 'Mild — some algae or slight tint', recommendedServiceCode: 'wt_deep_cleaning' },
          {
            id: 'strong',
            label: 'Strong smell or clearly dirty water',
            recommendedServiceCode: 'wt_deep_cleaning',
            urgency: 'high',
          },
        ],
      },
    ],
  },

  /* ─── Flushing: recently-serviced vs genuinely overdue ────────────────── */
  {
    code: 'wt_flushing_triage',
    category: 'water_tank_care',
    title: 'Flow diagnosis',
    description: 'Checks whether flushing is likely to help or whether something else needs a look first.',
    problemCodes: ['wt_low_flow', 'wt_water_taste_off'],
    questions: [
      {
        id: 'recency',
        text: 'When was the tank last cleaned or flushed?',
        type: 'single',
        options: [
          {
            id: 'recent',
            label: 'Within the last month',
            // Flushing again this soon is unlikely to be the actual fix.
            recommendedServiceCode: 'wt_health_inspection',
          },
          {
            id: 'overdue',
            label: 'More than a month ago, or not sure',
            recommendedServiceCode: 'wt_tank_pipe_flushing',
          },
        ],
      },
    ],
  },
];

module.exports = { FLOWS };
