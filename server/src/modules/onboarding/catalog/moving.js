// Moving & Shifting, the must-have moves in depth: more jobs on packers and goods transport, and seven new services; prices are starting suggestions, each partner sets their own.
const { HOME, ONE, at, job } = require('./helpers');

const RIDES = [{ code: 'bike', name: 'Bike or scooter' }, { code: 'car', name: 'Car' }];
const ride = (b, c) => ({ bike: b, car: c });
const OFFICE = [{ code: 'small', name: 'Up to 10 desks' }, { code: 'medium', name: '10 to 30 desks' }, { code: 'large', name: '30+ desks' }];
const office = (s, m, l) => ({ small: s, medium: m, large: l });
const TRUCKS = [{ code: 'ace', name: 'Tata Ace / small tempo' }, { code: 'pickup', name: 'Pickup (8 ft)' }, { code: 'truck14', name: '14 ft truck' }];
const truck = (a, p, t) => ({ ace: a, pickup: p, truck14: t });

const extend = {
  packers_movers: [
    job('same_building', 'Shift within the same building or society', 240, at(2999, 3999, 5499, 6999), 'Packing and loading|Carry by lift or stairs|Unload and place'),
    job('dismantle', 'Furniture dismantle and reassembly', 180, at(999, 1499, 1999, 2499), 'Beds, wardrobes and tables|Screws bagged and labelled|Reassembled at new home'),
    job('ac_shift', 'AC uninstall and reinstall during a move', 180, at(1799, 1799, 3299, 4799), 'Gas-safe uninstall|Reinstall at new home|Leak test'),
    job('insurance', 'Transit insurance add-on', 15, at(499, 699, 999, 1299), 'Covers damage in transit|Claim support|Item list made'),
    job('premium_pack', 'Premium packing with bubble wrap and cartons', 240, at(2499, 3499, 4499, 5999), 'Bubble wrap and corrugated sheets|Labelled cartons|Fragile items boxed'),
  ],
  goods_transport: [
    job('half_day', 'Mini-truck for half a day with driver', 240, 1999, 'Driver and vehicle|Up to 40 km|Loading not included'),
    job('shop_stock', 'Shop stock or wholesale pickup', 120, 1199, 'Pickup from market|Drop at your shop|One helper'),
    job('construction', 'Construction material transport', 120, 1499, 'Cement, tiles or sand bags|Covered carry|Up to 20 km'),
  ],
};

const lines = [
  { code: 'intercity_moving', prefix: 'intercty', name: 'Intercity home shifting', domainCode: 'moving', icon: 'Truck', typeWord: 'Home size', thing: 'home', types: HOME, isPopular: true,
    packages: [
      job('survey', 'Survey visit and fixed quote', 45, at(199, 199, 199, 199), 'Items listed|Volume worked out|Fixed quote'),
      job('upto_500', 'Shifting up to 500 km', 1440, at(14999, 21999, 29999, 39999), 'Packing, loading and unloading|Dedicated or shared truck|Tracking and updates'),
      job('upto_1000', 'Shifting 500 to 1,000 km', 1440, at(19999, 28999, 38999, 49999), 'Packing, loading and unloading|Dedicated or shared truck|Tracking and updates'),
      job('above_1000', 'Shifting above 1,000 km', 1440, at(26999, 37999, 49999, 64999), 'Packing, loading and unloading|Dedicated truck|Tracking and updates'),
      job('part_load', 'Part-load shifting, a few items', 1440, at(6999, 8999, 10999, 12999), 'Shared truck|Items packed|Door to door'),
      job('student', 'Student or bachelor move, up to 15 boxes', 1440, at(4999, 5999, 6999, 7999), 'Boxes and a bike optional|Shared truck|Door to door'),
    ] },
  { code: 'vehicle_shifting', prefix: 'vehshift', name: 'Bike & car shifting', domainCode: 'moving', icon: 'Car', typeWord: 'Vehicle', thing: 'vehicle', types: RIDES,
    packages: [
      job('city', 'Within the city', 180, ride(1499, 3499), 'Pickup and drop|Covered carrier|Photos at pickup and drop'),
      job('upto_500', 'Intercity up to 500 km', 1440, ride(3999, 9999), 'Bike packed or car on carrier|Insurance option|Tracking'),
      job('upto_1500', 'Intercity 500 to 1,500 km', 1440, ride(5999, 14999), 'Bike packed or car on carrier|Insurance option|Tracking'),
      job('long', 'Intercity above 1,500 km', 1440, ride(7999, 19999), 'Bike packed or car on carrier|Insurance option|Tracking'),
      job('tow', 'Breakdown tow to a garage', 90, ride(999, 2499), 'Flatbed or tow|Within 20 km|Drop at garage of your choice'),
      job('packing_only', 'Bike packing only', 60, ride(799, 1999), 'Foam and bubble wrap|Mirrors and handles covered|Ready for train or truck'),
    ] },
  { code: 'office_relocation', prefix: 'offmove', name: 'Office & shop relocation', domainCode: 'moving', icon: 'PackageCheck', typeWord: 'Office size', thing: 'office', types: OFFICE,
    packages: [
      job('survey', 'Survey visit and move plan', 60, office(299, 299, 499), 'Items and IT listed|Move plan|Fixed quote'),
      job('local', 'Office move within the city', 480, office(14999, 34999, 69999), 'Desks, chairs and files|IT packed safely|Weekend move possible'),
      job('it_only', 'Computers and IT equipment move', 240, office(4999, 11999, 24999), 'Anti-static packing|Labelled cables|Set up at the new office'),
      job('workstations', 'Workstation dismantle and reassembly', 360, office(5999, 14999, 29999), 'Desks taken apart|Moved|Reassembled'),
      job('shop', 'Shop stock and fixtures move', 360, office(7999, 14999, 24999), 'Shelves and stock|Counted and packed|Placed at new shop'),
      job('records', 'Files and records boxing', 240, office(2499, 4999, 9999), 'Boxed and labelled|Order kept|Index list'),
    ] },
  { code: 'single_item_move', prefix: 'oneitem', name: 'Move a few items', domainCode: 'moving', icon: 'Package', thing: 'item', types: ONE, isPopular: true,
    packages: [
      job('fridge', 'Fridge move within the city', 120, 999, 'Two helpers|Tempo|Placed and levelled'),
      job('washer', 'Washing machine move within the city', 120, 899, 'Two helpers|Drum locked|Tempo'),
      job('sofa', 'Sofa move within the city', 120, 999, 'Two helpers|Wrapped|Tempo'),
      job('bed', 'Bed or wardrobe move within the city', 180, 1499, 'Dismantle and reassemble|Two helpers|Tempo'),
      job('boxes', 'Up to 10 boxes within the city', 120, 799, 'Tempo|One helper|Door to door'),
      job('piano', 'Piano or heavy safe move', 180, 3999, 'Four helpers|Padded straps|Ground floor or lift'),
    ] },
  { code: 'loading_helpers', prefix: 'loadhelp', name: 'Loading, unloading & moving helpers', domainCode: 'moving', icon: 'Users', thing: 'helper', types: ONE,
    packages: [
      job('two_2h', '2 helpers for 2 hours', 120, 899, 'Loading or unloading|Carry by stairs|Basic tools'),
      job('two_4h', '2 helpers for 4 hours', 240, 1599, 'Loading, unloading and arranging|Carry by stairs|Basic tools'),
      job('four_4h', '4 helpers for 4 hours', 240, 2999, 'Big moves|Heavy items|Basic tools'),
      job('rearrange', 'Rearrange furniture at home', 120, 799, 'Two helpers|Move and place|Floor protected'),
      job('scrap_out', 'Old furniture and scrap removal', 120, 999, 'Carried out|Taken away|Area swept'),
      job('per_floor', 'Extra floor by stairs, per floor', 30, 199, 'Added to any move|No lift|Per floor above ground'),
    ] },
  { code: 'storage', prefix: 'storage', name: 'Household storage', domainCode: 'moving', icon: 'Package', thing: 'storage', types: ONE,
    packages: [
      job('boxes_month', 'Store up to 10 boxes, per month', 60, 999, 'Pickup included|Dry, secure warehouse|Item list'),
      job('room_month', 'Store one room of items, per month', 120, 2999, 'Pickup and packing|Secure warehouse|Item list with photos'),
      job('home_month', 'Store a full home, per month', 240, 6999, 'Packing and pickup|Secure warehouse|Insurance option'),
      job('bike_month', 'Bike storage, per month', 60, 799, 'Covered parking|Battery care|Pickup and drop'),
      job('retrieve', 'Bring stored items back', 120, 999, 'Delivered to your door|Unloaded|Item list checked'),
      job('pack_store', 'Packing for storage only', 180, 1999, 'Boxes and wrap|Labelled|Ready for pickup'),
    ] },
  { code: 'tempo_hire', prefix: 'tempo', name: 'Tempo & truck hire by trip', domainCode: 'moving', icon: 'Truck', typeWord: 'Vehicle', thing: 'trip', types: TRUCKS,
    packages: [
      job('trip_10', 'One trip up to 10 km', 90, truck(599, 899, 1999), 'Driver and vehicle|One drop|Loading not included'),
      job('trip_25', 'One trip up to 25 km', 150, truck(999, 1399, 2999), 'Driver and vehicle|One drop|Loading not included'),
      job('hourly_4', '4 hours, up to 40 km', 240, truck(1799, 2499, 4499), 'Multiple drops|Driver and vehicle|Loading not included'),
      job('with_helper', 'Trip up to 10 km with one helper', 120, truck(899, 1199, 2499), 'Driver and helper|Loading and unloading|One drop'),
    ] },
];

module.exports = { extend, lines };
