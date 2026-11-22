// Vehicle Care beside the built-in washes and bike, auto and car repair: more detailing, roadside and pickup jobs and five new services; prices are starting suggestions, each partner sets their own.
const { ONE, job } = require('./helpers');

const CARS = [{ code: 'hatch', name: 'Hatchback' }, { code: 'sedan', name: 'Sedan' }, { code: 'suv', name: 'SUV or MUV' }];
const car = (h, s, u) => ({ hatch: h, sedan: s, suv: u });
const RIDES = [{ code: 'bike', name: 'Bike or scooter' }, { code: 'car', name: 'Car' }];
const ride = (b, c) => ({ bike: b, car: c });

const extend = {
  car_detailing: [
    job('ac_vent', 'AC vent and duct sanitising', 45, car(699, 799, 899), 'Vents foamed|Odour removed|Cabin freshener'),
    job('headlight', 'Headlight restoration, pair', 45, car(799, 799, 999), 'Yellowing removed|Polished|UV coat'),
    job('engine_bay', 'Engine bay cleaning and dressing', 45, car(599, 699, 799), 'Dry foam clean|Electricals covered|Plastic dressing'),
    job('glass_coat', 'Glass coating for windscreen', 30, car(699, 799, 899), 'Rain-repellent coat|Clearer view|Lasts 3 months'),
  ],
  roadside_help: [
    job('fuel', 'Fuel delivery, up to 5 litres (fuel extra)', 45, ride(199, 299), 'Fuel brought to you|Filled|Bill shared'),
    job('lockout', 'Keys locked inside, door opening', 45, ride(399, 699), 'No-damage tools|ID checked|Quick help'),
    job('battery_new', 'New battery delivered and fitted (battery extra)', 45, ride(299, 399), 'Right battery brought|Fitted and tested|Old battery buyback'),
  ],
  vehicle_pickup: [
    job('puc', 'Pollution certificate pickup and drop', 90, ride(299, 399), 'Vehicle picked up|PUC done (fee extra)|Dropped back'),
    job('wash_pick', 'Pickup for a garage wash and drop', 120, ride(249, 399), 'Picked up|Washed at partner garage (wash extra)|Dropped back'),
  ],
};

const lines = [
  { code: 'driver_hire', prefix: 'driver', name: 'Hire a driver', domainCode: 'vehicles', icon: 'Car', thing: 'trip', types: ONE, isPopular: true,
    packages: [
      job('hours_2', 'Driver for 2 hours in the city, your car', 120, 399, 'Verified driver|Your car|Extra hours charged'),
      job('hours_4', 'Driver for 4 hours in the city, your car', 240, 699, 'Verified driver|Your car|Extra hours charged'),
      job('hours_8', 'Driver for 8 hours in the city, your car', 480, 1199, 'Verified driver|Your car|Lunch break'),
      job('one_way', 'One-way drop in the city, your car', 90, 349, 'Driver returns on his own|Your car|Up to 25 km'),
      job('airport', 'Airport drop or pickup, your car', 120, 599, 'Verified driver|Your car|Waiting up to 30 minutes'),
      job('outstation', 'Outstation driver, per day', 720, 1999, 'Verified driver|Your car|Food and stay by you'),
    ] },
  { code: 'car_accessories', prefix: 'caracc', name: 'Car accessories fitting', domainCode: 'vehicles', icon: 'Wrench', typeWord: 'Car type', thing: 'car', types: CARS,
    packages: [
      job('seat_covers', 'Seat covers fitting (covers extra)', 60, car(499, 599, 799), 'All seats|Snug fit|Airbag-safe'),
      job('dashcam', 'Dashcam installation', 45, car(699, 699, 799), 'Hidden wiring|Parking mode set|Tested'),
      job('music', 'Music system or speaker installation', 90, car(999, 999, 1199), 'Wiring done|Tested|Old unit returned'),
      job('mats', '7D floor mats fitting (mats extra)', 30, car(299, 349, 399), 'Measured to fit|Fitted|Old mats removed'),
      job('reverse_camera', 'Reverse camera and sensors', 90, car(1499, 1499, 1699), 'Camera and sensors fitted|Display wired|Tested'),
      job('sun_film', 'Sun film for windows (legal shade)', 60, car(1999, 2299, 2799), 'Legal light shade|Bubble-free|Clean edges'),
    ] },
  { code: 'tyre_service', prefix: 'tyre', name: 'Doorstep tyre service', domainCode: 'vehicles', icon: 'Wrench', typeWord: 'Vehicle', thing: 'vehicle', types: RIDES,
    packages: [
      job('puncture', 'Tubeless puncture repair at home', 30, ride(199, 299), 'Plug repair|Air filled|Leak test'),
      job('air', 'Air check and fill, all tyres', 20, ride(99, 149), 'Pressure set|Spare checked|Valves checked'),
      job('change', 'New tyre fitting (tyre extra)', 45, ride(199, 399), 'Old tyre removed|New tyre fitted|Pressure set'),
      job('rotation', 'Tyre rotation', 45, ride(149, 399), 'Front and back swapped|Nuts torqued|Pressure set'),
      job('nitrogen', 'Nitrogen filling, all tyres', 20, ride(149, 299), 'Nitrogen from a portable unit|Pressure set|Valves checked'),
      job('spare_check', 'Spare wheel and jack check', 20, ride(99, 149), 'Spare inflated|Jack and tools checked|Ready for emergencies'),
    ] },
  { code: 'vehicle_paperwork', prefix: 'vehdoc', name: 'Vehicle papers & insurance help', domainCode: 'vehicles', icon: 'FileText', typeWord: 'Vehicle', thing: 'vehicle', types: RIDES,
    packages: [
      job('insurance', 'Insurance renewal help', 30, ride(99, 149), 'Quotes compared|Policy bought online|Copy shared'),
      job('rc_transfer', 'RC ownership transfer help', 120, ride(1499, 2499), 'Forms filled|RTO visit guided|Fees extra'),
      job('noc', 'NOC for another state help', 120, ride(1499, 2499), 'Forms filled|RTO process guided|Fees extra'),
      job('challan', 'Traffic challan check and payment help', 20, ride(99, 99), 'Pending challans checked|Paid online|Receipt shared'),
      job('fastag', 'FASTag purchase and fitting', 20, ride(99, 199), 'FASTag issued|Stuck on windscreen|Linked'),
      job('claim', 'Insurance claim help after an accident', 60, ride(499, 999), 'Photos and forms|Garage and surveyor coordination|Updates till closed'),
    ] },
  { code: 'bike_detailing', prefix: 'bikedet', name: 'Bike detailing & coating', domainCode: 'vehicles', icon: 'Bike', thing: 'bike', types: ONE,
    packages: [
      job('foam', 'Foam wash and polish', 45, 299, 'Foam wash|Polish|Tyre shine'),
      job('teflon', 'Teflon coating', 90, 999, 'Wash and clay|Teflon coat|Shine lasts weeks'),
      job('ceramic', 'Ceramic coating', 180, 3999, 'Paint prep|Ceramic layer|Long-lasting gloss'),
      job('chain', 'Chain clean and lube', 20, 149, 'Degreased|Lubricated|Tension checked'),
      job('rust', 'Rust removal and anti-rust coat', 60, 499, 'Rust treated|Anti-rust coat|Polish'),
      job('seat', 'Seat cover change (cover extra)', 20, 199, 'Old cover removed|New fitted|Stapled neatly'),
    ] },
];

module.exports = { extend, lines };
