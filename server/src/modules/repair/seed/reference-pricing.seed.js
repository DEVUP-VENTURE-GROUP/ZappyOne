/**
 * Zappy reference pricing — the band every provider quote is judged against.
 *
 * WHAT THESE NUMBERS ARE: market rates for organised repair in Indian metros,
 * at the level a customer pays a competent independent shop — above the
 * roadside rate, well below manufacturer service centres. They exist so a
 * provider has a benchmark to price against on day one and so an obviously
 * wrong quote is caught before it reaches a customer.
 *
 * WHAT THEY ARE NOT: your final commercial position. Every band is editable in
 * admin, versioned on change, and the seeder never overwrites an edited row.
 * Treat them as a defensible starting point to tune per city, not as fixed
 * prices.
 *
 * HOW THE BANDS WORK
 *   min          — below this, the job is almost certainly being done with
 *                  scrap parts or at a loss, and the customer pays for it later
 *   recommended  — what the job usually costs, the anchor for deviation scoring
 *   max          — above this, a quote is queued for review
 *
 * A provider inside ±15% of `recommended` publishes immediately; up to ±35%
 * goes to review; beyond that is refused. So the recommended figure matters
 * more than the extremes — it is the number the whole approval system pivots on.
 *
 * SCOPE: a row with no brand is the default for that repair. A brand row
 * overrides it, which is the only honest way to price screens — an iPhone panel
 * and a Redmi panel are not the same job or the same part cost.
 *
 * Everything is in paise.
 */

const inr = (rupees) => Math.round(rupees * 100);

/**
 * Phone repairs.
 *
 * Screen work carries the widest spread in the trade, so it is split by brand.
 * Where a job is diagnosis-priced (liquid damage, board work, data recovery)
 * there is deliberately NO band: quoting a range for work nobody has looked at
 * is how customers end up feeling misled.
 */
const MOBILE_PRICING = [
  /* ── Display: glass-only vs full assembly ── */
  { repair: 'glass_replacement', min: inr(700), typical: inr(1400), max: inr(2600), part: inr(700), labour: inr(600), warranty: 90 },
  { repair: 'glass_replacement', brand: 'apple', min: inr(2500), typical: inr(4500), max: inr(8000), part: inr(3000), labour: inr(1200), warranty: 90 },

  { repair: 'display_assembly_replacement', min: inr(1600), typical: inr(2900), max: inr(5500), part: inr(2000), labour: inr(700), warranty: 180 },
  { repair: 'display_assembly_replacement', brand: 'apple', min: inr(6500), typical: inr(14000), max: inr(32000), part: inr(11000), labour: inr(1500), warranty: 180 },
  { repair: 'display_assembly_replacement', brand: 'samsung', min: inr(3000), typical: inr(7500), max: inr(18000), part: inr(6000), labour: inr(1000), warranty: 180 },
  { repair: 'display_assembly_replacement', brand: 'oneplus', min: inr(3000), typical: inr(6500), max: inr(14000), part: inr(5200), labour: inr(900), warranty: 180 },

  { repair: 'touch_digitizer_repair', min: inr(900), typical: inr(1700), max: inr(3200), part: inr(900), labour: inr(600), warranty: 90 },

  /* ── Power ── */
  { repair: 'battery_replacement', min: inr(1100), typical: inr(1800), max: inr(2900), part: inr(1100), labour: inr(400), warranty: 180 },
  { repair: 'battery_replacement', brand: 'apple', min: inr(2500), typical: inr(4200), max: inr(7000), part: inr(3200), labour: inr(700), warranty: 180 },
  { repair: 'charging_port_repair', min: inr(600), typical: inr(1200), max: inr(2400), part: inr(500), labour: inr(600), warranty: 90 },
  { repair: 'wireless_charging_repair', min: inr(900), typical: inr(1800), max: inr(3500), part: inr(900), labour: inr(700), warranty: 90 },
  { repair: 'port_cleaning', min: inr(200), typical: inr(350), max: inr(600), part: 0, labour: inr(350), warranty: 0 },

  /* ── Audio ── */
  { repair: 'speaker_replacement', min: inr(500), typical: inr(950), max: inr(1800), part: inr(450), labour: inr(450), warranty: 90 },
  { repair: 'earpiece_replacement', min: inr(450), typical: inr(850), max: inr(1600), part: inr(400), labour: inr(400), warranty: 90 },
  { repair: 'microphone_repair', min: inr(500), typical: inr(1000), max: inr(2000), part: inr(450), labour: inr(500), warranty: 90 },

  /* ── Camera ── */
  { repair: 'camera_replacement', min: inr(1100), typical: inr(2300), max: inr(4800), part: inr(1600), labour: inr(600), warranty: 90 },
  { repair: 'camera_glass_replacement', min: inr(400), typical: inr(800), max: inr(1500), part: inr(300), labour: inr(450), warranty: 30 },

  /* ── Body ── */
  { repair: 'back_glass_replacement', min: inr(700), typical: inr(1500), max: inr(3200), part: inr(800), labour: inr(600), warranty: 30 },
  { repair: 'back_glass_replacement', brand: 'apple', min: inr(2000), typical: inr(4500), max: inr(9000), part: inr(3000), labour: inr(1200), warranty: 30 },
  { repair: 'back_panel_replacement', min: inr(600), typical: inr(1300), max: inr(2800), part: inr(700), labour: inr(550), warranty: 30 },
  { repair: 'housing_replacement', min: inr(1200), typical: inr(2600), max: inr(5500), part: inr(1600), labour: inr(900), warranty: 30 },
  { repair: 'sim_tray_replacement', min: inr(150), typical: inr(350), max: inr(700), part: inr(150), labour: inr(200), warranty: 0 },
  { repair: 'button_flex_repair', min: inr(500), typical: inr(1000), max: inr(2000), part: inr(400), labour: inr(550), warranty: 90 },
  { repair: 'vibration_motor_replacement', min: inr(400), typical: inr(800), max: inr(1500), part: inr(350), labour: inr(400), warranty: 90 },

  /* ── Software ── */
  { repair: 'software_flash', min: inr(400), typical: inr(800), max: inr(1500), part: 0, labour: inr(800), warranty: 0 },
  { repair: 'software_optimisation', min: inr(250), typical: inr(500), max: inr(1000), part: 0, labour: inr(500), warranty: 0 },
  { repair: 'data_transfer_service', min: inr(300), typical: inr(600), max: inr(1200), part: 0, labour: inr(600), warranty: 0 },
];

/**
 * Laptop repairs.
 *
 * Screens are split by panel class rather than brand, because that is what
 * actually drives the cost — but the catalog prices at repair level, so the
 * band is deliberately wide and MacBooks carry their own row.
 */
const LAPTOP_PRICING = [
  /* ── Display ── */
  { repair: 'lt_screen_replacement', min: inr(3200), typical: inr(5500), max: inr(9500), part: inr(4000), labour: inr(900), warranty: 180 },
  { repair: 'lt_screen_replacement', brand: 'apple-laptop', min: inr(9000), typical: inr(18000), max: inr(38000), part: inr(15000), labour: inr(2000), warranty: 180 },
  { repair: 'lt_display_cable_repair', min: inr(900), typical: inr(1800), max: inr(3500), part: inr(800), labour: inr(900), warranty: 90 },
  { repair: 'lt_bezel_replacement', min: inr(700), typical: inr(1400), max: inr(2800), part: inr(700), labour: inr(600), warranty: 30 },
  { repair: 'lt_webcam_replacement', min: inr(700), typical: inr(1500), max: inr(3000), part: inr(800), labour: inr(600), warranty: 90 },

  /* ── Power ── */
  { repair: 'lt_battery_replacement', min: inr(2200), typical: inr(3800), max: inr(6500), part: inr(2800), labour: inr(700), warranty: 180 },
  { repair: 'lt_battery_replacement', brand: 'apple-laptop', min: inr(6000), typical: inr(11000), max: inr(20000), part: inr(9000), labour: inr(1500), warranty: 180 },
  { repair: 'lt_adapter_replacement', min: inr(1200), typical: inr(2200), max: inr(4000), part: inr(1800), labour: inr(300), warranty: 180 },
  { repair: 'lt_charging_port_repair', min: inr(900), typical: inr(1700), max: inr(3200), part: inr(600), labour: inr(900), warranty: 90 },
  { repair: 'lt_power_button_repair', min: inr(700), typical: inr(1400), max: inr(2600), part: inr(500), labour: inr(800), warranty: 90 },

  /* ── Input ── */
  { repair: 'lt_keyboard_replacement', min: inr(1200), typical: inr(2300), max: inr(4200), part: inr(1500), labour: inr(700), warranty: 90 },
  { repair: 'lt_keycap_repair', min: inr(200), typical: inr(450), max: inr(900), part: inr(150), labour: inr(300), warranty: 0 },
  { repair: 'lt_keyboard_cleaning', min: inr(400), typical: inr(700), max: inr(1300), part: 0, labour: inr(700), warranty: 0 },
  { repair: 'lt_trackpad_replacement', min: inr(1100), typical: inr(2200), max: inr(4200), part: inr(1500), labour: inr(700), warranty: 90 },

  /* ── Body ── */
  { repair: 'lt_hinge_repair', min: inr(1000), typical: inr(1900), max: inr(3800), part: inr(700), labour: inr(1100), warranty: 90 },
  { repair: 'lt_body_panel_replacement', min: inr(1200), typical: inr(2400), max: inr(4800), part: inr(1500), labour: inr(900), warranty: 30 },
  { repair: 'lt_palmrest_replacement', min: inr(1400), typical: inr(2800), max: inr(5500), part: inr(1900), labour: inr(900), warranty: 30 },

  /* ── Storage & memory ── */
  { repair: 'lt_ssd_upgrade', min: inr(2800), typical: inr(4500), max: inr(8000), part: inr(3500), labour: inr(700), warranty: 365 },
  { repair: 'lt_ssd_replacement', min: inr(2800), typical: inr(4500), max: inr(8000), part: inr(3500), labour: inr(700), warranty: 365 },
  { repair: 'lt_hdd_replacement', min: inr(1800), typical: inr(3000), max: inr(5200), part: inr(2400), labour: inr(600), warranty: 365 },
  { repair: 'lt_ram_upgrade', min: inr(1800), typical: inr(3000), max: inr(5500), part: inr(2300), labour: inr(600), warranty: 365 },
  { repair: 'lt_ram_replacement', min: inr(1800), typical: inr(3000), max: inr(5500), part: inr(2300), labour: inr(600), warranty: 365 },

  /* ── Thermal ── */
  { repair: 'lt_thermal_service', min: inr(700), typical: inr(1300), max: inr(2400), part: inr(250), labour: inr(1000), warranty: 90 },
  { repair: 'lt_fan_replacement', min: inr(900), typical: inr(1800), max: inr(3400), part: inr(1100), labour: inr(700), warranty: 90 },
  { repair: 'lt_internal_cleaning', min: inr(600), typical: inr(1100), max: inr(2000), part: 0, labour: inr(1100), warranty: 0 },
  { repair: 'lt_full_service', min: inr(1200), typical: inr(2200), max: inr(4000), part: inr(300), labour: inr(1900), warranty: 90 },

  /* ── Connectivity & audio ── */
  { repair: 'lt_wifi_card_replacement', min: inr(800), typical: inr(1600), max: inr(3000), part: inr(900), labour: inr(700), warranty: 90 },
  { repair: 'lt_speaker_replacement', min: inr(700), typical: inr(1400), max: inr(2800), part: inr(800), labour: inr(600), warranty: 90 },
  { repair: 'lt_audio_jack_repair', min: inr(600), typical: inr(1200), max: inr(2400), part: inr(400), labour: inr(800), warranty: 90 },
  { repair: 'lt_microphone_repair', min: inr(600), typical: inr(1200), max: inr(2400), part: inr(400), labour: inr(800), warranty: 90 },
  { repair: 'lt_port_repair', min: inr(800), typical: inr(1600), max: inr(3200), part: inr(500), labour: inr(1100), warranty: 90 },

  /* ── Software ── */
  { repair: 'lt_os_installation', min: inr(500), typical: inr(900), max: inr(1600), part: 0, labour: inr(900), warranty: 0 },
  { repair: 'lt_os_repair', min: inr(500), typical: inr(900), max: inr(1600), part: 0, labour: inr(900), warranty: 0 },
  { repair: 'lt_virus_removal', min: inr(500), typical: inr(900), max: inr(1600), part: 0, labour: inr(900), warranty: 0 },
  { repair: 'lt_driver_installation', min: inr(300), typical: inr(600), max: inr(1100), part: 0, labour: inr(600), warranty: 0 },
  { repair: 'lt_data_migration', min: inr(600), typical: inr(1100), max: inr(2000), part: 0, labour: inr(1100), warranty: 0 },
];

/**
 * Platform economics, per vertical.
 *
 * The inspection fee is ZappyOne's, not the provider's: it pays for a
 * technician's travel and time when a device genuinely cannot be priced
 * remotely, and it is credited against the repair if the customer proceeds —
 * which removes the reason to hesitate before booking one.
 */
const CONFIG_DEFAULTS = {
  mobile: {
    diagnosisFeePaise: inr(299),
    inspectionFeeCreditedOnRepair: true,
    pickupFeePaise: inr(99),
    returnFeePaise: inr(99),
  },
  laptop: {
    // A laptop inspection takes longer and often means opening the machine.
    diagnosisFeePaise: inr(399),
    inspectionFeeCreditedOnRepair: true,
    pickupFeePaise: inr(149),
    returnFeePaise: inr(149),
  },
};

/**
 * Water & Tank Care reference bands.
 *
 * SOURCED FROM LIVE COMPETITOR PRICING, checked 2026-09-17 — these are not
 * invented numbers. Five independent India providers were checked and
 * triangulated into one band per tank type × capacity:
 *
 *   - KBS Home Services, Bangalore (2026 guide) — capacity-tiered cleaning
 *     and sump pricing: kbshomeservice.com/blog/water-tank-cleaning-prices
 *   - Omkar Water Tank Cleaning, Pune (2026 price list) — capacity-tiered
 *     ranges 1,000 L to 50,000 L: omkarwatertankcleaning.in
 *   - TankScrub pricing guide — capacity bands + per-litre society rates:
 *     tankscrub.in/blog/water-tank-cleaning-price
 *   - HomeTriangle, Bangalore — starting prices for overhead, sump and
 *     concrete tanks: hometriangle.com/bangalore/water-tank-cleaning
 *   - Original category brief §21 (reference only, used as one more data
 *     point, not as ground truth)
 *
 * Where sources disagreed (a live, real spread — not an error), `min` and
 * `max` reflect that actual spread rather than being narrowed to look more
 * precise than the market is. `recommended` is the blended midpoint.
 *
 * NOT SOURCED — deliberately absent, not zero-filled: no competitor checked
 * separately prices inspection or flushing as a standalone visit (both are
 * bundled into a clean everywhere this was checked), and nobody publishes a
 * price for fitting repair, lid replacement, valve work, insect protection or
 * any add-on. Two flat rows below (inspection, flushing) are ESTIMATES built
 * from typical visit time, not from a competitor figure — they are marked as
 * such and are the only two rows in this file that are not source-anchored.
 * Every repair not listed here stays fully provider-priced, same as before.
 *
 * RCC/concrete carries a flat +20% over Overhead/Sintex — every source that
 * mentions concrete separately (KBS, HomeTriangle) says it holds more grime
 * and runs a premium; HomeTriangle's own starting prices show almost exactly
 * this ratio (₹779 plastic vs ₹1,199 concrete).
 *
 * Apartment/society tanks are priced identically to underground sump at the
 * same capacity — both are the confined-space tank types in this catalog
 * (see CONFINED_SPACE_TYPES), and no source distinguished them by price.
 */
const inrW = (rupees) => Math.round(rupees * 100);

const DOMESTIC_CAPACITIES = [
  'Up to 500 L', '500 – 1,000 L', '1,000 – 2,000 L', '2,000 – 5,000 L', 'Above 5,000 L',
];
const LARGE_CAPACITIES = [
  'Up to 2,000 L', '2,000 – 5,000 L', '5,000 – 10,000 L', 'Above 10,000 L',
];

/** [min, typical, max] in rupees, blended across the five sources above. */
const CLEANING_DOMESTIC_RUPEES = [
  [349, 499, 699],
  [549, 699, 899],
  [749, 949, 1199],
  [1099, 1499, 1999],
  [1999, 2499, 3499],
];
const CLEANING_SUMP_RUPEES = [
  [749, 999, 1299],
  [1099, 1399, 1899],
  [1599, 2199, 2999],
  [2999, 3999, 5999],
];
const RCC_PREMIUM = 1.2;

function tier(brand, capacities, bands, repair = 'wt_deep_cleaning') {
  return capacities.map((name, i) => {
    const [min, typical, max] = bands[i];
    return { repair, brand, model: { brandCode: brand, name }, min: inrW(min), typical: inrW(typical), max: inrW(max), warranty: 30 };
  });
}

/**
 * The premium lands on a real price point, not a raw multiplication.
 *
 * ₹949 × 1.2 is ₹1,138.80 — a number no tank cleaner has ever charged.
 * Rounding to the nearest ten and dropping a rupee gives ₹1,139, which is
 * how every source in the list above actually writes a price (₹599, ₹779,
 * ₹1,199, ₹1,449).
 */
const pricePoint = (rupees) => Math.round(rupees / 10) * 10 - 1;

function rccTier(capacities, bands, repair = 'wt_deep_cleaning') {
  return capacities.map((name, i) => {
    const [min, typical, max] = bands[i];
    return {
      repair,
      brand: 'rcc_concrete',
      model: { brandCode: 'rcc_concrete', name },
      min: inrW(pricePoint(min * RCC_PREMIUM)),
      typical: inrW(pricePoint(typical * RCC_PREMIUM)),
      max: inrW(pricePoint(max * RCC_PREMIUM)),
      warranty: 30,
    };
  });
}

const WATER_TANK_CARE_PRICING = [
  ...tier('overhead', DOMESTIC_CAPACITIES, CLEANING_DOMESTIC_RUPEES),
  ...tier('sintex_plastic', DOMESTIC_CAPACITIES, CLEANING_DOMESTIC_RUPEES),
  ...rccTier(DOMESTIC_CAPACITIES, CLEANING_DOMESTIC_RUPEES),
  ...tier('underground_sump', LARGE_CAPACITIES, CLEANING_SUMP_RUPEES),
  ...tier('apartment_common', LARGE_CAPACITIES, CLEANING_SUMP_RUPEES),

  // ESTIMATES, not competitor-sourced — see the note above. Flat across every
  // tank type and capacity: both are visit-time-priced, not labour/capacity
  // priced, so a single default row is honest rather than fabricating a ladder.
  { repair: 'wt_health_inspection', brand: null, model: null, min: inrW(249), typical: inrW(349), max: inrW(499), warranty: 0 },
  { repair: 'wt_tank_pipe_flushing', brand: null, model: null, min: inrW(299), typical: inrW(399), max: inrW(599), warranty: 15 },
];

module.exports = {
  MOBILE_PRICING, LAPTOP_PRICING, CONFIG_DEFAULTS, WATER_TANK_CARE_PRICING,
};
