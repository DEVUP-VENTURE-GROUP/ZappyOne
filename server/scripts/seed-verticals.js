/**
 * Seed script: populate ServiceCatalog + VerticalConfig for the 3 deep verticals.
 * Run: node scripts/seed-verticals.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const ServiceCatalog = require('../src/modules/service/service-catalog.model');
const VerticalConfig = require('../src/modules/service/vertical-config.model');

const SERVICES = [
  // MOBILE PHONE SERVICES
  {
    code: 'screen_replacement',
    name: 'Screen Replacement',
    icon: '📱',
    category: 'mobile',
    description: 'Cracked or broken display? We replace screens for all major brands with genuine parts.',
    estimatedDurationMinutes: 60,
    priceRangeMinPaise: 150000,
    priceRangeMaxPaise: 500000,
    requiredSkills: ['screen_replacement'],
    checklist: [
      { item: 'Verify device model and screen type before ordering part', required: true },
      { item: 'Back up customer data or advise them to do so', required: true },
      { item: 'Test touch, brightness, and color after replacement', required: true },
      { item: 'Apply tempered glass protector', required: false },
    ],
    guidelines: [
      'Always use ESD-safe tools',
      'Document pre-existing damage with photos before starting',
      'Provide 30-day warranty on replaced screen',
    ],
    requiredTools: ['iOpener/heat gun', 'suction cup', 'spudger set', 'pentalobe screwdriver', 'ESD mat'],
    sortOrder: 10,
  },
  {
    code: 'battery_replacement',
    name: 'Battery Replacement',
    icon: '🔋',
    category: 'mobile',
    description: 'Fast draining or swollen battery? We replace with high-quality compatible batteries.',
    estimatedDurationMinutes: 45,
    priceRangeMinPaise: 80000,
    priceRangeMaxPaise: 250000,
    requiredSkills: ['battery_replacement'],
    checklist: [
      { item: 'Check battery health before replacement (recommend only if <80%)', required: true },
      { item: 'Cycle charge test after replacement — 0% to 100%', required: true },
      { item: 'Verify no swelling or heat anomaly post-install', required: true },
    ],
    guidelines: [
      'Use BIS-certified or OEM-equivalent batteries only',
      'Never puncture or force battery out — use battery adhesive remover',
      '30-day warranty on battery',
    ],
    requiredTools: ['iOpener', 'battery adhesive strips', 'screwdrivers', 'multimeter'],
    sortOrder: 11,
  },
  {
    code: 'charging_issue',
    name: 'Charging Issue',
    icon: '⚡',
    category: 'mobile',
    description: 'Phone not charging or charging slowly? We diagnose and fix charging port issues.',
    estimatedDurationMinutes: 30,
    priceRangeMinPaise: 30000,
    priceRangeMaxPaise: 120000,
    requiredSkills: ['charging_issue'],
    checklist: [
      { item: 'Test with multiple cables before diagnosing port', required: true },
      { item: 'Clean port with compressed air / soft brush first', required: true },
      { item: 'Test charging after fix with customer\'s cable', required: true },
    ],
    guidelines: [
      'Most charging issues are port debris — clean before replacing',
      'If IC is faulty, quote for motherboard-level repair',
    ],
    requiredTools: ['multimeter', 'port cleaning kit', 'soldering iron (if IC repair)'],
    sortOrder: 12,
  },
  {
    code: 'speaker_mic_issue',
    name: 'Speaker / Mic Issue',
    icon: '🔊',
    category: 'mobile',
    description: 'No sound or muffled audio? We repair or replace earpiece, loudspeaker, and microphone.',
    estimatedDurationMinutes: 45,
    priceRangeMinPaise: 50000,
    priceRangeMaxPaise: 180000,
    requiredSkills: ['speaker_mic_issue'],
    checklist: [
      { item: 'Test call audio, loudspeaker, and recording separately', required: true },
      { item: 'Clean speaker grille and mic hole before component replacement', required: true },
      { item: 'Verify audio after fix with customer', required: true },
    ],
    guidelines: ['Confirm software is not the cause — test in safe mode first'],
    requiredTools: ['screwdrivers', 'spudger', 'speaker replacement parts'],
    sortOrder: 13,
  },
  {
    code: 'software_issue',
    name: 'Software Issue',
    icon: '💾',
    category: 'mobile',
    description: 'Slow phone, apps crashing, virus, or factory reset needed? Remote and on-site support.',
    estimatedDurationMinutes: 60,
    priceRangeMinPaise: 30000,
    priceRangeMaxPaise: 100000,
    requiredSkills: ['software_issue'],
    checklist: [
      { item: 'Back up all customer data before any reset', required: true },
      { item: 'Document apps and accounts to restore', required: true },
      { item: 'Install latest OS update after fix', required: false },
    ],
    guidelines: [
      'Never perform factory reset without explicit customer consent',
      'Malware removal: run 3 different antivirus scans',
    ],
    requiredTools: ['laptop with ADB tools', 'USB cable'],
    sortOrder: 14,
  },
  {
    code: 'water_damage_check',
    name: 'Water Damage Check',
    icon: '💧',
    category: 'mobile',
    description: 'Phone fell in water? Immediate inspection and corrosion cleaning to maximize recovery.',
    estimatedDurationMinutes: 90,
    priceRangeMinPaise: 20000,
    priceRangeMaxPaise: 80000,
    requiredSkills: ['water_damage_check'],
    checklist: [
      { item: 'Do NOT power on before inspection', required: true },
      { item: 'Open and inspect for corrosion on motherboard', required: true },
      { item: 'Ultrasonic clean if available', required: false },
      { item: 'Dry in rice or silica gel for 24hrs minimum', required: true },
      { item: 'Document findings and explain recovery probability to customer', required: true },
    ],
    guidelines: [
      'Inspection fee applies even if phone is not recoverable',
      'Full repair quote provided after initial assessment',
    ],
    requiredTools: ['isopropyl alcohol 99%', 'soft brush', 'ESD tools', 'multimeter'],
    sortOrder: 15,
  },

  // CONSTRUCTION SERVICES
  {
    code: 'mason',
    name: 'Mason / Civil Work',
    icon: '🧱',
    category: 'construction',
    description: 'Brick work, plastering, tile laying, waterproofing, and general civil construction.',
    estimatedDurationMinutes: 240,
    priceRangeMinPaise: 100000,
    priceRangeMaxPaise: 500000,
    requiredSkills: ['mason'],
    checklist: [
      { item: 'Inspect site and scope of work before starting', required: true },
      { item: 'Check material availability with customer', required: true },
      { item: 'Upload site photos before and after', required: true },
      { item: 'Confirm project/hourly billing model with customer', required: true },
    ],
    guidelines: [
      'Always wear PPE on site',
      'Material cost is charged at cost + markup; produce receipts',
      'For large projects, provide written estimate before starting',
    ],
    requiredTools: ['trowel', 'level', 'measuring tape', 'safety gear'],
    sortOrder: 20,
  },

  // CAR + BIKE SERVICES
  {
    code: 'battery_jump_start',
    name: 'Battery Jump Start',
    icon: '🔌',
    category: 'vehicle',
    description: 'Dead battery? We come to your location and jump-start your car or bike in minutes.',
    estimatedDurationMinutes: 20,
    priceRangeMinPaise: 30000,
    priceRangeMaxPaise: 80000,
    requiredSkills: ['battery_jump_start'],
    checklist: [
      { item: 'Confirm vehicle type (car/bike/scooter) before dispatch', required: true },
      { item: 'Test alternator output after jump-start', required: true },
      { item: 'Advise customer on battery health', required: true },
    ],
    guidelines: [
      'Always check polarity before connecting jumper cables',
      'For bikes: use appropriate portable jump-starter, not car cables',
    ],
    requiredTools: ['portable jump starter', 'jumper cables', 'multimeter'],
    sortOrder: 30,
  },
  {
    code: 'fuel_delivery',
    name: 'Fuel Delivery',
    icon: '⛽',
    category: 'vehicle',
    description: 'Ran out of fuel? We deliver petrol or diesel to your exact location on road.',
    estimatedDurationMinutes: 30,
    priceRangeMinPaise: 25000,
    priceRangeMaxPaise: 60000,
    requiredSkills: ['fuel_delivery'],
    checklist: [
      { item: 'Confirm fuel type (petrol/diesel) and vehicle registration', required: true },
      { item: 'Deliver minimum 2 litres — enough to reach nearest pump', required: true },
      { item: 'Payment includes service fee + fuel cost at current pump price', required: true },
    ],
    guidelines: [
      'Always carry fire safety equipment',
      'Never deliver fuel near open flame',
      'Customer pays for fuel separately at pump price + service fee',
    ],
    requiredTools: ['approved fuel container', 'funnel', 'fire extinguisher'],
    sortOrder: 31,
  },
  {
    code: 'bike_wash',
    name: 'Bike Wash',
    icon: '🏍️',
    category: 'vehicle',
    description: 'Doorstep bike wash — foam wash, rinse, and dry. Scooters and motorcycles.',
    estimatedDurationMinutes: 45,
    priceRangeMinPaise: 15000,
    priceRangeMaxPaise: 40000,
    requiredSkills: ['bike_wash'],
    checklist: [
      { item: 'Pre-rinse with low-pressure water', required: true },
      { item: 'Apply car shampoo or foam cannon', required: true },
      { item: 'Clean wheels and chain', required: false },
      { item: 'Microfiber dry — no air dry', required: true },
    ],
    guidelines: [
      'Bring own water container (10L) — do not rely on customer supply',
      'Avoid high pressure on engine area',
    ],
    requiredTools: ['foam gun', 'microfiber cloths', 'bucket', 'bike shampoo'],
    sortOrder: 32,
  },
  {
    code: 'car_wash',
    name: 'Car Wash',
    icon: '🚗',
    category: 'vehicle',
    description: 'Doorstep car wash — exterior foam wash, rinse, dry, and interior wipe-down.',
    estimatedDurationMinutes: 60,
    priceRangeMinPaise: 40000,
    priceRangeMaxPaise: 120000,
    requiredSkills: ['car_wash'],
    checklist: [
      { item: 'Exterior foam wash and rinse', required: true },
      { item: 'Wheel and tyre cleaning', required: true },
      { item: 'Interior dust and wipe-down', required: true },
      { item: 'Window cleaning inside and outside', required: false },
    ],
    guidelines: [
      'Bring 20L water; use minimum water technique',
      'Always use pH-neutral car shampoo',
    ],
    requiredTools: ['foam cannon', 'microfiber towels', 'water tank (20L)', 'interior wipes'],
    sortOrder: 33,
  },
  {
    code: 'minor_roadside_repair',
    name: 'Minor Roadside Repair',
    icon: '🔧',
    category: 'vehicle',
    description: 'Broken down on the road? Minor mechanical fixes — cables, fuses, bolts, belts.',
    estimatedDurationMinutes: 60,
    priceRangeMinPaise: 50000,
    priceRangeMaxPaise: 200000,
    requiredSkills: ['minor_roadside_repair'],
    checklist: [
      { item: 'Assess breakdown cause before starting any work', required: true },
      { item: 'Upload before/after photos', required: true },
      { item: 'Major repairs beyond scope: quote for tow + workshop', required: true },
    ],
    guidelines: [
      'Scope: minor repairs only (cables, fuses, minor belt, spark plugs)',
      'Do not attempt engine-open work on roadside',
      'If unsafe location: wait for traffic control first',
    ],
    requiredTools: ['basic tool kit', 'fuse kit', 'jumper cables', 'safety triangle'],
    sortOrder: 34,
  },
];

const VERTICAL_CONFIGS = [
  {
    vertical: 'mobile',
    isActive: true,
    version: 1,
    mobile: {
      inspectionFeePaise:   15000,
      urgentSurchargePaise: 10000,
      warrantyDays:         30,
      spareParts: [
        // Apple
        { brand: 'Apple', service: 'screen_replacement', model: 'iPhone 15 Pro',   costPaise: 350000, isActive: true },
        { brand: 'Apple', service: 'screen_replacement', model: 'iPhone 14',        costPaise: 280000, isActive: true },
        { brand: 'Apple', service: 'screen_replacement', model: 'all',              costPaise: 250000, isActive: true },
        { brand: 'Apple', service: 'battery_replacement', model: 'iPhone 15',       costPaise: 120000, isActive: true },
        { brand: 'Apple', service: 'battery_replacement', model: 'all',             costPaise: 100000, isActive: true },
        // Samsung
        { brand: 'Samsung', service: 'screen_replacement', model: 'Galaxy S24',    costPaise: 300000, isActive: true },
        { brand: 'Samsung', service: 'screen_replacement', model: 'all',            costPaise: 180000, isActive: true },
        { brand: 'Samsung', service: 'battery_replacement', model: 'all',           costPaise: 80000,  isActive: true },
        // OnePlus
        { brand: 'OnePlus', service: 'screen_replacement', model: 'all',            costPaise: 200000, isActive: true },
        { brand: 'OnePlus', service: 'battery_replacement', model: 'all',           costPaise: 70000,  isActive: true },
        // Xiaomi
        { brand: 'Xiaomi', service: 'screen_replacement', model: 'all',             costPaise: 150000, isActive: true },
        { brand: 'Xiaomi', service: 'battery_replacement', model: 'all',            costPaise: 60000,  isActive: true },
        // Vivo
        { brand: 'Vivo', service: 'screen_replacement', model: 'all',               costPaise: 140000, isActive: true },
        { brand: 'Vivo', service: 'battery_replacement', model: 'all',              costPaise: 65000,  isActive: true },
        // Oppo
        { brand: 'Oppo', service: 'screen_replacement', model: 'all',               costPaise: 145000, isActive: true },
        { brand: 'Oppo', service: 'battery_replacement', model: 'all',              costPaise: 65000,  isActive: true },
        // Others
        { brand: 'Others', service: 'screen_replacement', model: 'all',             costPaise: 120000, isActive: true },
        { brand: 'Others', service: 'battery_replacement', model: 'all',            costPaise: 55000,  isActive: true },
      ],
    },
  },
  {
    vertical: 'construction',
    isActive: true,
    version: 1,
    construction: {
      visitFeePaise:      10000,
      perHourFeePaise:    40000,
      materialMarkupPct:  15,
      urgentSurchargePct: 20,
    },
  },
  {
    vertical: 'vehicle',
    isActive: true,
    version: 1,
    vehicle: {
      baseVisitFeePaise:       5000,
      perKmFeePaise:           1500,
      emergencySurchargePaise: 10000,
      nightSurchargePaise:     8000,
      nightStartHour:          22,
      nightEndHour:            6,
    },
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Upsert service catalog entries
  for (const svc of SERVICES) {
    await ServiceCatalog.findOneAndUpdate(
      { code: svc.code },
      { $set: svc },
      { upsert: true, new: true }
    );
    console.log(`ServiceCatalog: ${svc.code}`);
  }

  // Upsert vertical configs
  for (const cfg of VERTICAL_CONFIGS) {
    // Deactivate existing
    await VerticalConfig.updateMany({ vertical: cfg.vertical }, { $set: { isActive: false } });
    await VerticalConfig.findOneAndUpdate(
      { vertical: cfg.vertical, version: cfg.version },
      { $set: cfg },
      { upsert: true, new: true }
    );
    console.log(`VerticalConfig: ${cfg.vertical}`);
  }

  console.log('\nSeed complete.');
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
