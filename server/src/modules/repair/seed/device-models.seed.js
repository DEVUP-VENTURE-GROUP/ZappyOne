/**
 * Device models customers in India actually own.
 *
 * The catalog shipped with brands but no models, which dead-ended the booking
 * flow at "which model?" — the brand list loaded and nothing followed.
 *
 * §90 says not to INVENT model data, and this respects that. Every row here was
 * supplied by the founder from what actually walks into a repair shop; nothing
 * is fabricated. There are no invented part numbers, no made-up configurations
 * and no guessed specs, because those are what decide which part gets ordered.
 *
 * `launchYear` is deliberately NOT set on these rows. A year is a fact, and a
 * guessed one would sort the list wrongly and mislead a technician pricing an
 * older board. Ordering comes from `sortOrder` instead — the position in the
 * list below, which is the order the founder curated them in.
 *
 * Storage variants are listed only where they are standard and well known,
 * because the booking flow shows them as a variant picker and an invented
 * variant sends a technician after a part that does not exist.
 *
 * One list feeds all three panels — customer, provider and admin all read
 * DeviceModel, so seeding here is what puts a model in front of everyone.
 */

/* Phones */

/**
 * Compact per-brand lists.
 *
 * Written the way the founder wrote them (`A16 5G`, `Note 13 5G`) and expanded
 * to the full retail name a customer would recognise on the box. Keeping the
 * short form here is what makes the list reviewable — 153 fully-qualified names
 * is a wall nobody proof-reads, 153 short ones can be checked against the
 * source in a minute.
 */
const MOBILE_BRANDS = [
  {
    brand: 'samsung',
    /** A07 → Galaxy A07, and the letter is the series. */
    name: (m) => `Galaxy ${m}`,
    series: (m) => `Galaxy ${m[0]}`,
    models: [
      'A07', 'A16 5G', 'A15 5G', 'A14 5G', 'A36 5G', 'A56 5G',
      'M14 5G', 'M35 5G',
      'S23', 'S24', 'S24 Ultra', 'S25', 'S25 Ultra',
    ],
  },
  {
    brand: 'apple',
    name: (m) => `iPhone ${m}`,
    series: (m) => `iPhone ${m.split(' ')[0]}`,
    /**
     * Apple is the one line where the storage tiers are fixed, published and
     * universally known, and the booking flow shows them as a variant picker.
     * Listed only where that is true — iPhone 17 is absent rather than guessed,
     * and no other brand carries variants here at all.
     */
    storage: {
      '11': ['64GB', '128GB', '256GB'],
      '12': ['64GB', '128GB', '256GB'],
      '13': ['128GB', '256GB', '512GB'],
      '14': ['128GB', '256GB', '512GB'],
      '15': ['128GB', '256GB', '512GB'],
      '15 Pro': ['128GB', '256GB', '512GB', '1TB'],
      '15 Pro Max': ['256GB', '512GB', '1TB'],
      '16': ['128GB', '256GB', '512GB'],
      '16 Pro': ['128GB', '256GB', '512GB', '1TB'],
      '16 Pro Max': ['256GB', '512GB', '1TB'],
    },
    models: [
      '11', '12', '13', '14',
      '15', '15 Pro', '15 Pro Max',
      '16', '16 Pro', '16 Pro Max',
      '17',
    ],
  },
  {
    brand: 'vivo',
    name: (m) => `vivo ${m}`,
    series: (m) => `vivo ${m[0]}`,
    models: [
      'Y18', 'Y19 5G', 'Y21', 'Y28', 'Y29 5G',
      'T3x 5G', 'T4x 5G',
      'V30', 'V40', 'V50',
    ],
  },
  {
    brand: 'oppo',
    name: (m) => `OPPO ${m}`,
    series: (m) => (m.startsWith('Reno') ? 'Reno' : `OPPO ${m[0]}`),
    models: [
      'A17', 'A18', 'A38', 'A58', 'A59 5G', 'A5 5G',
      'K12x', 'K13 5G',
      'F27', 'F29 5G',
      'Reno12', 'Reno13', 'Reno14',
    ],
  },
  {
    brand: 'xiaomi',
    /** Redmi is Xiaomi's line in India — "Note 13" on a shelf means Redmi Note 13. */
    name: (m) => (m.startsWith('Redmi') ? m : `Redmi ${m}`),
    series: (m) => (m.startsWith('Note') ? 'Redmi Note' : 'Redmi'),
    models: [
      'Redmi 12', 'Redmi 12 5G', 'Redmi 13 5G', 'Redmi 14C', 'Redmi A4 5G', 'Redmi A5',
      'Note 11', 'Note 12', 'Note 12 5G', 'Note 13', 'Note 13 5G', 'Note 14 5G',
    ],
  },
  {
    brand: 'realme',
    name: (m) => `realme ${m}`,
    series: (m) => {
      if (m.startsWith('Narzo')) return 'Narzo';
      if (m.startsWith('C')) return 'realme C';
      if (m.startsWith('P')) return 'realme P';
      return 'realme Number';
    },
    models: [
      'C31', 'C33', 'C53', 'C55', 'C61', 'C63', 'C65', 'C75',
      '11x', '12x', '13', '14x',
      'P3', 'P3x',
      'Narzo 70', 'Narzo 80',
    ],
  },
  {
    brand: 'oneplus',
    name: (m) => `OnePlus ${m}`,
    series: (m) => (m.startsWith('Nord') ? 'Nord' : 'OnePlus Flagship'),
    models: [
      '8T', '9', '9R', '10R', '11R', '11', '12R', '12', '13R', '13',
      'Nord 2', 'Nord 2T', 'Nord 3', 'Nord 4',
      'Nord CE3', 'Nord CE4', 'Nord CE5',
    ],
  },
  {
    brand: 'motorola',
    /** Moto for the G line, Motorola for Edge — that is what is printed on them. */
    name: (m) => (m.startsWith('Edge') ? `Motorola ${m}` : `Moto ${m}`),
    series: (m) => (m.startsWith('Edge') ? 'Motorola Edge' : 'Moto G'),
    models: [
      'G04', 'G05', 'G14', 'G24', 'G34 5G', 'G45 5G', 'G54 5G', 'G64 5G', 'G84',
      'Edge 40 Neo', 'Edge 50 Fusion', 'Edge 50 Neo', 'Edge 60 Fusion',
    ],
  },
  {
    brand: 'poco',
    name: (m) => `POCO ${m}`,
    series: (m) => `POCO ${m[0]}`,
    models: [
      'C55', 'C61', 'C65', 'C75',
      'M5', 'M6', 'M7',
      'X5', 'X5 Pro', 'X6', 'X6 Pro', 'X7', 'X7 Pro',
      'F5', 'F6', 'F7',
    ],
  },
  {
    brand: 'iqoo',
    name: (m) => `iQOO ${m}`,
    series: (m) => (m.startsWith('Neo') ? 'iQOO Neo' : 'iQOO Z'),
    models: [
      'Z6', 'Z6 Lite', 'Z7', 'Z7 Pro', 'Z9', 'Z9x', 'Z10', 'Z10x',
      'Neo 7 Pro', 'Neo 9 Pro', 'Neo 10',
    ],
  },
  {
    brand: 'nothing',
    /** Nothing brackets its numbers — Phone (2a), not Phone 2a. */
    name: (m) => `Nothing Phone ${m.replace(/^Phone (\S+)/, '($1)')}`,
    series: () => 'Nothing Phone',
    models: [
      'Phone 1', 'Phone 2', 'Phone 2a', 'Phone 2a Plus',
      'Phone 3', 'Phone 3a', 'Phone 3a Pro', 'Phone 4a',
    ],
  },
  {
    brand: 'google',
    name: (m) => `Pixel ${m}`,
    series: (m) => `Pixel ${parseInt(m, 10)}`,
    models: [
      '6a', '7a', '7', '7 Pro', '8a', '8', '8 Pro',
      '9a', '9', '9 Pro', '9 Pro XL', '10', '10 Pro',
    ],
  },
];

const MOBILE_MODELS = MOBILE_BRANDS.flatMap((b) => b.models.map((m, i) => ({
  brand: b.brand,
  name: b.name(m),
  series: b.series(m),
  ...(b.storage?.[m] ? { storage: b.storage[m] } : {}),
  // Position in the founder's list — the display order they curated.
  sortOrder: i + 1,
})));

/* Laptops */

/**
 * Families first — a laptop is found by its line before its exact model, which
 * is how the deep catalog is meant to be walked (Brand → Type → Family → Model).
 *
 * A family exists here for every line the model list below uses. A model whose
 * family is missing still seeds, but it is unreachable in the deep flow, so the
 * two lists have to stay in step.
 */
const LAPTOP_FAMILIES = [
  /* HP */
  { brand: 'hp', code: 'hp-15', name: 'HP 14 / 15 Series', type: 'laptop', popular: true },
  { brand: 'hp', code: 'pavilion', name: 'Pavilion', type: 'laptop', popular: true },
  { brand: 'hp', code: 'envy', name: 'Envy', type: 'ultrabook' },
  { brand: 'hp', code: 'victus', name: 'Victus', type: 'gaming_laptop' },
  { brand: 'hp', code: 'omen', name: 'OMEN', type: 'gaming_laptop' },
  { brand: 'hp', code: 'probook', name: 'ProBook', type: 'business_laptop' },
  { brand: 'hp', code: 'elitebook', name: 'EliteBook', type: 'business_laptop' },
  { brand: 'hp', code: 'omnibook', name: 'OmniBook', type: 'laptop' },
  { brand: 'hp', code: 'spectre', name: 'Spectre', type: 'convertible' },

  /* Lenovo */
  { brand: 'lenovo', code: 'ideapad', name: 'IdeaPad', type: 'laptop', popular: true },
  { brand: 'lenovo', code: 'lenovo-v', name: 'V Series', type: 'business_laptop' },
  { brand: 'lenovo', code: 'thinkbook', name: 'ThinkBook', type: 'business_laptop' },
  { brand: 'lenovo', code: 'thinkpad', name: 'ThinkPad', type: 'business_laptop', popular: true },
  { brand: 'lenovo', code: 'yoga', name: 'Yoga', type: 'convertible' },
  { brand: 'lenovo', code: 'loq', name: 'LOQ', type: 'gaming_laptop' },
  { brand: 'lenovo', code: 'legion', name: 'Legion', type: 'gaming_laptop' },

  /* Dell */
  { brand: 'dell', code: 'inspiron', name: 'Inspiron', type: 'laptop', popular: true },
  { brand: 'dell', code: 'vostro', name: 'Vostro', type: 'business_laptop' },
  { brand: 'dell', code: 'latitude', name: 'Latitude', type: 'business_laptop' },
  { brand: 'dell', code: 'xps', name: 'XPS', type: 'ultrabook' },
  { brand: 'dell', code: 'g-series', name: 'G Series', type: 'gaming_laptop' },
  { brand: 'dell', code: 'alienware', name: 'Alienware', type: 'gaming_laptop' },

  /* ASUS */
  { brand: 'asus', code: 'vivobook', name: 'VivoBook', type: 'laptop', popular: true },
  { brand: 'asus', code: 'zenbook', name: 'Zenbook', type: 'ultrabook' },
  { brand: 'asus', code: 'expertbook', name: 'ExpertBook', type: 'business_laptop' },
  { brand: 'asus', code: 'tuf', name: 'TUF Gaming', type: 'gaming_laptop' },
  { brand: 'asus', code: 'rog', name: 'ROG', type: 'gaming_laptop' },

  /* Acer */
  { brand: 'acer', code: 'aspire', name: 'Aspire', type: 'laptop', popular: true },
  { brand: 'acer', code: 'swift', name: 'Swift', type: 'ultrabook' },
  { brand: 'acer', code: 'extensa', name: 'Extensa', type: 'laptop' },
  { brand: 'acer', code: 'travelmate', name: 'TravelMate', type: 'business_laptop' },
  { brand: 'acer', code: 'nitro', name: 'Nitro', type: 'gaming_laptop' },
  { brand: 'acer', code: 'predator', name: 'Predator', type: 'gaming_laptop' },

  /* Apple */
  { brand: 'apple-laptop', code: 'macbook-air', name: 'MacBook Air', type: 'macbook', popular: true },
  { brand: 'apple-laptop', code: 'macbook-pro', name: 'MacBook Pro', type: 'macbook', popular: true },
  { brand: 'apple-laptop', code: 'macbook', name: 'MacBook', type: 'macbook' },

  /* MSI */
  { brand: 'msi', code: 'msi-modern', name: 'Modern', type: 'laptop' },
  { brand: 'msi', code: 'msi-prestige', name: 'Prestige', type: 'ultrabook' },
  { brand: 'msi', code: 'msi-creator', name: 'Creator', type: 'laptop' },
  { brand: 'msi', code: 'msi-thin', name: 'Thin', type: 'gaming_laptop' },
  { brand: 'msi', code: 'msi-cyborg', name: 'Cyborg', type: 'gaming_laptop' },
  { brand: 'msi', code: 'msi-katana', name: 'Katana', type: 'gaming_laptop' },
  { brand: 'msi', code: 'msi-sword', name: 'Sword', type: 'gaming_laptop' },
  { brand: 'msi', code: 'msi-pulse', name: 'Pulse', type: 'gaming_laptop' },
  { brand: 'msi', code: 'msi-crosshair', name: 'Crosshair', type: 'gaming_laptop' },
  { brand: 'msi', code: 'msi-raider', name: 'Raider', type: 'gaming_laptop' },
  { brand: 'msi', code: 'msi-stealth', name: 'Stealth', type: 'gaming_laptop' },
  { brand: 'msi', code: 'msi-titan', name: 'Titan', type: 'gaming_laptop' },
  { brand: 'msi', code: 'msi-gf', name: 'GF Series', type: 'gaming_laptop' },

  /* Microsoft */
  { brand: 'microsoft', code: 'surface-laptop', name: 'Surface Laptop', type: 'surface', popular: true },
  { brand: 'microsoft', code: 'surface-pro', name: 'Surface Pro', type: 'surface' },

  /* Samsung */
  { brand: 'samsung-laptop', code: 'galaxy-book', name: 'Galaxy Book', type: 'laptop', popular: true },

  /* LG */
  { brand: 'lg', code: 'lg-gram', name: 'Gram', type: 'ultrabook' },
  { brand: 'lg', code: 'lg-ultra', name: 'Ultra', type: 'laptop' },

  /* Huawei */
  { brand: 'huawei', code: 'matebook-d', name: 'MateBook D', type: 'laptop' },
  { brand: 'huawei', code: 'matebook', name: 'MateBook', type: 'laptop' },
  { brand: 'huawei', code: 'matebook-x', name: 'MateBook X', type: 'ultrabook' },
  { brand: 'huawei', code: 'matebook-e', name: 'MateBook E', type: 'convertible' },

  /* Infinix */
  { brand: 'infinix-laptop', code: 'inbook', name: 'INBook', type: 'laptop', popular: true },
  { brand: 'infinix-laptop', code: 'zerobook', name: 'Zero Book', type: 'ultrabook' },

  /* Xiaomi */
  { brand: 'xiaomi-laptop', code: 'redmibook', name: 'RedmiBook', type: 'laptop', popular: true },
  { brand: 'xiaomi-laptop', code: 'mi-notebook', name: 'Mi Notebook', type: 'laptop' },

  /* realme */
  { brand: 'realme-laptop', code: 'realme-book', name: 'realme Book', type: 'ultrabook' },

  /* Gigabyte */
  { brand: 'gigabyte', code: 'gigabyte-g', name: 'G Series', type: 'gaming_laptop' },
  { brand: 'gigabyte', code: 'aorus', name: 'AORUS', type: 'gaming_laptop' },
  { brand: 'gigabyte', code: 'aero', name: 'AERO', type: 'laptop' },
];

/**
 * Laptops, grouped by the family they belong to.
 *
 * Names are stored exactly as the founder listed them — brand included — because
 * that is what a customer reads off the lid and what a technician quotes against.
 */
const LAPTOP_BY_FAMILY = [
  /* HP */
  ['hp', 'hp-15', ['HP 14s', 'HP 15s', 'HP 14', 'HP 15']],
  ['hp', 'pavilion', ['HP Pavilion 14', 'HP Pavilion 15', 'HP Pavilion Plus 14', 'HP Pavilion Plus 16']],
  ['hp', 'envy', ['HP Envy 13', 'HP Envy x360 13', 'HP Envy x360 15', 'HP Envy 16']],
  ['hp', 'victus', ['HP Victus 15', 'HP Victus 16']],
  ['hp', 'omen', ['HP OMEN 15', 'HP OMEN 16', 'HP OMEN Max 16']],
  ['hp', 'probook', ['HP ProBook 440', 'HP ProBook 450']],
  ['hp', 'elitebook', ['HP EliteBook 840', 'HP EliteBook 850', 'HP EliteBook 1040']],
  ['hp', 'omnibook', ['HP OmniBook 3', 'HP OmniBook 5', 'HP OmniBook 7']],
  ['hp', 'spectre', ['HP Spectre x360 14', 'HP Spectre x360 16']],

  /* Lenovo */
  ['lenovo', 'ideapad', [
    'Lenovo IdeaPad Slim 1', 'Lenovo IdeaPad Slim 3', 'Lenovo IdeaPad Slim 5',
    'Lenovo IdeaPad 3', 'Lenovo IdeaPad 5',
  ]],
  ['lenovo', 'lenovo-v', ['Lenovo V14', 'Lenovo V15']],
  ['lenovo', 'thinkbook', ['Lenovo ThinkBook 14', 'Lenovo ThinkBook 15']],
  ['lenovo', 'thinkpad', [
    'Lenovo ThinkPad E14', 'Lenovo ThinkPad E15', 'Lenovo ThinkPad E16',
    'Lenovo ThinkPad T14', 'Lenovo ThinkPad T15', 'Lenovo ThinkPad L14',
    'Lenovo ThinkPad X1 Carbon',
  ]],
  ['lenovo', 'yoga', ['Lenovo Yoga Slim 6', 'Lenovo Yoga Slim 7', 'Lenovo Yoga 7', 'Lenovo Yoga 9']],
  ['lenovo', 'loq', ['Lenovo LOQ 15', 'Lenovo LOQ 16']],
  ['lenovo', 'legion', ['Lenovo Legion 5', 'Lenovo Legion 5i', 'Lenovo Legion 7']],

  /* Dell */
  ['dell', 'inspiron', ['Dell Inspiron 14', 'Dell Inspiron 15', 'Dell Inspiron 16']],
  ['dell', 'vostro', ['Dell Vostro 14', 'Dell Vostro 15', 'Dell Vostro 16']],
  ['dell', 'latitude', [
    'Dell Latitude 3420', 'Dell Latitude 3430', 'Dell Latitude 3440', 'Dell Latitude 3450',
    'Dell Latitude 3520', 'Dell Latitude 3530', 'Dell Latitude 3540', 'Dell Latitude 3550',
    'Dell Latitude 5420', 'Dell Latitude 5430', 'Dell Latitude 5440', 'Dell Latitude 5450',
  ]],
  ['dell', 'xps', ['Dell XPS 13', 'Dell XPS 14', 'Dell XPS 15', 'Dell XPS 16']],
  ['dell', 'g-series', ['Dell G15', 'Dell G16']],
  ['dell', 'alienware', ['Dell Alienware m16', 'Dell Alienware 16']],

  /* ASUS */
  ['asus', 'vivobook', [
    'ASUS VivoBook 14', 'ASUS VivoBook 15', 'ASUS VivoBook 16',
    'ASUS VivoBook S14', 'ASUS VivoBook S16',
    'ASUS VivoBook Go 14', 'ASUS VivoBook Go 15',
  ]],
  ['asus', 'zenbook', [
    'ASUS Zenbook 14', 'ASUS Zenbook 14 OLED', 'ASUS Zenbook S14',
    'ASUS Zenbook S16', 'ASUS Zenbook A14',
  ]],
  ['asus', 'expertbook', ['ASUS ExpertBook B1', 'ASUS ExpertBook B5']],
  ['asus', 'tuf', [
    'ASUS TUF Gaming A15', 'ASUS TUF Gaming A16',
    'ASUS TUF Gaming F15', 'ASUS TUF Gaming F16',
  ]],
  ['asus', 'rog', [
    'ASUS ROG Strix G15', 'ASUS ROG Strix G16', 'ASUS ROG Strix G18',
    'ASUS ROG Zephyrus G14', 'ASUS ROG Zephyrus G16',
    'ASUS ROG Flow X13', 'ASUS ROG Flow Z13',
  ]],

  /* Acer */
  ['acer', 'aspire', [
    'Acer Aspire 3', 'Acer Aspire 5', 'Acer Aspire Go 14', 'Acer Aspire Go 15',
    'Acer Aspire Lite 14', 'Acer Aspire Lite 15',
  ]],
  ['acer', 'swift', ['Acer Swift Go 14', 'Acer Swift Go 16', 'Acer Swift 3', 'Acer Swift 5']],
  ['acer', 'extensa', ['Acer Extensa 15']],
  ['acer', 'travelmate', ['Acer TravelMate P2', 'Acer TravelMate P4']],
  ['acer', 'nitro', ['Acer Nitro 5', 'Acer Nitro V 15', 'Acer Nitro V 16', 'Acer Nitro 16']],
  ['acer', 'predator', [
    'Acer Predator Helios Neo 16', 'Acer Predator Helios 16', 'Acer Predator Triton 14',
  ]],

  /* Apple */
  ['apple-laptop', 'macbook-air', [
    'Apple MacBook Air M1', 'Apple MacBook Air M2', 'Apple MacBook Air M3',
    'Apple MacBook Air M4', 'Apple MacBook Air M5',
  ]],
  ['apple-laptop', 'macbook-pro', [
    'Apple MacBook Pro 13-inch M1', 'Apple MacBook Pro 13-inch M2',
    'Apple MacBook Pro 14-inch M1 Pro', 'Apple MacBook Pro 14-inch M2 Pro',
    'Apple MacBook Pro 14-inch M3', 'Apple MacBook Pro 14-inch M4',
    'Apple MacBook Pro 14-inch M5',
    'Apple MacBook Pro 16-inch M1 Pro', 'Apple MacBook Pro 16-inch M2 Pro',
    'Apple MacBook Pro 16-inch M3 Pro', 'Apple MacBook Pro 16-inch M4 Pro',
    'Apple MacBook Pro 16-inch M5 Pro',
  ]],
  // Listed without an Air/Pro line, so it sits in the plain MacBook family
  // rather than being filed under a line it may not belong to.
  ['apple-laptop', 'macbook', ['Apple MacBook Neo']],

  /* MSI */
  ['msi', 'msi-modern', ['MSI Modern 14', 'MSI Modern 15']],
  ['msi', 'msi-prestige', ['MSI Prestige 14', 'MSI Prestige 16']],
  ['msi', 'msi-creator', ['MSI Creator M16', 'MSI Creator Z16']],
  ['msi', 'msi-thin', ['MSI Thin 15', 'MSI Thin 16']],
  ['msi', 'msi-cyborg', ['MSI Cyborg 14', 'MSI Cyborg 15', 'MSI Cyborg 16']],
  ['msi', 'msi-katana', ['MSI Katana 15', 'MSI Katana 17']],
  ['msi', 'msi-sword', ['MSI Sword 16']],
  ['msi', 'msi-pulse', ['MSI Pulse 15', 'MSI Pulse 16']],
  ['msi', 'msi-crosshair', ['MSI Crosshair 16']],
  ['msi', 'msi-raider', ['MSI Raider 16', 'MSI Raider 18']],
  ['msi', 'msi-stealth', ['MSI Stealth 14', 'MSI Stealth 16']],
  ['msi', 'msi-titan', ['MSI Titan 18']],

  /* Microsoft */
  ['microsoft', 'surface-laptop', [
    'Microsoft Surface Laptop Go 2', 'Microsoft Surface Laptop Go 3', 'Microsoft Surface Laptop Go 4',
    'Microsoft Surface Laptop 4', 'Microsoft Surface Laptop 5',
    'Microsoft Surface Laptop 6', 'Microsoft Surface Laptop 7',
    'Microsoft Surface Laptop Studio', 'Microsoft Surface Laptop Studio 2',
  ]],
  ['microsoft', 'surface-pro', [
    'Microsoft Surface Pro 7', 'Microsoft Surface Pro 8', 'Microsoft Surface Pro 9',
    'Microsoft Surface Pro 10', 'Microsoft Surface Pro 11',
  ]],

  /* Samsung */
  ['samsung-laptop', 'galaxy-book', [
    'Samsung Galaxy Book2', 'Samsung Galaxy Book2 360',
    'Samsung Galaxy Book3', 'Samsung Galaxy Book3 360',
    'Samsung Galaxy Book3 Pro', 'Samsung Galaxy Book3 Pro 360',
    'Samsung Galaxy Book4', 'Samsung Galaxy Book4 360',
    'Samsung Galaxy Book4 Pro', 'Samsung Galaxy Book4 Pro 360',
    'Samsung Galaxy Book5', 'Samsung Galaxy Book5 Pro', 'Samsung Galaxy Book5 Pro 360',
    'Samsung Galaxy Book6', 'Samsung Galaxy Book6 Pro', 'Samsung Galaxy Book6 Ultra',
  ]],

  /* LG */
  ['lg', 'lg-gram', [
    'LG Gram 14', 'LG Gram 15', 'LG Gram 16', 'LG Gram 17',
    'LG Gram 2-in-1 14', 'LG Gram 2-in-1 16',
  ]],
  ['lg', 'lg-ultra', ['LG Ultra PC 14', 'LG Ultra PC 15', 'LG Ultra 15', 'LG Ultra 16']],

  /* Huawei */
  ['huawei', 'matebook-d', ['Huawei MateBook D14', 'Huawei MateBook D15', 'Huawei MateBook D16']],
  ['huawei', 'matebook', ['Huawei MateBook 14', 'Huawei MateBook 16']],
  ['huawei', 'matebook-x', ['Huawei MateBook X Pro', 'Huawei MateBook X']],
  ['huawei', 'matebook-e', ['Huawei MateBook E']],

  /* Infinix */
  ['infinix-laptop', 'inbook', [
    'Infinix INBook X1', 'Infinix INBook X1 Slim',
    'Infinix INBook X2', 'Infinix INBook X2 Plus', 'Infinix INBook X2 Slim',
    'Infinix INBook X3', 'Infinix INBook X3 Slim',
    'Infinix INBook Y1 Plus', 'Infinix INBook Y2 Plus', 'Infinix INBook Y3 Max',
  ]],
  ['infinix-laptop', 'zerobook', ['Infinix Zero Book', 'Infinix Zero Book Ultra']],

  /* Xiaomi */
  ['xiaomi-laptop', 'redmibook', [
    'Xiaomi RedmiBook 15', 'Xiaomi RedmiBook 15 Pro',
    'Xiaomi RedmiBook 14', 'Xiaomi RedmiBook 14 2023',
    'Xiaomi RedmiBook 14 2024', 'Xiaomi RedmiBook 14 2025',
    'Xiaomi RedmiBook 16', 'Xiaomi RedmiBook 16 2025',
    'Xiaomi RedmiBook Pro 14', 'Xiaomi RedmiBook Pro 16',
  ]],
  ['xiaomi-laptop', 'mi-notebook', [
    'Xiaomi Mi Notebook 14', 'Xiaomi Mi Notebook 14 Horizon',
    'Xiaomi Mi Notebook Ultra', 'Xiaomi Mi Notebook Pro',
    'Xiaomi Notebook Pro 120G',
  ]],

  /* realme */
  ['realme-laptop', 'realme-book', [
    'realme Book Slim', 'realme Book Prime',
    'realme Book Enhanced Air', 'realme Book Enhanced Edition',
  ]],

  /* Gigabyte */
  ['gigabyte', 'gigabyte-g', ['Gigabyte G5', 'Gigabyte G6', 'Gigabyte G7', 'Gigabyte Gaming A16']],
  ['gigabyte', 'aorus', [
    'Gigabyte AORUS 5', 'Gigabyte AORUS 15', 'Gigabyte AORUS 15P', 'Gigabyte AORUS 15X',
    'Gigabyte AORUS 16', 'Gigabyte AORUS 17', 'Gigabyte AORUS 17X',
  ]],
  ['gigabyte', 'aero', ['Gigabyte AERO 5', 'Gigabyte AERO 16', 'Gigabyte AERO 15 OLED']],
];

const LAPTOP_MODELS = LAPTOP_BY_FAMILY.flatMap(([brand, family, names]) => names.map((name, i) => ({
  brand,
  family,
  name,
  sortOrder: i + 1,
})));

/** URL- and index-safe code from a display name. */
function toCode(brand, name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.startsWith(brand) ? slug : `${brand}-${slug}`;
}

module.exports = {
  MOBILE_MODELS, LAPTOP_MODELS, LAPTOP_FAMILIES, toCode,
  // Exported for the seed report and for tests that assert coverage per brand.
  MOBILE_BRANDS, LAPTOP_BY_FAMILY,
};
