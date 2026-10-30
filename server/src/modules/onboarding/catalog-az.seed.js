// Every doorstep service ZappyOne opens in version 1, as data: domains, fixed-price package lines (repair/package-lines) and the checks each needs. Starting prices are Hyderabad estimates for 2026-10, used only as the reference a provider's own price is compared with; admin tunes any of them. A line reaches customers only once a verified provider near them offers it.
const HOME = [{ code: '1bhk', name: '1 BHK' }, { code: '2bhk', name: '2 BHK' }, { code: '3bhk', name: '3 BHK' }, { code: '4bhk', name: '4 BHK or villa' }];
const ONE = [{ code: 'one', name: 'Standard' }];
const at = (a, b, c, d) => ({ '1bhk': a, '2bhk': b, '3bhk': c, '4bhk': d });
const one = (p) => ({ one: p });
const same = (types, p) => Object.fromEntries(types.map((t) => [t.code, p]));
const RIDES = [{ code: 'bike', name: 'Bike or scooter' }, { code: 'car', name: 'Car' }];
const CARS = [{ code: 'hatch', name: 'Hatchback' }, { code: 'sedan', name: 'Sedan' }, { code: 'suv', name: 'SUV or MUV' }];
const APPLIANCES = [{ code: 'washer', name: 'Washing machine' }, { code: 'fridge', name: 'Refrigerator' }, { code: 'microwave', name: 'Microwave' }, { code: 'geyser', name: 'Geyser' }, { code: 'tv', name: 'Television' }, { code: 'chimney', name: 'Kitchen chimney' }];
const CLASSES = [{ code: 'primary', name: 'Class 1 to 5' }, { code: 'middle', name: 'Class 6 to 8' }, { code: 'high', name: 'Class 9 and 10' }, { code: 'senior', name: 'Class 11 and 12' }];

const AZ_DOMAINS = [
  { code: 'home_daily_help', name: 'Home & Daily Help', icon: 'Sparkles', displayOrder: 1, description: 'Cleaning, dishes, laundry and everyday upkeep' },
  { code: 'home_services', name: 'Repairs & Maintenance', icon: 'Wrench', displayOrder: 2, description: 'Plumbing, electrical, carpentry, appliances and more' },
  { code: 'vehicles', name: 'Vehicle Care', icon: 'Car', displayOrder: 3, description: 'Washes, detailing, roadside help and repairs' },
  { code: 'beauty_care', name: 'Beauty & Personal Care', icon: 'Scissors', displayOrder: 4, description: 'Grooming, salon, makeup and wellness at home' },
  { code: 'errands_pickup', name: 'Errands, Shopping & Pickup', icon: 'ShoppingBag', displayOrder: 5, description: 'Shopping, pickups, laundry and document runs' },
  { code: 'family_assist', name: 'Family & Everyday Assistance', icon: 'HeartHandshake', displayOrder: 6, description: 'Elders, escorts, functions and household help' },
  { code: 'specialist_home', name: 'Specialist Home Services', icon: 'ShieldCheck', displayOrder: 7, description: 'Pest control, sofa cleaning, painting and installations' },
  { code: 'local_pros', name: 'Other Local Services', icon: 'GraduationCap', displayOrder: 8, description: 'Tutors, trainers, photographers and local professionals' },
];

// Names the original seed gave these domains; the version 1 names replace them only while an operator has not renamed them.
const RENAMED_FROM = { home_services: 'Home Services', vehicles: 'Vehicles', family_assist: 'Family Assist' };

const AZ_LINES = [
  /* 1. Home & Daily Help */
  { code: 'daily_cleaning', name: 'Sweeping, mopping & dusting', domainCode: 'home_daily_help', icon: 'Sparkles', typeWord: 'Home size', thing: 'home', isPopular: true, types: HOME, inHome: true,
    packages: [
      { code: 'sweep_mop', name: 'Sweep and mop all rooms', minutes: 45, prices: at(199, 249, 299, 399) },
      { code: 'dusting', name: 'Dusting of furniture and surfaces', minutes: 40, prices: at(149, 199, 249, 299) },
      { code: 'full_daily', name: 'Daily clean: sweep, mop and dust', minutes: 90, prices: at(349, 449, 549, 699) },
    ] },
  { code: 'dish_kitchen', name: 'Dishwashing & kitchen cleanup', domainCode: 'home_daily_help', icon: 'UtensilsCrossed', typeWord: 'Household', thing: 'kitchen', inHome: true,
    types: [{ code: 'small', name: '1 to 2 people' }, { code: 'family', name: '3 to 5 people' }, { code: 'large', name: '6 or more people' }],
    packages: [
      { code: 'dishes', name: 'Wash and dry the dishes', minutes: 40, prices: { small: 149, family: 199, large: 249 } },
      { code: 'kitchen', name: 'Kitchen wipe-down: counters, stove and sink', minutes: 45, prices: { small: 199, family: 249, large: 299 } },
      { code: 'both', name: 'Dishes and kitchen cleanup', minutes: 75, prices: { small: 299, family: 399, large: 499 } },
    ] },
  { code: 'laundry_ironing', name: 'Folding, ironing & laundry at home', domainCode: 'home_daily_help', icon: 'Shirt', thing: 'clothes', inHome: true, types: ONE,
    packages: [
      { code: 'iron_20', name: 'Ironing, up to 20 clothes', minutes: 60, prices: one(199) },
      { code: 'fold_wardrobe', name: 'Fold and arrange the wardrobe', minutes: 60, prices: one(249) },
      { code: 'wash_fold', name: 'Machine wash, dry and fold one load at home', minutes: 90, prices: one(249) },
    ] },
  { code: 'home_organising', name: 'Bed making & home organising', domainCode: 'home_daily_help', icon: 'BedDouble', typeWord: 'Home size', thing: 'home', types: HOME, inHome: true,
    packages: [
      { code: 'beds', name: 'Make all beds and change sheets', minutes: 30, prices: at(99, 149, 199, 249) },
      { code: 'organise', name: 'Organise cupboards, shelves and rooms', minutes: 120, prices: at(399, 599, 799, 999) },
    ] },
  { code: 'bathroom_balcony', name: 'Bathroom refresh & balcony cleaning', domainCode: 'home_daily_help', icon: 'Bath', thing: 'home', types: ONE, inHome: true,
    packages: [
      { code: 'bathroom', name: 'Bathroom refresh (one bathroom)', minutes: 45, prices: one(249) },
      { code: 'balcony', name: 'Balcony sweep, wash and wipe', minutes: 45, prices: one(199) },
      { code: 'both', name: 'One bathroom and the balcony', minutes: 80, prices: one(399) },
    ] },
  { code: 'plant_party', name: 'Plant watering & party tidy-up', domainCode: 'home_daily_help', icon: 'Flower2', thing: 'home', types: ONE, inHome: true,
    packages: [
      { code: 'plants', name: 'Plant watering visit', minutes: 20, prices: one(99) },
      { code: 'pre_party', name: 'Pre-party tidy and set-up', minutes: 120, prices: one(499) },
      { code: 'post_party', name: 'Post-party clean-up', minutes: 180, prices: one(699) },
    ] },

  /* 2. Repairs & Maintenance (plumbing, electrical and AC are built in) */
  { code: 'carpentry', name: 'Carpenter & furniture assembly', domainCode: 'home_services', icon: 'Hammer', thing: 'job', types: ONE, isPopular: true,
    packages: [
      { code: 'visit', name: 'Carpenter visit and inspection', minutes: 30, prices: one(149) },
      { code: 'assembly', name: 'Furniture assembly (bed, wardrobe or table)', minutes: 90, prices: one(499) },
      { code: 'door', name: 'Door repair or alignment', minutes: 60, prices: one(299) },
      { code: 'hinge', name: 'Hinge, handle or channel fix', minutes: 30, prices: one(149) },
      { code: 'shelf', name: 'Wall shelf install', minutes: 45, prices: one(249) },
    ] },
  { code: 'appliance_repair', name: 'Appliance repair', domainCode: 'home_services', icon: 'WashingMachine', typeWord: 'Appliance', thing: 'appliance', types: APPLIANCES, isPopular: true,
    packages: [
      { code: 'inspect', name: 'Inspection and diagnosis (repair quoted before work)', minutes: 45, prices: same(APPLIANCES, 249) },
      { code: 'service', name: 'General service', minutes: 60, prices: { washer: 499, fridge: 449, microwave: 349, geyser: 399, tv: 399, chimney: 799 } },
    ] },
  { code: 'ro_service', name: 'RO & water purifier service', domainCode: 'home_services', icon: 'GlassWater', thing: 'purifier', types: ONE,
    packages: [
      { code: 'service', name: 'RO service and cleaning', minutes: 60, prices: one(399) },
      { code: 'filters', name: 'Full filter change (filters included)', minutes: 45, prices: one(1499) },
      { code: 'install', name: 'RO installation', minutes: 60, prices: one(499) },
      { code: 'uninstall', name: 'RO uninstallation', minutes: 30, prices: one(249) },
    ] },
  { code: 'locks_mounting', name: 'Door locks, drilling & mounting', domainCode: 'home_services', icon: 'KeyRound', thing: 'job', types: ONE,
    packages: [
      { code: 'lock_install', name: 'Door lock install', minutes: 45, prices: one(299) },
      { code: 'lock_repair', name: 'Door lock repair', minutes: 30, prices: one(199) },
      { code: 'drill', name: 'Drilling, up to 4 holes', minutes: 30, prices: one(149) },
      { code: 'tv_mount', name: 'TV wall mounting', minutes: 45, prices: one(449) },
      { code: 'curtain', name: 'Curtain rod or blind fitting', minutes: 45, prices: one(249) },
    ] },

  /* 3. Vehicle Care (bike and car wash, 2- and 4-wheeler repair are built in) */
  { code: 'car_detailing', name: 'Doorstep car detailing', domainCode: 'vehicles', icon: 'Car', typeWord: 'Car type', thing: 'car', types: CARS,
    packages: [
      { code: 'interior', name: 'Interior deep clean and shampoo', minutes: 180, prices: { hatch: 1499, sedan: 1799, suv: 2199 } },
      { code: 'polish', name: 'Exterior wash, polish and wax', minutes: 150, prices: { hatch: 1299, sedan: 1499, suv: 1799 } },
      { code: 'full', name: 'Full detailing, inside and out', minutes: 300, prices: { hatch: 2499, sedan: 2999, suv: 3499 } },
    ] },
  { code: 'roadside_help', name: 'Battery jump-start & puncture help', domainCode: 'vehicles', icon: 'BatteryCharging', typeWord: 'Vehicle', thing: 'vehicle', types: RIDES, modes: ['roadside', 'doorstep'],
    packages: [
      { code: 'jump', name: 'Battery jump-start', minutes: 30, prices: { bike: 249, car: 349 } },
      { code: 'puncture', name: 'Tubeless puncture repair', minutes: 30, prices: { bike: 149, car: 249 } },
      { code: 'spare', name: 'Fit the spare wheel', minutes: 30, prices: { bike: 199, car: 299 } },
    ] },
  { code: 'vehicle_pickup', name: 'Vehicle inspection & service pickup', domainCode: 'vehicles', icon: 'ClipboardCheck', typeWord: 'Vehicle', thing: 'vehicle', types: RIDES,
    packages: [
      { code: 'inspect', name: 'Doorstep inspection with a written report', minutes: 45, prices: { bike: 299, car: 499 } },
      { code: 'pickup', name: 'Pickup to a service centre and drop back (service bill extra)', minutes: 240, prices: { bike: 399, car: 599 } },
    ] },

  /* 4. Beauty & Personal Care */
  { code: 'mens_grooming', name: "Men's haircut & grooming", domainCode: 'beauty_care', icon: 'Scissors', thing: 'session', types: ONE, isPopular: true,
    packages: [
      { code: 'haircut', name: 'Haircut', minutes: 30, prices: one(199) },
      { code: 'cut_beard', name: 'Haircut and beard styling', minutes: 45, prices: one(299) },
      { code: 'beard', name: 'Beard trim and styling', minutes: 20, prices: one(149) },
      { code: 'facial', name: 'Facial and clean-up', minutes: 45, prices: one(499) },
      { code: 'head_massage', name: 'Head massage', minutes: 30, prices: one(299) },
    ] },
  { code: 'salon_home', name: 'Salon at home', domainCode: 'beauty_care', icon: 'Sparkle', thing: 'session', types: ONE, isPopular: true, inHome: true,
    packages: [
      { code: 'waxing', name: 'Full arms and legs waxing', minutes: 60, prices: one(699) },
      { code: 'facial', name: 'Facial', minutes: 60, prices: one(799) },
      { code: 'threading', name: 'Eyebrow and upper-lip threading', minutes: 15, prices: one(49) },
      { code: 'mani_pedi', name: 'Manicure and pedicure', minutes: 75, prices: one(899) },
      { code: 'hair_spa', name: 'Hair spa', minutes: 60, prices: one(799) },
    ] },
  { code: 'makeup_mehndi', name: 'Makeup, mehndi & hairstyling', domainCode: 'beauty_care', icon: 'Palette', thing: 'session', types: ONE,
    packages: [
      { code: 'party_makeup', name: 'Party makeup', minutes: 60, prices: one(1499) },
      { code: 'bridal_makeup', name: 'Bridal makeup', minutes: 180, prices: one(8999) },
      { code: 'mehndi', name: 'Mehndi, both hands', minutes: 60, prices: one(499) },
      { code: 'bridal_mehndi', name: 'Bridal mehndi, hands and feet', minutes: 240, prices: one(2999) },
      { code: 'hairstyle', name: 'Hairstyling', minutes: 45, prices: one(699) },
    ] },
  { code: 'massage_wellness', name: 'Massage & wellness', domainCode: 'beauty_care', icon: 'Leaf', thing: 'session', types: ONE, inHome: true,
    description: 'Relaxation therapy by qualified therapists. Not medical treatment.',
    packages: [
      { code: 'swedish', name: 'Relaxing full-body massage, 60 min', minutes: 60, prices: one(1199) },
      { code: 'deep', name: 'Deep tissue massage, 60 min', minutes: 60, prices: one(1399) },
      { code: 'foot', name: 'Foot reflexology, 45 min', minutes: 45, prices: one(699) },
    ] },

  /* 5. Errands, Shopping & Pickup (grocery runs, shopping pickup, returns and parcels are built in) */
  { code: 'laundry_pickup', name: 'Laundry pickup & drop-off', domainCode: 'errands_pickup', icon: 'Shirt', thing: 'laundry', types: ONE,
    description: 'We collect your clothes, take them to your laundry and bring them back. The laundry bill is paid to the laundry.',
    packages: [{ code: 'trip', name: 'Pickup and drop back, within 5 km', minutes: 60, prices: one(99) }] },
  { code: 'document_delivery', name: 'Document collection & delivery', domainCode: 'errands_pickup', icon: 'FileText', thing: 'documents', types: ONE,
    description: 'Collect papers from one place and hand them over at another, with a photo at both ends.',
    packages: [
      { code: 'city', name: 'Collect and deliver within 10 km', minutes: 60, prices: one(149) },
      { code: 'wait', name: 'Collect, wait for a signature and bring back', minutes: 120, prices: one(249) },
    ] },

  /* 6. Family & Everyday Assistance (elder check-in, doctor escort, party and puja help are built in) */
  { code: 'household_help', name: 'General household help', domainCode: 'family_assist', icon: 'Users', thing: 'home', types: ONE, inHome: true,
    description: 'An extra pair of hands at home for odd jobs. No cooking, no medical care.',
    packages: [
      { code: 'two_hours', name: 'Household helper, 2 hours', minutes: 120, prices: one(299) },
      { code: 'four_hours', name: 'Household helper, 4 hours', minutes: 240, prices: one(549) },
    ] },

  /* 7. Specialist Home Services (deep cleaning and water tank cleaning are built in) */
  { code: 'pest_control', name: 'Pest control', domainCode: 'specialist_home', icon: 'Bug', typeWord: 'Home size', thing: 'home', types: HOME, isPopular: true,
    description: 'By providers holding a pest control licence. Safe for children and pets when the advice is followed.',
    packages: [
      { code: 'general', name: 'General pest control', minutes: 60, prices: at(999, 1199, 1499, 1799) },
      { code: 'cockroach', name: 'Cockroach gel treatment', minutes: 45, prices: at(699, 799, 999, 1199) },
      { code: 'termite_check', name: 'Termite inspection', minutes: 45, prices: at(299, 299, 299, 299) },
      { code: 'bed_bugs', name: 'Bed bug treatment', minutes: 90, prices: at(1499, 1799, 2199, 2599) },
    ] },
  { code: 'sofa_mattress', name: 'Sofa, mattress & carpet cleaning', domainCode: 'specialist_home', icon: 'Sofa', thing: 'furniture', types: ONE,
    packages: [
      { code: 'sofa_3', name: '3-seater sofa shampoo', minutes: 90, prices: one(699) },
      { code: 'sofa_seat', name: 'Sofa shampoo, per extra seat', minutes: 30, prices: one(249) },
      { code: 'mattress_single', name: 'Single mattress cleaning', minutes: 45, prices: one(499) },
      { code: 'mattress_double', name: 'Double mattress cleaning', minutes: 60, prices: one(699) },
      { code: 'carpet', name: 'Carpet shampoo, up to 50 sq ft', minutes: 60, prices: one(599) },
    ] },
  { code: 'painting', name: 'Painting & minor renovation', domainCode: 'specialist_home', icon: 'PaintRoller', thing: 'home', types: ONE,
    description: 'A site visit first; the job is quoted in the app and starts only once you approve it.',
    packages: [
      { code: 'site_visit', name: 'Site visit and written quote', minutes: 45, prices: one(199) },
      { code: 'touch_up', name: 'Wall touch-up, one wall', minutes: 180, prices: one(1499) },
      { code: 'damp_check', name: 'Damp and waterproofing inspection', minutes: 45, prices: one(299) },
    ] },
  { code: 'appliance_install', name: 'Appliance installation', domainCode: 'specialist_home', icon: 'Plug', typeWord: 'Appliance', thing: 'appliance',
    types: [{ code: 'washer', name: 'Washing machine' }, { code: 'chimney', name: 'Kitchen chimney' }, { code: 'geyser', name: 'Geyser' }, { code: 'tv', name: 'Television' }, { code: 'hob', name: 'Gas hob' }],
    packages: [{ code: 'install', name: 'Installation and demo', minutes: 60, prices: { washer: 499, chimney: 1299, geyser: 499, tv: 499, hob: 399 } }] },

  /* 8. Other Local Services (pet care and events are built in) */
  { code: 'home_tutor', name: 'Home tutors', domainCode: 'local_pros', icon: 'GraduationCap', typeWord: 'Class', thing: 'class', types: CLASSES, inHome: true, children: true,
    packages: [
      { code: 'trial', name: 'Trial class', minutes: 60, prices: same(CLASSES, 199) },
      { code: 'session', name: 'One class at home', minutes: 60, prices: { primary: 299, middle: 349, high: 399, senior: 499 } },
    ] },
  { code: 'music_teacher', name: 'Music teachers', domainCode: 'local_pros', icon: 'Music', typeWord: 'Instrument', thing: 'class', inHome: true,
    types: [{ code: 'guitar', name: 'Guitar' }, { code: 'keyboard', name: 'Keyboard or piano' }, { code: 'vocal', name: 'Vocals' }, { code: 'other', name: 'Other instrument' }],
    packages: [
      { code: 'trial', name: 'Trial class', minutes: 45, prices: { guitar: 199, keyboard: 199, vocal: 199, other: 199 } },
      { code: 'session', name: 'One class at home', minutes: 60, prices: { guitar: 499, keyboard: 499, vocal: 499, other: 499 } },
    ] },
  { code: 'fitness_trainer', name: 'Fitness & yoga trainers', domainCode: 'local_pros', icon: 'Dumbbell', typeWord: 'Training', thing: 'session', inHome: true,
    types: [{ code: 'personal', name: 'Personal training' }, { code: 'yoga', name: 'Yoga' }],
    packages: [
      { code: 'trial', name: 'Trial session', minutes: 45, prices: { personal: 199, yoga: 199 } },
      { code: 'session', name: 'One session at home', minutes: 60, prices: { personal: 599, yoga: 499 } },
    ] },
  { code: 'photography', name: 'Photography', domainCode: 'local_pros', icon: 'Camera', typeWord: 'Shoot', thing: 'shoot',
    types: [{ code: 'event', name: 'Event' }, { code: 'portrait', name: 'Portrait or family' }, { code: 'product', name: 'Product' }],
    packages: [
      { code: 'hour', name: 'One hour of shooting, edited photos', minutes: 60, prices: { event: 1499, portrait: 1199, product: 999 } },
      { code: 'half_day', name: 'Half day, up to 4 hours', minutes: 240, prices: { event: 4999, portrait: 3999, product: 3499 } },
    ] },
];

const IDENTITY = [
  { code: 'aadhaar', label: 'Aadhaar card', hint: 'Front and back in one clear photo', required: true },
  { code: 'pan', label: 'PAN card', hint: 'Needed for payouts above ₹20,000 a month', required: false },
  { code: 'selfie', label: 'Live selfie', hint: 'Taken now, not uploaded from the gallery', capture: 'user', required: true },
];
const BUSINESS = [
  { code: 'owner_id', label: "Owner's Aadhaar or PAN", required: true },
  { code: 'shop_photo', label: 'Storefront or office photo', hint: 'The board must be readable', capture: 'environment', required: true },
  { code: 'selfie', label: 'Owner selfie at the premises', capture: 'user', required: true },
  { code: 'gst_certificate', label: 'GST certificate', hint: 'Only if you are GST registered', required: false },
];
const BUSINESS_FIELDS = [
  { code: 'business_name', label: 'Registered business name', required: true },
  { code: 'team_size', label: 'How many people work with you', required: true },
  { code: 'years_active', label: 'Years in business', required: true },
];
// Anyone working alone inside a customer's home, or with children, shows a police verification certificate.
const PCC = { code: 'police_verification', label: 'Police verification certificate', hint: 'From your local police station or the Telangana police website, issued in the last 12 months', required: true };
const IN_HOME = 'I will not enter rooms I was not asked into, and I will leave the moment the customer asks.';
const HONEST = 'I charge only the price shown in the app; anything extra is sent for the customer to approve first.';

const domainSets = (code, label, extra = {}) => [
  { name: `${label} - business or agency`, domainCode: code, lineCode: null, providerKind: 'shop', documents: [...BUSINESS, ...(extra.shopDocs || [])], fields: BUSINESS_FIELDS, declarations: [HONEST, ...(extra.declarations || [])] },
  { name: `${label} - individual`, domainCode: code, lineCode: null, providerKind: 'individual', documents: [...IDENTITY, ...(extra.individualDocs || [])], fields: [{ code: 'experience_years', label: 'Years of experience', required: true }], declarations: [HONEST, ...(extra.declarations || [])] },
];
const lineSets = (lineCode, domainCode, label, docs, declarations, kinds = ['shop', 'individual']) => kinds.map((k) => ({
  name: `${label} - ${k === 'shop' ? 'business or agency' : 'individual'}`, domainCode, lineCode, providerKind: k,
  documents: [...(k === 'shop' ? BUSINESS : IDENTITY), ...docs], fields: k === 'shop' ? BUSINESS_FIELDS : [{ code: 'experience_years', label: 'Years of experience', required: true }],
  declarations: [HONEST, ...declarations],
}));

const AZ_REQUIREMENT_SETS = [
  ...domainSets('home_daily_help', 'Home & Daily Help', { individualDocs: [PCC], declarations: [IN_HOME] }),
  ...domainSets('beauty_care', 'Beauty & Personal Care', { declarations: ['I use sealed or sanitised tools for every customer.'] }),
  ...domainSets('errands_pickup', 'Errands & Pickup', { declarations: ['I photograph every item at pickup and at handover.', 'I never open a sealed parcel or document cover.'] }),
  ...domainSets('specialist_home', 'Specialist Home Services', { shopDocs: [{ code: 'equipment_photo', label: 'Photo of your equipment', capture: 'environment', required: true }] }),
  ...domainSets('local_pros', 'Local professionals', { individualDocs: [{ code: 'portfolio', label: 'Certificate or portfolio sample', required: false }] }),
  ...lineSets('pest_control', 'specialist_home', 'Pest control', [{ code: 'pest_licence', label: 'Pest control licence', hint: 'Issued by the state agriculture department under the Insecticides Act', required: true }], ['I use only approved chemicals and give the customer the safety advice in writing.']),
  ...lineSets('massage_wellness', 'beauty_care', 'Massage & wellness', [{ code: 'therapy_certificate', label: 'Massage or wellness therapy certificate', required: true }, PCC], ['This is relaxation therapy, not medical treatment.', 'The customer can ask for a therapist of the same gender, and can stop the session at any time.']),
  ...lineSets('home_tutor', 'local_pros', 'Home tutors', [PCC, { code: 'qualification', label: 'Highest qualification certificate', required: true }], ['A parent or adult stays at home during every class with a child.']),
  ...lineSets('household_help', 'family_assist', 'Household help', [PCC], [IN_HOME, 'No cooking, no medical care.']),
  ...lineSets('salon_home', 'beauty_care', 'Salon at home', [PCC], [IN_HOME, 'I use sealed or sanitised tools for every customer.']),
];

module.exports = { AZ_DOMAINS, AZ_LINES, AZ_REQUIREMENT_SETS, RENAMED_FROM };
