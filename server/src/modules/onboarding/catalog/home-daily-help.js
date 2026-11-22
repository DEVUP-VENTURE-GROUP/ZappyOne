// Home & Daily Help, the full catalog: more jobs on the first six services and nine new ones; prices are starting suggestions, each partner sets their own.
const HOME = [{ code: '1bhk', name: '1 BHK' }, { code: '2bhk', name: '2 BHK' }, { code: '3bhk', name: '3 BHK' }, { code: '4bhk', name: '4 BHK or villa' }];
const ONE = [{ code: 'one', name: 'Standard' }];
const at = (a, b, c, d) => ({ '1bhk': a, '2bhk': b, '3bhk': c, '4bhk': d });
const one = (p) => ({ one: p });
const ppl = (a, b, c) => ({ small: a, family: b, large: c });
const job = (code, name, minutes, prices, includes) => ({ code, name, minutes, prices, includes: includes.split('|') });

const extend = {
  daily_cleaning: [
    job('fans_lights', 'Fans and light fittings dusting', 40, at(149, 199, 249, 299), 'Ceiling fans wiped|Tube lights and bulbs dusted|Switchboards wiped'),
    job('cobwebs', 'Cobweb removal, all rooms', 30, at(99, 149, 199, 249), 'Ceilings and corners|Behind doors and curtains|Sweep after'),
    job('under_furniture', 'Clean under beds and sofas', 45, at(199, 249, 299, 349), 'Furniture moved and put back|Sweep and mop underneath|Dust balls removed'),
    job('floor_scrub_light', 'Floor scrub with cleaner, all rooms', 90, at(399, 499, 599, 749), 'Scrub with floor cleaner|Corners and edges|Dry mop after'),
    job('weekly_deep', 'Weekly deep clean: sweep, mop, dust and cobwebs', 150, at(599, 749, 899, 1099), 'Sweep and mop all rooms|Dust furniture and fans|Cobwebs and corners'),
    job('doors_windows_wipe', 'Doors, window sills and grills wipe', 60, at(199, 249, 299, 399), 'Doors and handles|Window sills|Grills wiped inside'),
  ],
  dish_kitchen: [
    job('stove', 'Gas stove and burner cleaning', 30, ppl(149, 149, 199), 'Burners soaked and scrubbed|Stove top degreased|Knobs wiped'),
    job('fridge_wipe', 'Fridge wipe, inside and outside', 45, ppl(199, 249, 299), 'Shelves and trays washed|Old food cleared with you|Outside and handles wiped'),
    job('utensil_shine', 'Steel and copper utensil polishing', 60, ppl(199, 299, 399), 'Steel utensils shined|Burnt marks scrubbed|Dried and stacked'),
    job('cabinets_wipe', 'Kitchen cabinets wipe, outside', 45, ppl(199, 249, 299), 'Cabinet doors and handles|Grease spots removed|Shelf edges wiped'),
    job('veg_prep', 'Vegetable cutting and kitchen prep', 45, ppl(149, 199, 249), 'Wash and cut vegetables|Store in boxes|Counter cleaned after'),
  ],
  laundry_ironing: [
    job('iron_50', 'Ironing, up to 50 clothes', 120, one(399), 'Steam or dry iron|Folded or hung|Your iron and board'),
    job('saree_steam', 'Saree and delicate steam ironing, up to 5', 60, one(299), 'Steam pressed with care|Pleats set|Hung on hangers'),
    job('bed_linen', 'Change and wash bed linen, all beds', 60, one(199), 'Sheets and covers changed|Machine wash one load|Fresh sheets folded'),
    job('hand_wash', 'Hand wash delicates and woollens', 60, one(249), 'Gentle hand wash|Dried in shade|Folded after'),
    job('curtain_wash', 'Curtains take down, wash and hang', 120, one(449), 'Up to 6 panels|Machine wash at home|Rehung after drying'),
    job('shoe_clean', 'Shoe cleaning and polish, up to 6 pairs', 45, one(199), 'Dust and dirt removed|Polish or wipe by material|Laces washed'),
  ],
  home_organising: [
    job('wardrobe', 'Wardrobe organising, one wardrobe', 90, at(299, 299, 349, 399), 'Clothes sorted and folded|Seasonal clothes separated|Shelves wiped'),
    job('kitchen_organise', 'Kitchen shelves and pantry organising', 120, at(399, 499, 599, 699), 'Jars and boxes arranged|Expired items shown to you|Shelves wiped'),
    job('kids_room', 'Kids room and toy organising', 90, at(299, 349, 399, 449), 'Toys sorted into boxes|Books on shelves|Floor cleared'),
    job('declutter', 'Declutter: sort keep, donate and discard', 180, at(699, 899, 1099, 1399), 'Room by room with you|Bags for donate and discard|Space cleaned after'),
    job('unpack', 'Unpack and set up after moving', 240, at(999, 1399, 1799, 2299), 'Boxes unpacked|Kitchen and wardrobes set up|Packing waste cleared'),
    job('festive_setup', 'Festive decoration set-up and take-down', 120, at(399, 499, 599, 699), 'Lights and decorations put up|Taken down after|Stored in boxes'),
  ],
  bathroom_balcony: [
    job('toilet_only', 'Toilet and wash basin cleaning', 30, one(149), 'Toilet scrubbed|Basin and tap shined|Floor wiped'),
    job('two_bath', 'Bathroom refresh, two bathrooms', 80, one(449), 'Toilet, basin and floor|Mirror and fittings|Two bathrooms'),
    job('tiles_scrub', 'Bathroom tiles and floor scrub', 60, one(299), 'Wall tiles scrubbed|Floor scrubbed|Rinsed and dried'),
    job('mirror_fittings', 'Mirrors, taps and fittings shine', 30, one(149), 'Mirrors streak-free|Taps and shower shined|Towel rods wiped'),
    job('balcony_grill', 'Balcony grill and railing cleaning', 45, one(249), 'Grills dusted and washed|Railings wiped|Floor rinsed'),
    job('terrace_wash', 'Terrace sweep and wash', 90, one(499), 'Leaves and dust swept|Floor washed|Drain outlets cleared'),
  ],
  plant_party: [
    job('plants_week', 'Plant watering, 7 daily visits', 20, one(599), 'One visit each day|Indoor and balcony plants|Dry leaves removed'),
    job('guest_ready', 'Guest-ready home tidy', 90, one(399), 'Living room tidied|Bathroom freshened|Cushions and beds set'),
    job('after_puja', 'After puja or function clean-up', 120, one(499), 'Flowers and leftovers cleared|Floor swept and mopped|Utensils washed'),
    job('serve_help', 'Serving and clearing help during a party, 3 hours', 180, one(599), 'Serve food and drinks|Clear plates|Kitchen tidy after'),
  ],
};

const lines = [
  { code: 'instant_help', prefix: 'insthelp', name: 'Quick home help by the hour', domainCode: 'home_daily_help', icon: 'HeartHandshake', thing: 'visit', types: ONE, inHome: true, isPopular: true,
    description: 'A trained helper for any household chores, booked by time',
    packages: [
      job('half_hour', 'Home help, 30 minutes', 30, one(99), 'Any light chores you choose|Sweep, dishes or tidy|Helper brings basics'),
      job('one_hour', 'Home help, 1 hour', 60, one(179), 'Any chores you choose|Cleaning, dishes or laundry|Helper brings basics'),
      job('two_hours', 'Home help, 2 hours', 120, one(329), 'Any chores you choose|Mix of cleaning and kitchen|Helper brings basics'),
      job('three_hours', 'Home help, 3 hours', 180, one(469), 'Any chores you choose|Good for weekly catch-up|Helper brings basics'),
      job('four_hours', 'Home help, 4 hours', 240, one(599), 'Any chores you choose|Half-day help|Helper brings basics'),
      job('full_day', 'Home help, full day (8 hours)', 480, one(999), 'Any chores you choose|Lunch break of 30 minutes|Helper brings basics'),
    ] },
  { code: 'kitchen_deep', prefix: 'kitdeep', name: 'Kitchen deep cleaning', domainCode: 'home_daily_help', icon: 'UtensilsCrossed', typeWord: 'Kitchen', thing: 'kitchen', inHome: true,
    types: [{ code: 'small', name: 'Small kitchen' }, { code: 'medium', name: 'Medium kitchen' }, { code: 'large', name: 'Large or modular kitchen' }],
    packages: [
      job('full', 'Full kitchen deep clean', 240, { small: 1299, medium: 1599, large: 1999 }, 'Cabinets inside and outside|Tiles, stove and sink degreased|Chimney outside and slab'),
      job('cabinets_inside', 'Cabinets and drawers deep clean, inside', 150, { small: 699, medium: 899, large: 1199 }, 'Emptied and wiped inside|Items put back|Handles degreased'),
      job('tiles_degrease', 'Kitchen wall tiles degreasing', 90, { small: 499, medium: 649, large: 799 }, 'Oil stains removed|Grout scrubbed|Rinsed and dried'),
      job('sink_drain', 'Sink, tap and drain deep clean', 45, { small: 249, medium: 249, large: 299 }, 'Sink scrubbed|Tap descaled|Drain cleared of smell'),
      job('slab_stove', 'Slab and stove deep clean', 60, { small: 349, medium: 399, large: 499 }, 'Granite slab degreased|Stove and burners|Backsplash wiped'),
      job('appliances_outside', 'Kitchen appliances outside clean', 60, { small: 299, medium: 349, large: 449 }, 'Fridge, microwave and mixer outside|Grease removed|Handles shined'),
    ] },
  { code: 'bathroom_deep', prefix: 'bathdeep', name: 'Bathroom deep cleaning', domainCode: 'home_daily_help', icon: 'Bath', typeWord: 'Bathrooms', thing: 'bathroom', inHome: true,
    types: [{ code: 'b1', name: '1 bathroom' }, { code: 'b2', name: '2 bathrooms' }, { code: 'b3', name: '3 bathrooms' }],
    packages: [
      job('deep', 'Bathroom deep clean', 75, { b1: 449, b2: 849, b3: 1199 }, 'Toilet, basin and floor deep scrub|Tiles and grout|Fittings descaled'),
      job('hard_water', 'Hard water stain removal', 60, { b1: 399, b2: 749, b3: 1049 }, 'Taps and shower descaled|Glass and tiles|Safe acid-free cleaner'),
      job('grout', 'Tile grout scrubbing and whitening', 90, { b1: 499, b2: 949, b3: 1349 }, 'Black grout lines scrubbed|Whitened|Rinsed and dried'),
      job('shower_glass', 'Shower glass and partition cleaning', 30, { b1: 249, b2: 449, b3: 649 }, 'Soap scum removed|Streak-free glass|Frames wiped'),
      job('exhaust', 'Exhaust fan and vents cleaning', 30, { b1: 149, b2: 249, b3: 349 }, 'Fan blades cleaned|Vent grill washed|Dust cleared'),
      job('toilet_deep', 'Toilet deep clean and stain removal', 40, { b1: 249, b2: 449, b3: 649 }, 'Yellow stains removed|Under the rim|Flush tank outside'),
    ] },
  { code: 'full_home_deep', prefix: 'fhdeep', name: 'Full home deep cleaning', domainCode: 'home_daily_help', icon: 'Home', typeWord: 'Home size', thing: 'home', types: HOME, inHome: true, isPopular: true,
    packages: [
      job('furnished', 'Full home deep clean, furnished', 360, at(2999, 3999, 4999, 6499), 'Every room, kitchen and bathroom|Fans, windows and fittings|Floors scrubbed'),
      job('unfurnished', 'Full home deep clean, empty home', 300, at(2499, 3299, 4199, 5499), 'Walls dusted and floors scrubbed|Kitchen and bathrooms|Windows and grills'),
      job('move_in', 'Move-in deep clean', 360, at(2799, 3699, 4699, 5999), 'Cabinets and wardrobes inside|Kitchen and bathrooms|Floors and windows'),
      job('move_out', 'Move-out deep clean for your deposit', 360, at(2799, 3699, 4699, 5999), 'Stains and marks removed|Kitchen and bathrooms|Ready for handover'),
      job('post_renovation', 'After painting or renovation clean', 420, at(3499, 4499, 5499, 6999), 'Paint and cement spots removed|Dust from every surface|Floors scrubbed'),
      job('rooms_only', 'Bedrooms and living room deep clean', 240, at(1499, 1999, 2499, 3199), 'Fans, windows and furniture|Under beds and sofas|Floors scrubbed'),
    ] },
  { code: 'appliance_clean', prefix: 'applcln', name: 'Fridge, oven & appliance cleaning', domainCode: 'home_daily_help', icon: 'WashingMachine', thing: 'appliance', types: ONE, inHome: true,
    packages: [
      job('fridge_deep', 'Fridge deep clean, inside and out', 60, one(399), 'Shelves and trays washed|Rubber seals cleaned|Smell removed'),
      job('microwave', 'Microwave and OTG cleaning', 30, one(199), 'Inside degreased|Turntable washed|Door glass shined'),
      job('oven', 'Oven deep clean', 60, one(449), 'Burnt grease removed|Racks soaked and scrubbed|Glass door'),
      job('washer_drum', 'Washing machine drum cleaning', 45, one(349), 'Drum descaled|Detergent tray washed|Rubber seal cleaned'),
      job('dispenser', 'Water dispenser and RO outside cleaning', 30, one(199), 'Tank and taps wiped|Drip tray washed|Outside cleaned'),
      job('chimney_outside', 'Chimney outside and filter wash', 45, one(299), 'Mesh filters soaked|Outside degreased|Refitted'),
    ] },
  { code: 'floor_scrub', prefix: 'flrscrub', name: 'Floor scrubbing & stain removal', domainCode: 'home_daily_help', icon: 'Sparkle', typeWord: 'Home size', thing: 'home', types: HOME, inHome: true,
    packages: [
      job('machine_scrub', 'Machine floor scrubbing, whole home', 180, at(999, 1399, 1799, 2299), 'Scrubbing machine|Corners by hand|Dry finish'),
      job('stains', 'Floor stain and spot removal', 60, at(299, 399, 499, 599), 'Oil, ink and food stains|Safe for the floor type|Area wiped after'),
      job('grout_floor', 'Floor tile grout cleaning', 150, at(799, 1099, 1399, 1799), 'Grout lines scrubbed|Whitened|Mopped after'),
      job('parking', 'Parking or porch wash', 60, at(299, 299, 399, 499), 'Swept|Washed with cleaner|Oil spots treated'),
      job('stairs', 'Staircase sweep, mop and railing wipe', 60, at(249, 299, 349, 449), 'Every step swept and mopped|Railings wiped|Landing cleaned'),
    ] },
  { code: 'high_dusting', prefix: 'hidust', name: 'Fans, lights & ceiling cleaning', domainCode: 'home_daily_help', icon: 'AirVent', typeWord: 'Home size', thing: 'home', types: HOME, inHome: true,
    packages: [
      job('all_fans', 'All ceiling fans deep clean', 60, at(199, 299, 399, 499), 'Blades washed, not just dusted|Motor cover wiped|Floor cleaned after'),
      job('chandelier', 'Chandelier and decorative light cleaning', 60, at(399, 399, 499, 599), 'Each piece wiped|Bulbs dusted|Ladder brought'),
      job('ceiling', 'Ceilings and wall tops dusting', 60, at(249, 349, 449, 549), 'Ceilings and wall tops|Cobwebs|Lofts outside'),
      job('lofts', 'Lofts and top shelves cleaning', 90, at(349, 449, 549, 699), 'Emptied and wiped|Items put back|Dust removed'),
      job('ac_vents', 'AC indoor unit outside and filter wash', 30, at(199, 349, 499, 649), 'Filters washed|Outside panel wiped|No gas work'),
    ] },
  { code: 'sanitisation', prefix: 'sanit', name: 'Home sanitisation & disinfection', domainCode: 'home_daily_help', icon: 'ShieldCheck', typeWord: 'Home size', thing: 'home', types: HOME, inHome: true,
    packages: [
      job('home', 'Whole home sanitisation spray', 60, at(799, 999, 1199, 1499), 'Safe disinfectant spray|Door handles and switches|Kitchen and bathrooms'),
      job('touch_points', 'High-touch points disinfection', 30, at(299, 349, 399, 499), 'Handles, switches and remotes|Tables and taps|Safe for children'),
      job('after_illness', 'After illness room disinfection', 60, at(599, 599, 699, 799), 'Room and bathroom|Bedding stripped for wash|Surfaces disinfected'),
      job('sofa_mattress_sanitise', 'Sofa and mattress sanitising spray', 45, at(399, 499, 599, 699), 'Fabric-safe spray|Dust mites treated|Dries in an hour'),
      job('fogging', 'Fogging disinfection, whole home', 90, at(1199, 1499, 1799, 2199), 'Dry fog machine|Reaches every corner|Ventilate after 30 minutes'),
    ] },
  { code: 'festival_cleaning', prefix: 'festcln', name: 'Festival & occasion cleaning', domainCode: 'home_daily_help', icon: 'PartyPopper', typeWord: 'Home size', thing: 'home', types: HOME, inHome: true,
    packages: [
      job('festival_deep', 'Festival deep clean (Diwali, Sankranti, Eid, Christmas)', 300, at(2499, 3299, 4199, 5299), 'Every room, kitchen and bathroom|Fans and windows|Floors scrubbed'),
      job('puja_room', 'Puja room cleaning and brass polish', 60, at(299, 299, 349, 399), 'Idols and lamps cleaned with care|Brass and silver polished|Shelf wiped'),
      job('pre_guests', 'Before guests arrive', 120, at(499, 699, 899, 1099), 'Living room and bathrooms|Dusting and mopping|Beds made'),
      job('after_guests', 'After guests leave', 150, at(599, 799, 999, 1199), 'Linen changed|Kitchen and bathrooms|Floors mopped'),
      job('wedding_home', 'Home clean before a wedding or function', 360, at(2999, 3999, 4999, 6499), 'Whole home deep clean|Balcony and entrance|Ready for decoration'),
    ] },
];

module.exports = { extend, lines };
