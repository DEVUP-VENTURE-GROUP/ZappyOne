// Repairs & Maintenance beside the built-in electrician, plumber and AC services: more carpentry, RO and lock jobs and five new services; prices are starting suggestions, each partner sets their own.
const { ONE, job } = require('./helpers');

const extend = {
  carpentry: [
    job('bed_repair', 'Bed repair (creak, slats, joints)', 60, 499, 'Joints tightened|Slats fixed|Noise checked'),
    job('drawer', 'Drawer channel or handle replacement', 45, 299, 'Channel or handle fitted (part extra)|Smooth slide|Aligned'),
    job('wardrobe_door', 'Wardrobe door alignment and hinge fix', 45, 299, 'Hinges adjusted or replaced|Doors aligned|Locks checked'),
    job('tv_unit', 'TV unit or study table assembly', 90, 599, 'Flat-pack assembly|Wall fixing if needed|Packing cleared'),
    job('door_lock_fit', 'Door closer or tower bolt fitting', 30, 249, 'Drilling and fixing|Tested|Dust cleaned'),
  ],
  ro_service: [
    job('repair_visit', 'RO repair visit', 45, 299, 'Problem found|Small fixes done|Parts quoted'),
    job('amc', 'RO yearly plan with filters', 45, 2999, 'Two services a year|Filter change included|Free repair visits'),
    job('tds_check', 'Water TDS test and RO advice', 20, 99, 'TDS measured|Right purifier advised|No obligation'),
  ],
  locks_mounting: [
    job('digital_lock', 'Digital door lock installation', 90, 999, 'Door drilled to fit|Lock set up|Fingerprints and codes added'),
    job('frames', 'Photo frames or wall art, up to 5', 45, 349, 'Level marking|Drilling and hooks|Dust cleaned'),
    job('shelf', 'Wall shelf fixing, up to 3', 45, 349, 'Brackets fixed|Level|Load checked'),
    job('safety_grill', 'Window safety bars or child lock fitting', 60, 499, 'Drilling and fitting|Tested|Dust cleaned'),
  ],
};

const lines = [
  { code: 'inverter_battery', prefix: 'inverter', name: 'Inverter, UPS & battery', domainCode: 'home_services', icon: 'BatteryCharging', thing: 'inverter', types: ONE, isPopular: true,
    packages: [
      job('install', 'Inverter and battery installation', 90, 699, 'Wiring to main board|Battery placed and filled|Load tested'),
      job('service', 'Inverter service and battery check', 45, 399, 'Battery water topped|Terminals cleaned|Backup tested'),
      job('repair', 'Inverter or UPS repair visit', 45, 349, 'Fault found|Small fixes done|Parts quoted'),
      job('battery_replace', 'Battery replacement and old battery buyback', 60, 499, 'New battery fitted (battery extra)|Old battery valued|Tested'),
      job('wiring', 'Inverter wiring for more rooms', 120, 999, 'Extra points wired|Load checked|Labelled'),
      job('relocate', 'Shift inverter to a new place', 60, 499, 'Disconnected safely|Moved and rewired|Tested'),
    ] },
  { code: 'motor_pump', prefix: 'pump', name: 'Water pump & motor repair', domainCode: 'home_services', icon: 'Droplet', thing: 'pump', types: ONE,
    packages: [
      job('install', 'Water pump installation', 90, 799, 'Pump fitted and wired|Pipes connected|Pressure tested'),
      job('repair', 'Pump or motor repair visit', 45, 349, 'Fault found|Small fixes done|Parts quoted'),
      job('rewinding', 'Motor rewinding (pickup and drop)', 60, 1499, 'Picked up|Coil rewound|Refitted and tested'),
      job('auto_switch', 'Automatic water level controller fitting', 60, 899, 'Sensor in tank|Controller wired|Tested'),
      job('pressure', 'Pressure pump installation for bathrooms', 120, 1499, 'Pump fitted|Plumbing connected|Pressure set'),
      job('borewell_check', 'Borewell motor check', 60, 599, 'Motor and starter checked|Water flow tested|Advice'),
    ] },
  { code: 'gas_stove_repair', prefix: 'gasstove', name: 'Gas stove, hob & cylinder help', domainCode: 'home_services', icon: 'Zap', thing: 'stove', types: ONE,
    packages: [
      job('service', 'Gas stove service', 45, 299, 'Burners cleaned|Flame set to blue|Leak test'),
      job('repair', 'Gas stove repair visit', 45, 249, 'Fault found|Small fixes done|Parts quoted'),
      job('hob_repair', 'Built-in hob repair visit', 60, 449, 'Ignition and burners checked|Small fixes done|Parts quoted'),
      job('pipe', 'Gas pipe and regulator replacement', 30, 299, 'ISI pipe fitted (part extra)|Regulator checked|Leak test'),
      job('png_check', 'Piped gas leak check', 30, 249, 'Joints checked|Leak test|Safety advice'),
      job('auto_ignition', 'Auto-ignition fix', 30, 249, 'Igniter checked|Battery or spark fixed|Tested'),
    ] },
  { code: 'handyman', prefix: 'handy', name: 'Handyman for small jobs', domainCode: 'home_services', icon: 'Hammer', thing: 'visit', types: ONE, isPopular: true,
    packages: [
      job('hour_1', 'Handyman, 1 hour of small jobs', 60, 349, 'Any small fixes|Drill and basic tools|List of jobs you choose'),
      job('hour_2', 'Handyman, 2 hours of small jobs', 120, 599, 'Any small fixes|Drill and basic tools|List of jobs you choose'),
      job('bulbs', 'Change bulbs, tubes and switches, up to 10', 45, 299, 'Ladder brought|Parts extra|Tested'),
      job('tap_shower', 'Tap, shower or flush small fix', 30, 199, 'Washer or cartridge (part extra)|Leak stopped|Tested'),
      job('furniture_assembly', 'Furniture assembly, one item', 60, 399, 'Flat-pack assembly|Wall fixing if needed|Packing cleared'),
      job('new_home', 'New home set-up visit, 4 hours', 240, 1199, 'Curtain rods, hooks and frames|Small electrical and plumbing|Drill and tools'),
    ] },
  { code: 'welding', prefix: 'weld', name: 'Welding & grill fabrication', domainCode: 'home_services', icon: 'Wrench', thing: 'job', types: ONE,
    packages: [
      job('visit', 'Welding visit and quote', 30, 249, 'Measurements|Design options|Fixed quote'),
      job('repair', 'Gate or grill welding repair', 60, 699, 'Broken joints welded|Ground smooth|Primer coat'),
      job('hinge', 'Gate hinge or lock welding', 45, 499, 'Hinge or lock welded|Aligned|Tested'),
      job('grill_new', 'New window grill, per sq ft', 60, 349, 'MS grill to your design|Primer and paint|Fitted'),
      job('shed', 'Terrace shed or canopy, quote and fabrication', 60, 499, 'Site visit|Design and material quote|Fabrication on approval'),
      job('paint', 'Gate and grill painting', 120, 999, 'Rust scraped|Primer and enamel|Two coats'),
    ] },
];

module.exports = { extend, lines };
