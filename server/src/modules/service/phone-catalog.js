/**
 * Phone Model Catalog & Spare Parts Price Engine
 * ---------------------------------------------------------------------------
 * Competitors like Cashify and iFixit have model-specific pricing.
 * We go deeper: brand → series → model → repair type → quality tier → price.
 *
 * This is the source of truth for mobile repair pricing.
 * Admin can override any price via vertical-config spare parts.
 * Fallback chain: exact model → series → brand 'all' → hardcoded labor range.
 * ---------------------------------------------------------------------------
 */

/* Brand hierarchy */
const PHONE_BRANDS = ['Apple', 'Samsung', 'OnePlus', 'Xiaomi', 'Vivo', 'Oppo', 'Realme', 'Motorola', 'Nokia', 'Others'];

const PHONE_CATALOG = {
  Apple: {
    label: 'Apple iPhone',
    series: {
      'iPhone 15 Series': {
        models: ['iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max'],
        pricing: {
          screen_replacement: { OEM: 420000, Compatible: 280000, Budget: 180000 },
          battery_replacement:{ OEM: 140000, Compatible:  90000, Budget:  60000 },
          charging_issue:     { OEM:  60000, Compatible:  35000, Budget:  25000 },
          speaker_mic_issue:  { OEM:  70000, Compatible:  45000, Budget:  30000 },
          software_issue:     { OEM:  50000, Compatible:  50000, Budget:  50000 },
        },
        warrantyByTier: { OEM: 90, Compatible: 30, Budget: 7 },
      },
      'iPhone 14 Series': {
        models: ['iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max'],
        pricing: {
          screen_replacement: { OEM: 340000, Compatible: 220000, Budget: 140000 },
          battery_replacement:{ OEM: 120000, Compatible:  80000, Budget:  55000 },
          charging_issue:     { OEM:  55000, Compatible:  32000, Budget:  22000 },
          speaker_mic_issue:  { OEM:  65000, Compatible:  40000, Budget:  28000 },
          software_issue:     { OEM:  50000, Compatible:  50000, Budget:  50000 },
        },
        warrantyByTier: { OEM: 90, Compatible: 30, Budget: 7 },
      },
      'iPhone 13 Series': {
        models: ['iPhone 13', 'iPhone 13 Mini', 'iPhone 13 Pro', 'iPhone 13 Pro Max'],
        pricing: {
          screen_replacement: { OEM: 280000, Compatible: 180000, Budget: 110000 },
          battery_replacement:{ OEM: 100000, Compatible:  70000, Budget:  45000 },
          charging_issue:     { OEM:  50000, Compatible:  30000, Budget:  20000 },
          speaker_mic_issue:  { OEM:  60000, Compatible:  38000, Budget:  25000 },
          software_issue:     { OEM:  50000, Compatible:  50000, Budget:  50000 },
        },
        warrantyByTier: { OEM: 90, Compatible: 30, Budget: 7 },
      },
      'iPhone 12 & Older': {
        models: ['iPhone 12', 'iPhone 12 Pro', 'iPhone 11', 'iPhone XR', 'iPhone XS', 'iPhone X', 'iPhone 8', 'iPhone 7', 'Older'],
        pricing: {
          screen_replacement: { OEM: 200000, Compatible: 130000, Budget:  80000 },
          battery_replacement:{ OEM:  80000, Compatible:  55000, Budget:  35000 },
          charging_issue:     { OEM:  45000, Compatible:  28000, Budget:  18000 },
          speaker_mic_issue:  { OEM:  55000, Compatible:  35000, Budget:  22000 },
          software_issue:     { OEM:  50000, Compatible:  50000, Budget:  50000 },
        },
        warrantyByTier: { OEM: 90, Compatible: 30, Budget: 7 },
      },
    },
  },

  Samsung: {
    label: 'Samsung Galaxy',
    series: {
      'Galaxy S24 Series': {
        models: ['Galaxy S24', 'Galaxy S24+', 'Galaxy S24 Ultra'],
        pricing: {
          screen_replacement: { OEM: 320000, Compatible: 200000, Budget: 120000 },
          battery_replacement:{ OEM: 110000, Compatible:  72000, Budget:  48000 },
          charging_issue:     { OEM:  50000, Compatible:  30000, Budget:  20000 },
          speaker_mic_issue:  { OEM:  58000, Compatible:  36000, Budget:  24000 },
          software_issue:     { OEM:  40000, Compatible:  40000, Budget:  40000 },
        },
        warrantyByTier: { OEM: 90, Compatible: 30, Budget: 7 },
      },
      'Galaxy S23 Series': {
        models: ['Galaxy S23', 'Galaxy S23+', 'Galaxy S23 Ultra', 'Galaxy S23 FE'],
        pricing: {
          screen_replacement: { OEM: 260000, Compatible: 170000, Budget: 100000 },
          battery_replacement:{ OEM:  95000, Compatible:  62000, Budget:  42000 },
          charging_issue:     { OEM:  45000, Compatible:  28000, Budget:  18000 },
          speaker_mic_issue:  { OEM:  52000, Compatible:  33000, Budget:  22000 },
          software_issue:     { OEM:  40000, Compatible:  40000, Budget:  40000 },
        },
        warrantyByTier: { OEM: 90, Compatible: 30, Budget: 7 },
      },
      'Galaxy A Series': {
        models: ['Galaxy A55', 'Galaxy A35', 'Galaxy A15', 'Galaxy A54', 'Galaxy A34', 'Galaxy A25', 'Galaxy A14', 'Galaxy A13', 'Older A Series'],
        pricing: {
          screen_replacement: { OEM: 130000, Compatible: 85000, Budget: 55000 },
          battery_replacement:{ OEM:  70000, Compatible: 45000, Budget: 30000 },
          charging_issue:     { OEM:  35000, Compatible: 22000, Budget: 15000 },
          speaker_mic_issue:  { OEM:  40000, Compatible: 26000, Budget: 17000 },
          software_issue:     { OEM:  35000, Compatible: 35000, Budget: 35000 },
        },
        warrantyByTier: { OEM: 60, Compatible: 30, Budget: 7 },
      },
      'Galaxy M / F Series': {
        models: ['Galaxy M34', 'Galaxy M14', 'Galaxy F55', 'Galaxy F15', 'Other M/F'],
        pricing: {
          screen_replacement: { OEM: 110000, Compatible: 72000, Budget: 48000 },
          battery_replacement:{ OEM:  60000, Compatible: 40000, Budget: 28000 },
          charging_issue:     { OEM:  30000, Compatible: 20000, Budget: 13000 },
          speaker_mic_issue:  { OEM:  35000, Compatible: 23000, Budget: 15000 },
          software_issue:     { OEM:  35000, Compatible: 35000, Budget: 35000 },
        },
        warrantyByTier: { OEM: 60, Compatible: 30, Budget: 7 },
      },
    },
  },

  OnePlus: {
    label: 'OnePlus',
    series: {
      'OnePlus 12 Series': {
        models: ['OnePlus 12', 'OnePlus 12R'],
        pricing: {
          screen_replacement: { OEM: 280000, Compatible: 180000, Budget: 110000 },
          battery_replacement:{ OEM:  95000, Compatible: 62000,  Budget:  42000 },
          charging_issue:     { OEM:  45000, Compatible: 28000,  Budget:  18000 },
          speaker_mic_issue:  { OEM:  52000, Compatible: 34000,  Budget:  22000 },
          software_issue:     { OEM:  40000, Compatible: 40000,  Budget:  40000 },
        },
        warrantyByTier: { OEM: 90, Compatible: 30, Budget: 7 },
      },
      'OnePlus Nord Series': {
        models: ['OnePlus Nord CE4', 'OnePlus Nord 4', 'OnePlus Nord CE3', 'OnePlus Nord 3', 'Older Nord'],
        pricing: {
          screen_replacement: { OEM: 150000, Compatible: 100000, Budget:  65000 },
          battery_replacement:{ OEM:  75000, Compatible:  50000, Budget:  33000 },
          charging_issue:     { OEM:  38000, Compatible:  24000, Budget:  16000 },
          speaker_mic_issue:  { OEM:  44000, Compatible:  28000, Budget:  18000 },
          software_issue:     { OEM:  38000, Compatible:  38000, Budget:  38000 },
        },
        warrantyByTier: { OEM: 60, Compatible: 30, Budget: 7 },
      },
    },
  },

  Xiaomi: {
    label: 'Xiaomi / Redmi / POCO',
    series: {
      'Xiaomi 14 Series': {
        models: ['Xiaomi 14', 'Xiaomi 14 Pro'],
        pricing: {
          screen_replacement: { OEM: 240000, Compatible: 155000, Budget:  95000 },
          battery_replacement:{ OEM:  88000, Compatible:  57000, Budget:  38000 },
          charging_issue:     { OEM:  42000, Compatible:  26000, Budget:  17000 },
          speaker_mic_issue:  { OEM:  48000, Compatible:  30000, Budget:  20000 },
          software_issue:     { OEM:  38000, Compatible:  38000, Budget:  38000 },
        },
        warrantyByTier: { OEM: 90, Compatible: 30, Budget: 7 },
      },
      'Redmi Note Series': {
        models: ['Redmi Note 13 Pro+', 'Redmi Note 13 Pro', 'Redmi Note 13', 'Redmi Note 12', 'Older Note'],
        pricing: {
          screen_replacement: { OEM: 120000, Compatible:  80000, Budget:  52000 },
          battery_replacement:{ OEM:  65000, Compatible:  43000, Budget:  29000 },
          charging_issue:     { OEM:  32000, Compatible:  20000, Budget:  13000 },
          speaker_mic_issue:  { OEM:  37000, Compatible:  24000, Budget:  16000 },
          software_issue:     { OEM:  35000, Compatible:  35000, Budget:  35000 },
        },
        warrantyByTier: { OEM: 60, Compatible: 30, Budget: 7 },
      },
      'Redmi / POCO Budget': {
        models: ['Redmi 13', 'Redmi 12', 'POCO X6', 'POCO M6', 'POCO C65', 'Other Budget'],
        pricing: {
          screen_replacement: { OEM: 90000, Compatible: 60000, Budget:  40000 },
          battery_replacement:{ OEM: 55000, Compatible: 36000, Budget:  24000 },
          charging_issue:     { OEM: 28000, Compatible: 18000, Budget:  12000 },
          speaker_mic_issue:  { OEM: 32000, Compatible: 20000, Budget:  14000 },
          software_issue:     { OEM: 32000, Compatible: 32000, Budget:  32000 },
        },
        warrantyByTier: { OEM: 60, Compatible: 30, Budget: 7 },
      },
    },
  },

  Vivo: {
    label: 'Vivo',
    series: {
      'Vivo V Series': {
        models: ['Vivo V30 Pro', 'Vivo V30', 'Vivo V29', 'Vivo V27', 'Older V'],
        pricing: {
          screen_replacement: { OEM: 170000, Compatible: 110000, Budget:  72000 },
          battery_replacement:{ OEM:  78000, Compatible:  51000, Budget:  34000 },
          charging_issue:     { OEM:  38000, Compatible:  24000, Budget:  16000 },
          speaker_mic_issue:  { OEM:  44000, Compatible:  28000, Budget:  18000 },
          software_issue:     { OEM:  38000, Compatible:  38000, Budget:  38000 },
        },
        warrantyByTier: { OEM: 60, Compatible: 30, Budget: 7 },
      },
      'Vivo Y / T Series': {
        models: ['Vivo Y100', 'Vivo Y58', 'Vivo T3', 'Vivo T2', 'Other Y/T'],
        pricing: {
          screen_replacement: { OEM: 100000, Compatible: 66000, Budget:  44000 },
          battery_replacement:{ OEM:  58000, Compatible: 38000, Budget:  26000 },
          charging_issue:     { OEM:  30000, Compatible: 19000, Budget:  13000 },
          speaker_mic_issue:  { OEM:  34000, Compatible: 22000, Budget:  15000 },
          software_issue:     { OEM:  35000, Compatible: 35000, Budget:  35000 },
        },
        warrantyByTier: { OEM: 60, Compatible: 30, Budget: 7 },
      },
    },
  },

  Oppo: {
    label: 'OPPO',
    series: {
      'Oppo Reno Series': {
        models: ['Oppo Reno 12 Pro', 'Oppo Reno 12', 'Oppo Reno 11', 'Oppo Reno 10', 'Older Reno'],
        pricing: {
          screen_replacement: { OEM: 175000, Compatible: 115000, Budget:  75000 },
          battery_replacement:{ OEM:  80000, Compatible:  52000, Budget:  35000 },
          charging_issue:     { OEM:  40000, Compatible:  25000, Budget:  17000 },
          speaker_mic_issue:  { OEM:  45000, Compatible:  29000, Budget:  19000 },
          software_issue:     { OEM:  38000, Compatible:  38000, Budget:  38000 },
        },
        warrantyByTier: { OEM: 60, Compatible: 30, Budget: 7 },
      },
      'Oppo A / F Series': {
        models: ['Oppo A78', 'Oppo A38', 'Oppo A17', 'Oppo F27', 'Other A/F'],
        pricing: {
          screen_replacement: { OEM: 105000, Compatible: 69000, Budget:  46000 },
          battery_replacement:{ OEM:  60000, Compatible: 40000, Budget:  27000 },
          charging_issue:     { OEM:  31000, Compatible: 20000, Budget:  13000 },
          speaker_mic_issue:  { OEM:  36000, Compatible: 23000, Budget:  15000 },
          software_issue:     { OEM:  35000, Compatible: 35000, Budget:  35000 },
        },
        warrantyByTier: { OEM: 60, Compatible: 30, Budget: 7 },
      },
    },
  },

  Realme: {
    label: 'Realme',
    series: {
      'Realme GT / Number Series': {
        models: ['Realme GT 6', 'Realme GT 5', 'Realme 13 Pro+', 'Realme 13 Pro', 'Realme 12 Pro+', 'Other GT/Number'],
        pricing: {
          screen_replacement: { OEM: 140000, Compatible:  92000, Budget:  60000 },
          battery_replacement:{ OEM:  72000, Compatible:  47000, Budget:  32000 },
          charging_issue:     { OEM:  36000, Compatible:  23000, Budget:  15000 },
          speaker_mic_issue:  { OEM:  40000, Compatible:  26000, Budget:  17000 },
          software_issue:     { OEM:  36000, Compatible:  36000, Budget:  36000 },
        },
        warrantyByTier: { OEM: 60, Compatible: 30, Budget: 7 },
      },
      'Realme C / Narzo Series': {
        models: ['Realme C65', 'Realme C55', 'Realme Narzo 70', 'Realme Narzo 60', 'Other C/Narzo'],
        pricing: {
          screen_replacement: { OEM:  85000, Compatible: 56000, Budget:  37000 },
          battery_replacement:{ OEM:  52000, Compatible: 34000, Budget:  23000 },
          charging_issue:     { OEM:  27000, Compatible: 17000, Budget:  12000 },
          speaker_mic_issue:  { OEM:  31000, Compatible: 20000, Budget:  13000 },
          software_issue:     { OEM:  33000, Compatible: 33000, Budget:  33000 },
        },
        warrantyByTier: { OEM: 60, Compatible: 30, Budget: 7 },
      },
    },
  },

  Others: {
    label: 'Motorola / Nokia / Others',
    series: {
      'Motorola': {
        models: ['Moto G85', 'Moto G54', 'Moto G34', 'Moto G24', 'Edge Series', 'Other Moto'],
        pricing: {
          screen_replacement: { OEM: 110000, Compatible:  72000, Budget:  48000 },
          battery_replacement:{ OEM:  62000, Compatible:  41000, Budget:  28000 },
          charging_issue:     { OEM:  32000, Compatible:  20000, Budget:  14000 },
          speaker_mic_issue:  { OEM:  36000, Compatible:  23000, Budget:  15000 },
          software_issue:     { OEM:  36000, Compatible:  36000, Budget:  36000 },
        },
        warrantyByTier: { OEM: 60, Compatible: 30, Budget: 7 },
      },
      'Nokia / Other Brands': {
        models: ['Nokia G42', 'Nokia C32', 'Other Nokia', 'Other Brand'],
        pricing: {
          screen_replacement: { OEM:  90000, Compatible: 60000, Budget:  40000 },
          battery_replacement:{ OEM:  55000, Compatible: 36000, Budget:  24000 },
          charging_issue:     { OEM:  28000, Compatible: 18000, Budget:  12000 },
          speaker_mic_issue:  { OEM:  32000, Compatible: 21000, Budget:  14000 },
          software_issue:     { OEM:  33000, Compatible: 33000, Budget:  33000 },
        },
        warrantyByTier: { OEM: 60, Compatible: 30, Budget: 7 },
      },
    },
  },
};

/* Quality tier definitions */
const QUALITY_TIERS = {
  OEM: {
    label: 'Original (OEM)',
    description: 'Genuine manufacturer parts. Longest warranty. Best quality.',
    badge: '🟢 Genuine',
    warrantyMultiplier: 1.0,
    recommended: false,
  },
  Compatible: {
    label: 'Compatible (High Quality)',
    description: 'Premium aftermarket parts. Same performance as OEM. 30-day warranty.',
    badge: '🔵 Best Value',
    warrantyMultiplier: 1.0,
    recommended: true,
  },
  Budget: {
    label: 'Budget',
    description: 'Basic parts. Works, but lower longevity. Short warranty.',
    badge: '⚪ Budget',
    warrantyMultiplier: 1.0,
    recommended: false,
  },
};

/**
 * Look up repair price for brand+series+service+tier combination.
 * Falls back gracefully to brand-level average if series not found.
 */
function lookupPrice({ brand, seriesName, service, tier = 'Compatible' }) {
  const brandData = PHONE_CATALOG[brand];
  if (!brandData) return null;

  /* Try exact series */
  const seriesData = brandData.series[seriesName];
  if (seriesData?.pricing?.[service]?.[tier] != null) {
    return {
      paise:       seriesData.pricing[service][tier],
      warrantyDays: seriesData.warrantyByTier?.[tier] || 30,
      tier,
      series: seriesName,
      brand,
    };
  }

  /* Fall back to any series for this brand */
  const allSeries = Object.values(brandData.series);
  const prices = allSeries
    .filter(s => s.pricing?.[service]?.[tier] != null)
    .map(s => s.pricing[service][tier]);

  if (prices.length === 0) return null;

  return {
    paise:       Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    warrantyDays: allSeries[0]?.warrantyByTier?.[tier] || 30,
    tier,
    series: 'average',
    brand,
  };
}

/**
 * Get all available brands for frontend dropdown.
 */
function getBrands() {
  return PHONE_BRANDS.map(b => ({ id: b, label: PHONE_CATALOG[b]?.label || b }));
}

/**
 * Get series list for a brand.
 */
function getSeriesForBrand(brand) {
  const brandData = PHONE_CATALOG[brand];
  if (!brandData) return [];
  return Object.entries(brandData.series).map(([name, data]) => ({
    name,
    models: data.models,
  }));
}

/**
 * Get all pricing tiers for a brand+series+service.
 */
function getTieredPricing({ brand, seriesName, service }) {
  const tiers = Object.keys(QUALITY_TIERS).map(tier => {
    const result = lookupPrice({ brand, seriesName, service, tier });
    return {
      tier,
      ...QUALITY_TIERS[tier],
      paise:       result?.paise || null,
      rupees:      result?.paise ? Math.round(result.paise / 100) : null,
      warrantyDays: result?.warrantyDays || 7,
    };
  });
  return tiers.filter(t => t.paise !== null);
}

/**
 * Compute total repair quote including inspection, labor, and parts.
 */
function computeRepairQuote({ brand, seriesName, service, tier, inspectionFeePaise = 15000, urgentSurchargePaise = 0 }) {
  const partsCost = lookupPrice({ brand, seriesName, service, tier });
  if (!partsCost) return null;

  const laborPaise = Math.round(partsCost.paise * 0.30); // 30% labor markup on parts cost
  const total = inspectionFeePaise + partsCost.paise + laborPaise + urgentSurchargePaise;

  return {
    inspectionFeePaise,
    partsPaise:         partsCost.paise,
    laborPaise,
    urgentSurchargePaise,
    totalPaise:         total,
    warrantyDays:       partsCost.warrantyDays,
    tier,
    brand,
    series: seriesName,
  };
}

module.exports = {
  PHONE_CATALOG,
  PHONE_BRANDS,
  QUALITY_TIERS,
  getBrands,
  getSeriesForBrand,
  getTieredPricing,
  lookupPrice,
  computeRepairQuote,
};
