/**
 * Starting rows for provider onboarding.
 *
 * This is a STARTING POINT, not the source of truth: every row here is editable
 * in admin afterwards, and the seeder never overwrites an existing row. Opening
 * a new service to providers should be an operator action, and the seed exists
 * only so day one is not an empty screen.
 *
 * Lines are marked `live` only where the delivery flow behind them actually
 * exists — today that is Mobile and Laptop. Everything else is `coming_soon`:
 * visible, so providers can see where we are going and we can measure demand,
 * but not enrollable, because accepting a scooter mechanic into a queue with no
 * customer flow behind it wastes their time.
 */

const DOMAINS = [
  { code: 'electronics', name: 'Electronics', icon: 'Cpu', displayOrder: 1, description: 'Phones, laptops and personal devices' },
  { code: 'vehicles', name: 'Vehicles', icon: 'Bike', displayOrder: 2, description: 'Two, three and four wheelers' },
  { code: 'home_services', name: 'Home Services', icon: 'Home', displayOrder: 3, description: 'Repairs and upkeep inside the home' },
  { code: 'family_assist', name: 'Family Assist', icon: 'HeartHandshake', displayOrder: 4, description: 'Help for children, elders and the household' },
  { code: 'helping_services', name: 'Helping Services', icon: 'ShoppingBag', displayOrder: 5, description: 'A trusted person for a real-world errand — shopping, pickup, returns' },
  { code: 'pet_services', name: 'Pet Services', icon: 'PawPrint', displayOrder: 6, description: 'Grooming, boarding, walking and care for your dog or cat' },
];

const LINES = [
  /* Electronics — both live, with the repair engine behind them. */
  {
    code: 'mobile_repair', name: 'Mobile Phones', domainCode: 'electronics',
    repairVertical: 'mobile', status: 'live', displayOrder: 1, icon: 'Smartphone',
    description: 'Screens, batteries, charging ports, water damage and board-level work',
    customerPath: '/repair', tagline: 'Diagnosed before you are quoted', isPopular: true,
  },
  {
    code: 'laptop_repair', name: 'Laptops', domainCode: 'electronics',
    repairVertical: 'laptop', status: 'live', displayOrder: 2, icon: 'Laptop',
    description: 'Displays, hinges, keyboards, upgrades, no-power and data recovery',
    customerPath: '/repair/laptop', tagline: 'Exact model, exact part', isPopular: true,
  },

  /* Vehicles — seeded so providers can register interest. */
  // `repairVertical` is the handover to the repair engine: without it an
  // approved provider is never offered the capability/pricing setup for this
  // line, and the enrolment dead-ends at 'approved' with nothing to do.
  // `customerPath` is what puts a line on the customer's home screen —
  // liveCatalog filters it out without one. A line can otherwise be `live`,
  // fully priced and completely unreachable, which is exactly what both
  // vehicle lines were until this was noticed.
  {
    code: 'two_wheeler', name: '2-Wheeler', domainCode: 'vehicles', status: 'live',
    displayOrder: 1, icon: 'Bike', repairVertical: 'two_wheeler',
    description: 'Servicing, brakes, tyres, electricals, engine and EV work',
    customerPath: '/repair/two-wheeler', tagline: 'Priced before the spanner comes out',
  },
  { code: 'three_wheeler', name: '3-Wheeler', domainCode: 'vehicles', status: 'coming_soon', displayOrder: 2, icon: 'Truck' },
  {
    code: 'four_wheeler', name: '4-Wheeler', domainCode: 'vehicles', status: 'live',
    displayOrder: 3, icon: 'Car', repairVertical: 'four_wheeler',
    description: 'Periodic service, AC, brakes, suspension, diagnostics and EV',
    customerPath: '/repair/four-wheeler', tagline: 'A warning light is a system, not a part',
  },

  /* Home services. */
  // Water & Tank Care is the first home-services line to go live — the
  // others stay coming_soon until they get the same treatment.
  {
    code: 'water_tank_care', name: 'Water & Tank Care', domainCode: 'home_services',
    status: 'live', displayOrder: 1, icon: 'Droplets', repairVertical: 'water_tank_care',
    description: 'Tank and sump cleaning, health inspection, pipe flushing, repair and protection',
    customerPath: '/repair/water-tank-care', tagline: 'Photographed before and after', isPopular: true,
  },

  /*
   * Pet Services. Not the repair engine and not the helping-task engine —
   * its own booking/pricing/matching stack (server/src/modules/pet) — so
   * `repairVertical` stays null. It still goes through the same visibility
   * gate as everything else: `liveCatalog` requires an APPROVED
   * ProviderEnrolment for this exact line code before a customer ever sees
   * it, and the pet demo-provider seeder creates one for the same reason the
   * repair and helping seeders do.
   */
  /*
   * One real line per category (§2), the same pattern as Helping Services'
   * two lines — a single umbrella line here would show one card that just
   * repeats the domain name, which is exactly the bug this replaced.
   * `customerPath` matches PetBookingFlowPage's route exactly
   * (`/pet/book/:categoryCode`), so registering the line needed no route
   * change. Each is `live` only because a demo provider genuinely covers it
   * (see pet/seed/providers.seed.js) — the same verified-provider gate every
   * other vertical goes through.
   */
  { code: 'pet_grooming', name: 'Pet Grooming & Hygiene', domainCode: 'pet_services', status: 'live', displayOrder: 1, icon: 'Scissors', customerPath: '/pet/book/pet_grooming', description: 'Bath, haircut and hygiene care at home or at the provider', tagline: 'Before and after photos, every time', isPopular: true },
  { code: 'pet_boarding', name: 'Pet Stay & Daycare', domainCode: 'pet_services', status: 'live', displayOrder: 2, icon: 'Home', customerPath: '/pet/book/pet_boarding', description: 'Overnight boarding and daytime care while you are away' },
  { code: 'pet_walk', name: 'Pet Walk & Activity', domainCode: 'pet_services', status: 'live', displayOrder: 3, icon: 'Footprints', customerPath: '/pet/book/pet_walk', description: 'Walks and play sessions matched to your pet', isPopular: true },
  { code: 'pet_home_care', name: 'Pet Home Care', domainCode: 'pet_services', status: 'live', displayOrder: 4, icon: 'HeartHandshake', customerPath: '/pet/book/pet_home_care', description: 'Feeding, litter care and companionship visits at home' },
  { code: 'pet_transport', name: 'Pet Pickup & Assistance', domainCode: 'pet_services', status: 'live', displayOrder: 5, icon: 'Car', customerPath: '/pet/book/pet_transport', description: 'Safe transport to the vet, groomer or boarding' },
  { code: 'pet_vet_assist', name: 'Vet & Appointment Assistance', domainCode: 'pet_services', status: 'live', displayOrder: 6, icon: 'Stethoscope', customerPath: '/pet/book/pet_vet_assist', description: 'Logistics support for a vet visit — not a substitute for one' },
  { code: 'pet_check', name: 'Pet Check & Home Visit', domainCode: 'pet_services', status: 'live', displayOrder: 7, icon: 'ClipboardCheck', customerPath: '/pet/book/pet_check', description: 'A quick visual check-in on your pet while you are out' },
  { code: 'electrical', name: 'Electrical', domainCode: 'home_services', status: 'coming_soon', displayOrder: 2, icon: 'Zap' },
  { code: 'plumbing', name: 'Plumbing', domainCode: 'home_services', status: 'coming_soon', displayOrder: 3, icon: 'Droplet' },
  { code: 'appliance', name: 'Appliances & AC', domainCode: 'home_services', status: 'coming_soon', displayOrder: 4, icon: 'AirVent' },
  { code: 'cleaning', name: 'Cleaning', domainCode: 'home_services', status: 'coming_soon', displayOrder: 5, icon: 'Sparkles' },

  /* Family assist — people-facing work, so the bar is higher (see below). */
  { code: 'elder_care', name: 'Elder Care', domainCode: 'family_assist', status: 'coming_soon', displayOrder: 1, icon: 'HeartHandshake', providerKinds: ['individual'] },
  { code: 'child_care', name: 'Child Care', domainCode: 'family_assist', status: 'coming_soon', displayOrder: 2, icon: 'Baby', providerKinds: ['individual'] },
  { code: 'house_help', name: 'House Help', domainCode: 'family_assist', status: 'coming_soon', displayOrder: 3, icon: 'Users', providerKinds: ['individual'] },

  /*
   * Helping Services. Not a repair-engine vertical — there is no device, no
   * brand, no diagnosis — so `repairVertical` is left null. The line still
   * only reaches a customer once someone holds an APPROVED enrolment for it
   * (liveCatalog's own rule), and a helper only reaches "approved" through
   * this same domain's requirement set below.
   */
  { code: 'shopping_pickup', name: 'Shopping & Pickup Help', domainCode: 'helping_services', status: 'live', displayOrder: 1, icon: 'ShoppingBasket', customerPath: '/helping/shopping', tagline: 'A trusted person to buy or collect it for you', description: 'Buy items from a shop, or collect a pickup, with photos and a receipt at every step', isPopular: true },
  { code: 'returns_exchange', name: 'Returns & Exchange Assistant', domainCode: 'helping_services', status: 'live', displayOrder: 2, icon: 'PackageCheck', customerPath: '/helping/returns', tagline: 'We handle the physical trip, not the merchant’s decision', description: 'A helper takes your return or exchange to the store or courier and brings back proof' },
];

/* ─── Verification requirements ────────────────────────────────────────── */

const IDENTITY_DOCS = [
  { code: 'aadhaar', label: 'Aadhaar card', hint: 'Front and back in one clear photo', required: true },
  { code: 'pan', label: 'PAN card', hint: 'Needed for payouts above ₹20,000 a month', required: false },
  { code: 'selfie', label: 'Live selfie', hint: 'Taken now, not uploaded from the gallery', capture: 'user', required: true },
];

const SHOP_DOCS = [
  { code: 'owner_id', label: "Owner's Aadhaar or PAN", required: true },
  { code: 'shop_photo', label: 'Storefront photo', hint: 'The shop board must be readable', capture: 'environment', required: true },
  { code: 'selfie', label: 'Owner selfie at the shop', capture: 'user', required: true },
  { code: 'gst_certificate', label: 'GST certificate', hint: 'Only if you are GST registered', required: false },
];

const SHOP_FIELDS = [
  { code: 'gst_number', label: 'GST number', pattern: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', required: false },
  { code: 'pan_number', label: 'PAN number', pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$', required: false },
  { code: 'years_active', label: 'Years in business', required: true },
];

const REQUIREMENT_SETS = [
  /* Electronics — domain-wide defaults. */
  {
    name: 'Electronics — shop',
    domainCode: 'electronics', lineCode: null, providerKind: 'shop',
    documents: SHOP_DOCS,
    fields: SHOP_FIELDS,
    declarations: [
      'I will use parts of the quality grade agreed with the customer.',
      'I accept that a repair is only complete once it passes ZappyOne QA.',
    ],
  },
  {
    name: 'Electronics — individual technician',
    domainCode: 'electronics', lineCode: null, providerKind: 'individual',
    documents: IDENTITY_DOCS,
    fields: [{ code: 'experience_years', label: 'Years of repair experience', required: true }],
    declarations: [
      'The device I collect stays in my custody until it is returned.',
      'I accept that a repair is only complete once it passes ZappyOne QA.',
    ],
  },
  /**
   * Laptops override the electronics default: board-level and data work carries
   * a duty of care a phone screen swap does not, so the technician declares it
   * explicitly and shows they can actually do the work.
   */
  {
    name: 'Laptops — individual technician',
    domainCode: 'electronics', lineCode: 'laptop_repair', providerKind: 'individual',
    documents: [
      ...IDENTITY_DOCS,
      { code: 'workbench_photo', label: 'Photo of your workbench', hint: 'Anti-static mat and soldering setup, if you have one', capture: 'environment', required: false },
    ],
    fields: [
      { code: 'experience_years', label: 'Years of laptop repair experience', required: true },
      { code: 'specialisation', label: 'What you are strongest at', hint: 'e.g. board-level, screens, data recovery', required: false },
    ],
    declarations: [
      'I will not access, copy or retain any customer data on a device I service.',
      'I will report data loss immediately rather than attempting an undisclosed recovery.',
      'I accept that a repair is only complete once it passes ZappyOne QA.',
    ],
    minSkillLevel: 2,
  },
  {
    name: 'Laptops — shop',
    domainCode: 'electronics', lineCode: 'laptop_repair', providerKind: 'shop',
    documents: [
      ...SHOP_DOCS,
      { code: 'workshop_photo', label: 'Photo of your workshop area', capture: 'environment', required: true },
    ],
    fields: SHOP_FIELDS,
    declarations: [
      'I will not access, copy or retain any customer data on a device serviced here.',
      'Devices left with us are stored securely and returned in the condition recorded at check-in.',
      'I accept that a repair is only complete once it passes ZappyOne QA.',
    ],
    minSkillLevel: 2,
  },

  /* Vehicles. */
  {
    name: 'Vehicles — shop',
    domainCode: 'vehicles', lineCode: null, providerKind: 'shop',
    documents: [
      ...SHOP_DOCS,
      { code: 'garage_photo', label: 'Photo of the garage bay', capture: 'environment', required: true },
    ],
    fields: SHOP_FIELDS,
    declarations: ['I hold valid third-party liability cover for vehicles in my custody.'],
  },
  {
    name: 'Vehicles — individual mechanic',
    domainCode: 'vehicles', lineCode: null, providerKind: 'individual',
    documents: [
      ...IDENTITY_DOCS,
      { code: 'driving_licence', label: 'Driving licence', hint: 'Required to move a customer vehicle', required: true },
    ],
    fields: [{ code: 'experience_years', label: 'Years of experience', required: true }],
    declarations: ['I will not ride or drive a customer vehicle beyond what the job requires.'],
  },

  /* Home services. */
  {
    name: 'Home services — individual',
    domainCode: 'home_services', lineCode: null, providerKind: 'individual',
    documents: [
      ...IDENTITY_DOCS,
      { code: 'address_proof', label: 'Address proof', required: true },
    ],
    fields: [{ code: 'experience_years', label: 'Years of experience', required: true }],
    declarations: ['I will carry my own tools and leave the work area clean.'],
  },
  {
    name: 'Home services — shop',
    domainCode: 'home_services', lineCode: null, providerKind: 'shop',
    documents: SHOP_DOCS,
    fields: SHOP_FIELDS,
    declarations: ['Every worker I send has been verified by me and by ZappyOne.'],
  },

  /**
   * Helping Services. Lower physical risk than entering someone's home, but a
   * helper may carry a customer's money and their purchased goods — the bar
   * here is financial trust, not a skill (§40).
   */
  {
    name: 'Helping Services — individual',
    domainCode: 'helping_services', lineCode: null, providerKind: 'individual',
    documents: [
      ...IDENTITY_DOCS,
      { code: 'address_proof', label: 'Address proof', required: true },
    ],
    fields: [
      { code: 'can_advance_money', label: 'Can you front cash for a purchase and be reimbursed?', required: true },
      { code: 'vehicle_type', label: 'How do you get around? (walk / two-wheeler / other)', required: true },
    ],
    declarations: [
      'I will buy or collect only what the customer approved, at the price they approved.',
      'I will never spend beyond my advance limit without the customer funding it first.',
    ],
  },

  /**
   * Pet Services. A provider handles a living animal, sometimes alone with it
   * for hours (boarding, home sitting) — the bar sits between Home Services
   * and Family Assist: real verification, without demanding police clearance
   * for a 20-minute walk.
   */
  {
    name: 'Pet Services — individual',
    domainCode: 'pet_services', lineCode: null, providerKind: 'individual',
    documents: [
      ...IDENTITY_DOCS,
      { code: 'address_proof', label: 'Address proof', required: true },
    ],
    fields: [
      { code: 'species_experience', label: 'Which animals have you handled before?', required: true },
      { code: 'experience_years', label: 'Years of experience', required: true },
    ],
    declarations: [
      'I will never leave an animal in my care unattended in an unsafe situation.',
      'I will report any injury, illness or incident to the customer immediately, and will not attempt to diagnose or treat it myself.',
    ],
  },
  {
    name: 'Pet Services — shop / facility',
    domainCode: 'pet_services', lineCode: null, providerKind: 'shop',
    documents: [
      ...SHOP_DOCS,
      { code: 'facility_photo', label: 'Photo of the boarding/grooming area', capture: 'environment', required: true },
    ],
    fields: SHOP_FIELDS,
    declarations: [
      'Every animal in our care has a safe, clean space appropriate to its size.',
      'Every staff member handling animals has been verified by us and by ZappyOne.',
    ],
  },

  /**
   * Family assist is the strictest set on the platform, and deliberately so:
   * this is unsupervised access to a home, a child or an elderly person. Police
   * verification and references are not paperwork here — they are the product.
   */
  {
    name: 'Family assist — individual',
    domainCode: 'family_assist', lineCode: null, providerKind: 'individual',
    documents: [
      ...IDENTITY_DOCS,
      { code: 'police_verification', label: 'Police verification certificate', hint: 'Issued within the last 12 months', required: true },
      { code: 'address_proof', label: 'Address proof', required: true },
      { code: 'reference_letter', label: 'Reference from a previous family or employer', required: true },
    ],
    fields: [
      { code: 'experience_years', label: 'Years of experience', required: true },
      { code: 'languages', label: 'Languages you speak', required: true },
      { code: 'reference_phone', label: 'Reference contact number', pattern: '^[6-9][0-9]{9}$', required: true },
    ],
    declarations: [
      'I consent to a background check and to my references being contacted.',
      'I will never be alone with a child or elder outside the agreed hours and location.',
      'I understand that a single verified safety complaint permanently ends my access to this work.',
    ],
  },
];

module.exports = { DOMAINS, LINES, REQUIREMENT_SETS, IDENTITY_DOCS, SHOP_DOCS, SHOP_FIELDS };
