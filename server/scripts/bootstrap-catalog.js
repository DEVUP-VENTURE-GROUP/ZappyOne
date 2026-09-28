/**
 * Service Catalog Bootstrap
 * Idempotent — upserts on `code`, safe to re-run anytime.
 *
 * ARCHITECTURE PHILOSOPHY: "Trusted Assistance Operating System"
 *   Not a marketplace. Every service builds device/pet/family data.
 *   Passport systems create defensible moats.
 *
 *   node scripts/bootstrap-catalog.js
 */
require('dotenv').config();
const { connectMongo } = require('../src/config/mongo');
const ServiceCatalog = require('../src/modules/service/service-catalog.model');

/* DISABLED (architecture preserved — set isActive: false) */
const DISABLED_SERVICES = [
  { code: 'plumbing',    isActive: false },
  { code: 'electrical',  isActive: false },
  { code: 'ac_repair',   isActive: false },
  { code: 'carpenter',   isActive: false },
  { code: 'cleaning',    isActive: false },
  { code: 'painting',    isActive: false },
  { code: 'helper',      isActive: false },
  { code: 'mason',       isActive: false },
];

/* ACTIVE SERVICES */
const SERVICES = [

  /*
     ELECTRONICS RESCUE NETWORK
 */

  // Mobile Phones
  {
    code: 'screen_replacement', name: 'Screen Replacement', category: 'mobile',
    description: 'Cracked or broken display replacement — Android & iPhone.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 150000, priceRangeMaxPaise: 600000,
    requiredSkills: ['screen_replacement'],
    requiredTools: ['Opening kit', 'Heat gun', 'Suction cup', 'ESD mat', 'Adhesive'],
    checklist: [
      { item: 'Verify screen quality with customer before fitting', required: true },
      { item: 'Test touch, display, front camera after fitting', required: true },
      { item: 'Check proximity & ambient light sensors', required: true },
      { item: 'Apply tempered glass before handover', required: false },
    ],
    guidelines: ['Never quote OEM price — deliver OEM quality'],
    sortOrder: 101,
  },
  {
    code: 'battery_replacement', name: 'Battery Replacement', category: 'mobile',
    description: 'Swollen, fast-draining or dead battery replacement.',
    estimatedDurationMinutes: 30, priceRangeMinPaise: 80000, priceRangeMaxPaise: 250000,
    requiredSkills: ['battery_replacement'],
    requiredTools: ['Opening tools', 'Adhesive remover', 'BIS-certified battery'],
    checklist: [
      { item: 'Show battery health reading before replacement', required: true },
      { item: 'Use BIS-certified replacement battery', required: true },
      { item: 'Run battery calibration after fitting', required: true },
    ],
    guidelines: ['Never use uncertified batteries'],
    sortOrder: 102,
  },
  {
    code: 'charging_issue', name: 'Charging Issue Fix', category: 'mobile',
    description: 'Loose port, slow charging, or not charging at all.',
    estimatedDurationMinutes: 30, priceRangeMinPaise: 30000, priceRangeMaxPaise: 100000,
    requiredSkills: ['charging_issue'],
    requiredTools: ['Screwdriver set', 'Port cleaning kit', 'Multimeter'],
    checklist: [
      { item: 'Clean port with compressed air before replacing', required: true },
      { item: 'Test with original + third-party charger', required: true },
      { item: 'Confirm 100% charge cycle before handover', required: true },
    ],
    guidelines: ['Port cleaning is first resort — replacement is last'],
    sortOrder: 103,
  },
  {
    code: 'speaker_mic_issue', name: 'Speaker / Mic Repair', category: 'mobile',
    description: 'No sound, muffled audio, or microphone not working.',
    estimatedDurationMinutes: 30, priceRangeMinPaise: 50000, priceRangeMaxPaise: 150000,
    requiredSkills: ['speaker_mic_issue'], requiredTools: ['Screwdriver set', 'Replacement speaker'],
    checklist: [
      { item: 'Test earpiece and loudspeaker separately', required: true },
      { item: 'Test microphone via voice recorder', required: true },
      { item: 'Play audio test post-replacement', required: true },
    ],
    guidelines: ['Clean speaker mesh first — replace module only if needed'],
    sortOrder: 104,
  },
  {
    code: 'microphone_issue', name: 'Microphone Repair', category: 'mobile',
    description: 'Mic not working, muffled voice during calls.',
    estimatedDurationMinutes: 30, priceRangeMinPaise: 40000, priceRangeMaxPaise: 120000,
    requiredSkills: ['speaker_mic_issue'], requiredTools: ['Screwdriver set', 'Replacement mic'],
    checklist: [
      { item: 'Record test audio before and after', required: true },
      { item: 'Test on WhatsApp call post-repair', required: true },
    ],
    guidelines: [],
    sortOrder: 105,
  },
  {
    code: 'software_issue', name: 'Software Fix', category: 'mobile',
    description: 'Slow phone, app crashes, virus removal, factory reset.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 30000, priceRangeMaxPaise: 80000,
    requiredSkills: ['software_issue'], requiredTools: ['Laptop for flashing', 'USB cable'],
    checklist: [
      { item: 'Get customer consent before factory reset', required: true },
      { item: 'Back up data if possible', required: false },
      { item: 'Show phone working normally post-fix', required: true },
    ],
    guidelines: ['Never access personal apps without explicit request'],
    sortOrder: 106,
  },
  {
    code: 'water_damage', name: 'Water Damage Repair', category: 'mobile',
    description: 'Diagnosis and repair for water or rain damaged phones.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 50000, priceRangeMaxPaise: 300000,
    requiredSkills: ['water_damage_check'], requiredTools: ['IPA solution', 'Ultrasonic cleaner', 'Blow dryer'],
    checklist: [
      { item: 'Check LDI (liquid damage indicator)', required: true },
      { item: 'Clean board with IPA and brush', required: true },
      { item: 'Test all functions post-cleaning', required: true },
    ],
    guidelines: ['Do not power on a wet phone — explain this to customer'],
    sortOrder: 107,
  },
  {
    code: 'camera_issue', name: 'Camera Repair', category: 'mobile',
    description: 'Blurry, black screen, or camera not working.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 60000, priceRangeMaxPaise: 250000,
    requiredSkills: ['screen_replacement'], requiredTools: ['Opening kit', 'Camera module'],
    checklist: [
      { item: 'Test front and rear cameras', required: true },
      { item: 'Check OIS (stabilisation) function', required: false },
      { item: 'Show sample photos to customer', required: true },
    ],
    guidelines: [],
    sortOrder: 108,
  },
  {
    code: 'data_recovery', name: 'Data Recovery', category: 'mobile',
    description: 'Recover photos, contacts, documents from damaged phone.',
    estimatedDurationMinutes: 120, priceRangeMinPaise: 100000, priceRangeMaxPaise: 500000,
    requiredSkills: ['software_issue'], requiredTools: ['Recovery software', 'Laptop', 'USB cable'],
    checklist: [
      { item: 'Get explicit written consent for data access', required: true },
      { item: 'Show customer recovered data before charging', required: true },
    ],
    guidelines: ['Full privacy — tech only accesses files customer specifies'],
    sortOrder: 109,
  },
  {
    code: 'device_not_turning_on', name: 'Device Not Turning On', category: 'mobile',
    description: 'Phone dead — diagnosis and repair.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 50000, priceRangeMaxPaise: 300000,
    requiredSkills: ['battery_replacement'], requiredTools: ['Multimeter', 'Opening kit', 'Power supply tester'],
    checklist: [
      { item: 'Check for power supply with multimeter', required: true },
      { item: 'Check battery voltage', required: true },
      { item: 'Inform customer if board repair needed', required: true },
    ],
    guidelines: ['Diagnosis is quoted before deep repair begins'],
    sortOrder: 110,
  },

  // Laptops
  {
    code: 'laptop_slow', name: 'Slow Laptop Fix', category: 'mobile',
    description: 'Speed up a slow laptop — cleanup, optimization, upgrade advice.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 25000, priceRangeMaxPaise: 60000,
    requiredSkills: ['software_issue'], requiredTools: ['Laptop', 'Compressed air', 'Cleaning kit'],
    checklist: [
      { item: 'Run diagnostic and check startup programs', required: true },
      { item: 'Clean thermal paste and fans', required: false },
      { item: 'Benchmark before and after', required: true },
    ],
    guidelines: [],
    sortOrder: 201,
  },
  {
    code: 'laptop_ssd_upgrade', name: 'SSD Upgrade', category: 'mobile',
    description: 'Replace HDD with SSD for 10× speed boost.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 50000, priceRangeMaxPaise: 150000,
    requiredSkills: ['screen_replacement'], requiredTools: ['Screwdriver set', 'SSD', 'Cloning software'],
    checklist: [
      { item: 'Clone existing drive before removal', required: true },
      { item: 'Verify boot from new SSD', required: true },
    ],
    guidelines: ['Parts cost quoted separately — admin-configurable'],
    sortOrder: 202,
  },
  {
    code: 'laptop_ram_upgrade', name: 'RAM Upgrade', category: 'mobile',
    description: 'Increase RAM for better multitasking.',
    estimatedDurationMinutes: 30, priceRangeMinPaise: 30000, priceRangeMaxPaise: 80000,
    requiredSkills: ['battery_replacement'], requiredTools: ['Screwdriver set', 'RAM module'],
    checklist: [
      { item: 'Confirm compatible RAM spec with customer', required: true },
      { item: 'Test system POST after installation', required: true },
    ],
    guidelines: [],
    sortOrder: 203,
  },
  {
    code: 'laptop_keyboard_issue', name: 'Laptop Keyboard Repair', category: 'mobile',
    description: 'Stuck keys, spill damage, or keyboard replacement.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 40000, priceRangeMaxPaise: 120000,
    requiredSkills: ['screen_replacement'], requiredTools: ['Screwdriver set', 'Replacement keyboard'],
    checklist: [
      { item: 'Test all keys post-replacement', required: true },
      { item: 'Check touchpad function', required: true },
    ],
    guidelines: [],
    sortOrder: 204,
  },
  {
    code: 'laptop_motherboard_issue', name: 'Motherboard Repair', category: 'mobile',
    description: 'No power, display issues, liquid damage — board-level repair.',
    estimatedDurationMinutes: 120, priceRangeMinPaise: 150000, priceRangeMaxPaise: 600000,
    requiredSkills: ['software_issue'], requiredTools: ['Soldering station', 'BGA station', 'Multimeter'],
    checklist: [
      { item: 'Quote diagnosis fee upfront', required: true },
      { item: 'Show customer repaired board working', required: true },
    ],
    guidelines: ['Diagnosis quoted before board repair — no surprise billing'],
    sortOrder: 205,
  },
  {
    code: 'laptop_charging_issue', name: 'Laptop Charging Issue', category: 'mobile',
    description: 'Not charging, loose adapter port, battery drain.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 30000, priceRangeMaxPaise: 100000,
    requiredSkills: ['charging_issue'], requiredTools: ['Screwdriver set', 'Multimeter', 'Charging port'],
    checklist: [
      { item: 'Test with customer charger and new charger', required: true },
      { item: 'Confirm charging at 100% before handover', required: true },
    ],
    guidelines: [],
    sortOrder: 206,
  },
  {
    code: 'laptop_screen_issue', name: 'Laptop Screen Repair', category: 'mobile',
    description: 'Cracked screen, dim display, flickering, no display.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 80000, priceRangeMaxPaise: 300000,
    requiredSkills: ['screen_replacement'], requiredTools: ['Opening tools', 'Replacement screen'],
    checklist: [
      { item: 'Test display brightness and colours post-fit', required: true },
      { item: 'Check webcam if removed during repair', required: true },
    ],
    guidelines: [],
    sortOrder: 207,
  },
  {
    code: 'laptop_virus_removal', name: 'Virus & Malware Removal', category: 'mobile',
    description: 'Remove viruses, ransomware, spyware — secure the device.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 35000, priceRangeMaxPaise: 80000,
    requiredSkills: ['software_issue'], requiredTools: ['Bootable USB', 'AV tools'],
    checklist: [
      { item: 'Run full scan and show results to customer', required: true },
      { item: 'Enable automatic updates post-removal', required: true },
    ],
    guidelines: ['Never access personal files without explicit consent'],
    sortOrder: 208,
  },
  {
    code: 'laptop_data_recovery', name: 'Laptop Data Recovery', category: 'mobile',
    description: 'Recover lost files from failed HDD/SSD.',
    estimatedDurationMinutes: 120, priceRangeMinPaise: 100000, priceRangeMaxPaise: 500000,
    requiredSkills: ['software_issue'], requiredTools: ['Recovery software', 'External drive'],
    checklist: [
      { item: 'Get written consent for data access', required: true },
      { item: 'Show recovered data before charging', required: true },
    ],
    guidelines: ['Recovery success not guaranteed — quote is for attempt'],
    sortOrder: 209,
  },

  // Smart Devices
  {
    code: 'smart_tv_install', name: 'Smart TV Installation', category: 'other',
    description: 'Wall mount + setup for Smart TV — Android, WebOS, Tizen.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 60000, priceRangeMaxPaise: 150000,
    requiredSkills: ['smart_lock_install'], requiredTools: ['Wall mount kit', 'Drill', 'Level'],
    checklist: [
      { item: 'Check wall type before drilling', required: true },
      { item: 'Connect all cables and test streaming', required: true },
    ],
    guidelines: [],
    sortOrder: 301,
  },
  {
    code: 'smart_tv_repair', name: 'Smart TV Repair', category: 'other',
    description: 'No picture, no sound, software issues, display damage.',
    estimatedDurationMinutes: 90, priceRangeMinPaise: 80000, priceRangeMaxPaise: 400000,
    requiredSkills: ['smart_lock_install'], requiredTools: ['Screwdriver set', 'Multimeter'],
    checklist: [
      { item: 'Diagnose before quoting parts', required: true },
      { item: 'Test all HDMI ports and audio output', required: true },
    ],
    guidelines: ['Board-level repairs quoted separately'],
    sortOrder: 302,
  },
  {
    code: 'router_setup', name: 'Router & WiFi Setup', category: 'other',
    description: 'New router setup, extender placement, mesh network config.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 30000, priceRangeMaxPaise: 80000,
    requiredSkills: ['smart_lock_install'], requiredTools: ['Laptop', 'Ethernet cable'],
    checklist: [
      { item: 'Change default admin password', required: true },
      { item: 'Test speed on all rooms', required: false },
    ],
    guidelines: [],
    sortOrder: 303,
  },
  {
    code: 'router_troubleshoot', name: 'WiFi Troubleshooting', category: 'other',
    description: 'Slow WiFi, dropping connection, dead zones.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 25000, priceRangeMaxPaise: 60000,
    requiredSkills: ['smart_lock_install'], requiredTools: ['Laptop', 'Speed test app'],
    checklist: [
      { item: 'Run speed test before and after', required: true },
    ],
    guidelines: [],
    sortOrder: 304,
  },
  {
    code: 'cctv_install', name: 'CCTV Installation', category: 'other',
    description: 'Install and configure CCTV cameras with DVR/NVR.',
    estimatedDurationMinutes: 120, priceRangeMinPaise: 100000, priceRangeMaxPaise: 500000,
    requiredSkills: ['smart_lock_install'], requiredTools: ['Drill', 'Camera mounts', 'DVR'],
    checklist: [
      { item: 'Show customer live feed before leaving', required: true },
      { item: 'Set up mobile app remote viewing', required: true },
    ],
    guidelines: ['Price is per camera — admin configurable'],
    sortOrder: 305,
  },
  {
    code: 'cctv_repair', name: 'CCTV Repair', category: 'other',
    description: 'Camera offline, blurry footage, DVR/NVR issues.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 50000, priceRangeMaxPaise: 200000,
    requiredSkills: ['smart_lock_install'], requiredTools: ['Screwdriver set', 'Tester'],
    checklist: [
      { item: 'Test all cameras post-repair', required: true },
    ],
    guidelines: [],
    sortOrder: 306,
  },
  {
    code: 'smart_lock_install', name: 'Smart Lock Installation', category: 'other',
    description: 'Install fingerprint, PIN, or app-controlled smart locks.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 80000, priceRangeMaxPaise: 200000,
    requiredSkills: ['smart_lock_install'], requiredTools: ['Drill', 'Screwdriver', 'Smart lock kit'],
    checklist: [
      { item: 'Register all family fingerprints', required: true },
      { item: 'Test all unlock methods', required: true },
      { item: 'Set up app access and share with customer', required: true },
    ],
    guidelines: [],
    sortOrder: 307,
  },
  {
    code: 'home_automation_setup', name: 'Home Automation Setup', category: 'other',
    description: 'Alexa / Google Home / Tuya smart home device configuration.',
    estimatedDurationMinutes: 90, priceRangeMinPaise: 100000, priceRangeMaxPaise: 300000,
    requiredSkills: ['smart_lock_install'], requiredTools: ['Laptop', 'Smart hub'],
    checklist: [
      { item: 'Connect all devices to hub/app', required: true },
      { item: 'Create automation routines for customer', required: false },
      { item: 'Train customer on app usage', required: true },
    ],
    guidelines: [],
    sortOrder: 308,
  },

  /*
     VEHICLE CARE NETWORK
 */

  // Bike
  {
    code: 'puncture', name: 'Puncture Repair', category: 'vehicle',
    description: 'Tyre puncture fix — bike, scooter, or car.',
    estimatedDurationMinutes: 20, priceRangeMinPaise: 10000, priceRangeMaxPaise: 30000,
    requiredSkills: ['puncture'], requiredTools: ['Patch kit', 'Air pump', 'Tyre lever'],
    checklist: [
      { item: 'Locate puncture with soap water', required: true },
      { item: 'Inflate to correct PSI', required: true },
      { item: 'Check other tyres before leaving', required: true },
    ],
    guidelines: ['Never quote extra without customer approval'],
    sortOrder: 401,
  },
  {
    code: 'bike_chain_issue', name: 'Bike Chain / Gear Issue', category: 'vehicle',
    description: 'Chain slipping, breaking, or gear shifting problems.',
    estimatedDurationMinutes: 30, priceRangeMinPaise: 15000, priceRangeMaxPaise: 60000,
    requiredSkills: ['puncture'], requiredTools: ['Chain tool', 'Lubricant', 'Gear cable'],
    checklist: [
      { item: 'Test all gears after repair', required: true },
      { item: 'Lubricate chain before leaving', required: true },
    ],
    guidelines: [],
    sortOrder: 402,
  },
  {
    code: 'bike_brake_issue', name: 'Bike Brake Repair', category: 'vehicle',
    description: 'Brake pads worn, brake cable loose, disc brake issues.',
    estimatedDurationMinutes: 30, priceRangeMinPaise: 15000, priceRangeMaxPaise: 50000,
    requiredSkills: ['puncture'], requiredTools: ['Brake pad set', 'Cable', 'Allen keys'],
    checklist: [
      { item: 'Test brake stopping distance before leaving', required: true },
    ],
    guidelines: [],
    sortOrder: 403,
  },
  {
    code: 'bike_battery_issue', name: 'Bike Battery Issue', category: 'vehicle',
    description: 'Scooter/electric bike battery not charging or dead.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 30000, priceRangeMaxPaise: 150000,
    requiredSkills: ['puncture'], requiredTools: ['Multimeter', 'Battery tester'],
    checklist: [
      { item: 'Test battery voltage', required: true },
      { item: 'Check charging circuit', required: true },
    ],
    guidelines: [],
    sortOrder: 404,
  },
  {
    code: 'bike_wash', name: 'Bike / Scooter Wash', category: 'vehicle',
    description: 'Doorstep bike or scooter wash.',
    estimatedDurationMinutes: 30, priceRangeMinPaise: 20000, priceRangeMaxPaise: 50000,
    requiredSkills: ['puncture'], requiredTools: ['Pressure washer', 'Shampoo', 'Microfibre cloth'],
    checklist: [
      { item: 'Cover exhaust and electrical before wash', required: true },
      { item: 'Dry with microfibre cloth', required: true },
    ],
    guidelines: [],
    sortOrder: 405,
  },
  {
    code: 'bike_breakdown', name: 'Bike Breakdown Assistance', category: 'vehicle',
    description: 'Emergency roadside help for bike/scooter breakdowns.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 40000, priceRangeMaxPaise: 120000,
    requiredSkills: ['puncture'], requiredTools: ['Tool kit', 'Tow rope', 'Jump cables'],
    checklist: [
      { item: 'Diagnose issue before attempting repair', required: true },
      { item: 'Advise towing if beyond roadside repair', required: true },
    ],
    guidelines: ['Only do minor repairs roadside — tow for complex issues'],
    sortOrder: 406,
  },
  {
    code: 'bike_service', name: 'Bike Full Service', category: 'vehicle',
    description: 'Complete bike service — oil change, filter, brakes, chain.',
    estimatedDurationMinutes: 90, priceRangeMinPaise: 35000, priceRangeMaxPaise: 100000,
    requiredSkills: ['puncture'], requiredTools: ['Service kit', 'Oil', 'Filters'],
    checklist: [
      { item: 'Change engine oil', required: true },
      { item: 'Check and adjust brakes', required: true },
      { item: 'Lubricate all moving parts', required: true },
    ],
    guidelines: [],
    sortOrder: 407,
  },

  // Car
  {
    code: 'car_wash', name: 'Car Wash', category: 'vehicle',
    description: 'Doorstep exterior + interior car wash.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 30000, priceRangeMaxPaise: 70000,
    requiredSkills: ['puncture'], requiredTools: ['Pressure washer', 'Car shampoo', 'Vacuum', 'Microfibre'],
    checklist: [
      { item: 'Pre-rinse to remove loose dirt', required: true },
      { item: 'Vacuum interiors if included', required: false },
      { item: 'No water spots — dry with microfibre', required: true },
    ],
    guidelines: [],
    sortOrder: 411,
  },
  {
    code: 'car_detailing', name: 'Car Detailing', category: 'vehicle',
    description: 'Deep clean — clay bar, polish, wax, interior shampoo.',
    estimatedDurationMinutes: 180, priceRangeMinPaise: 100000, priceRangeMaxPaise: 500000,
    requiredSkills: ['puncture'], requiredTools: ['Polisher', 'Clay bar', 'Compounds', 'Steam cleaner'],
    checklist: [
      { item: 'Decontaminate paint with clay bar', required: true },
      { item: 'Polish and seal paintwork', required: true },
      { item: 'Shampoo seats and carpet', required: false },
    ],
    guidelines: [],
    sortOrder: 412,
  },
  {
    code: 'battery_jump_start', name: 'Car Battery Jump Start', category: 'vehicle',
    description: 'Dead battery jump start for car, bike, or scooter.',
    estimatedDurationMinutes: 20, priceRangeMinPaise: 30000, priceRangeMaxPaise: 60000,
    requiredSkills: ['puncture'], requiredTools: ['Jump cables', 'Portable jump starter', 'Multimeter'],
    checklist: [
      { item: 'Verify polarity before connecting cables', required: true },
      { item: 'Run engine 15 min to recharge', required: true },
      { item: 'Test voltage before leaving', required: true },
    ],
    guidelines: ['Wrong polarity can destroy ECU — always double-check'],
    sortOrder: 413,
  },
  {
    code: 'car_puncture', name: 'Car Tyre Puncture', category: 'vehicle',
    description: 'Car tyre puncture repair or spare tyre fitting.',
    estimatedDurationMinutes: 30, priceRangeMinPaise: 15000, priceRangeMaxPaise: 50000,
    requiredSkills: ['puncture'], requiredTools: ['Tyre patch kit', 'Jack', 'Wheel spanner', 'Air pump'],
    checklist: [
      { item: 'Inflate to correct PSI after repair', required: true },
    ],
    guidelines: [],
    sortOrder: 414,
  },
  {
    code: 'car_breakdown', name: 'Car Breakdown Assistance', category: 'vehicle',
    description: 'Emergency roadside car assistance.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 50000, priceRangeMaxPaise: 200000,
    requiredSkills: ['puncture'], requiredTools: ['Full tool kit', 'Tow rope'],
    checklist: [
      { item: 'Diagnose before repairing', required: true },
      { item: 'Advise towing for complex issues', required: true },
    ],
    guidelines: [],
    sortOrder: 415,
  },
  {
    code: 'fuel_delivery', name: 'Fuel Delivery', category: 'vehicle',
    description: 'Emergency petrol/diesel delivery to your location.',
    estimatedDurationMinutes: 20, priceRangeMinPaise: 10000, priceRangeMaxPaise: 30000,
    requiredSkills: ['puncture'], requiredTools: ['Jerry can', 'Funnel', 'Safety gloves'],
    checklist: [
      { item: 'Confirm fuel type before fetching', required: true },
      { item: 'Collect fuel cost separately at pump rate', required: true },
    ],
    guidelines: ['Fuel cost is separate from service fee — be transparent'],
    sortOrder: 416,
  },
  {
    code: 'car_service', name: 'Car Full Service', category: 'vehicle',
    description: 'Doorstep car service — oil, filter, brakes check, fluid top-up.',
    estimatedDurationMinutes: 90, priceRangeMinPaise: 50000, priceRangeMaxPaise: 200000,
    requiredSkills: ['puncture'], requiredTools: ['Service kit', 'Oil', 'Filters', 'OBD scanner'],
    checklist: [
      { item: 'Run OBD diagnostic scan', required: true },
      { item: 'Change engine oil and filter', required: true },
      { item: 'Check brake pad thickness', required: true },
    ],
    guidelines: [],
    sortOrder: 417,
  },
  {
    code: 'car_towing', name: 'Car Towing', category: 'vehicle',
    description: 'Flatbed/lift towing for cars — picked up and towed to your chosen destination.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 50000, priceRangeMaxPaise: 500000,
    requiredSkills: ['car_towing'], requiredTools: ['Tow truck', 'Straps', 'Wheel dollies'],
    checklist: [
      { item: 'Confirm destination with customer', required: true },
      { item: 'Secure vehicle to flatbed/lift', required: true },
      { item: 'Photograph vehicle condition before towing', required: true },
    ],
    guidelines: [],
    sortOrder: 418,
  },
  {
    code: 'bike_towing', name: 'Bike Towing', category: 'vehicle',
    description: 'Two-wheeler towing — your bike towed to a garage or destination.',
    estimatedDurationMinutes: 30, priceRangeMinPaise: 20000, priceRangeMaxPaise: 200000,
    requiredSkills: ['bike_towing'], requiredTools: ['Tow vehicle', 'Straps'],
    checklist: [
      { item: 'Confirm destination with customer', required: true },
      { item: 'Secure the two-wheeler', required: true },
    ],
    guidelines: [],
    sortOrder: 419,
  },

  // Commercial Vehicles
  {
    code: 'commercial_emergency', name: 'Commercial Vehicle Emergency', category: 'vehicle',
    description: 'Emergency roadside for lorry, auto, van, mini truck.',
    estimatedDurationMinutes: 90, priceRangeMinPaise: 80000, priceRangeMaxPaise: 400000,
    requiredSkills: ['puncture'], requiredTools: ['Heavy duty kit', 'Air compressor', 'Tow hooks'],
    checklist: [
      { item: 'Diagnose before starting repair', required: true },
      { item: 'Report to operator if beyond scope', required: true },
    ],
    guidelines: ['Prioritise driver safety first'],
    sortOrder: 421,
  },
  {
    code: 'commercial_scheduled_maintenance', name: 'Fleet Scheduled Maintenance', category: 'vehicle',
    description: 'Scheduled maintenance for commercial vehicle fleet.',
    estimatedDurationMinutes: 120, priceRangeMinPaise: 60000, priceRangeMaxPaise: 300000,
    requiredSkills: ['puncture'], requiredTools: ['Full service kit'],
    checklist: [
      { item: 'Complete service checklist per vehicle type', required: true },
      { item: 'Update service log in app', required: true },
    ],
    guidelines: [],
    sortOrder: 422,
  },
  {
    code: 'fleet_support', name: 'Fleet Support', category: 'vehicle',
    description: 'Ongoing support contract for business fleets.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 100000, priceRangeMaxPaise: 500000,
    requiredSkills: ['puncture'], requiredTools: ['Full kit'],
    checklist: [
      { item: 'Verify vehicle registration matches request', required: true },
    ],
    guidelines: [],
    sortOrder: 423,
  },
  {
    code: 'auto_repair', name: 'Auto Rickshaw Repair', category: 'vehicle',
    description: 'Breakdown repair for auto rickshaws.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 40000, priceRangeMaxPaise: 150000,
    requiredSkills: ['puncture'], requiredTools: ['Auto tool kit'],
    checklist: [],
    guidelines: [],
    sortOrder: 424,
  },
  {
    code: 'van_repair', name: 'Van / Mini Truck Repair', category: 'vehicle',
    description: 'Breakdown repair for vans and mini trucks.',
    estimatedDurationMinutes: 90, priceRangeMinPaise: 50000, priceRangeMaxPaise: 200000,
    requiredSkills: ['puncture'], requiredTools: ['Heavy tool kit'],
    checklist: [],
    guidelines: [],
    sortOrder: 425,
  },

  /*
     FAMILY ASSIST NETWORK
 */

  {
    code: 'medicine_pickup', name: 'Medicine Pickup', category: 'helper',
    description: 'Trusted assistant picks up medicines from pharmacy with prescription.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 5000, priceRangeMaxPaise: 20000,
    requiredSkills: ['helper'], requiredTools: [],
    checklist: [
      { item: 'Collect prescription copy before going', required: true },
      { item: 'Photograph bill and medicines before delivery', required: true },
      { item: 'Hand over with bill to customer', required: true },
    ],
    guidelines: ['Never access pharmacy account without explicit consent'],
    sortOrder: 501,
  },
  {
    code: 'hospital_companion', name: 'Hospital Companion', category: 'helper',
    description: 'Trusted companion assists at hospital — registration, waiting, escort.',
    estimatedDurationMinutes: 180, priceRangeMinPaise: 50000, priceRangeMaxPaise: 200000,
    requiredSkills: ['helper'], requiredTools: [],
    checklist: [
      { item: 'Confirm hospital and appointment details', required: true },
      { item: 'Keep family updated via app', required: true },
    ],
    guidelines: ['Companion role only — do not make medical decisions'],
    sortOrder: 502,
  },
  {
    code: 'grocery_assistance', name: 'Grocery Shopping', category: 'helper',
    description: 'Trusted assistant does grocery shopping from your list.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 3000, priceRangeMaxPaise: 15000,
    requiredSkills: ['helper'], requiredTools: [],
    checklist: [
      { item: 'Get shopping list approved before going', required: true },
      { item: 'Photograph all items + bill', required: true },
    ],
    guidelines: ['Grocery cost paid separately — collect exact amount only'],
    sortOrder: 503,
  },
  {
    code: 'bill_payment_assist', name: 'Bill Payment Assistance', category: 'helper',
    description: 'Pay electricity, water, or other bills at service centre.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 2000, priceRangeMaxPaise: 10000,
    requiredSkills: ['helper'], requiredTools: [],
    checklist: [
      { item: 'Collect bill amount + service fee before going', required: true },
      { item: 'Photograph receipt and share on app', required: true },
    ],
    guidelines: ['Collect only the exact bill amount'],
    sortOrder: 504,
  },
  {
    code: 'document_submission', name: 'Document Submission', category: 'helper',
    description: 'Submit documents to government offices, banks, or offices.',
    estimatedDurationMinutes: 90, priceRangeMinPaise: 10000, priceRangeMaxPaise: 50000,
    requiredSkills: ['helper'], requiredTools: [],
    checklist: [
      { item: 'Photograph all documents before submission', required: true },
      { item: 'Collect acknowledgement receipt', required: true },
      { item: 'Share receipt photo on app', required: true },
    ],
    guidelines: ['Never leave documents unattended'],
    sortOrder: 505,
  },
  {
    code: 'home_visit_check', name: 'Home Visit Check', category: 'helper',
    description: 'Trusted person visits home to check on elderly/child when family is away.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 30000, priceRangeMaxPaise: 80000,
    requiredSkills: ['helper'], requiredTools: [],
    checklist: [
      { item: 'Check in with family via video call on arrival', required: true },
      { item: 'Photograph home condition', required: false },
      { item: 'Report any concerns immediately', required: true },
    ],
    guidelines: ['Full background-verified workers only for home visits'],
    sortOrder: 506,
  },

  /* Elder Assist */
  {
    code: 'elder_doctor_visit', name: 'Elder Doctor Visit Assist', category: 'helper',
    description: 'Trained companion accompanies elder to doctor appointment.',
    estimatedDurationMinutes: 180, priceRangeMinPaise: 60000, priceRangeMaxPaise: 200000,
    requiredSkills: ['helper'], requiredTools: [],
    checklist: [
      { item: 'Carry all medical documents', required: true },
      { item: 'Note doctor instructions carefully', required: true },
      { item: 'Update family in real time on app', required: true },
    ],
    guidelines: ['Trained for sensitivity with elders — only verified workers'],
    sortOrder: 511,
  },
  {
    code: 'elder_companion', name: 'Elder Companionship Visit', category: 'helper',
    description: 'Friendly companion spends time with elder — conversation, activities.',
    estimatedDurationMinutes: 120, priceRangeMinPaise: 40000, priceRangeMaxPaise: 150000,
    requiredSkills: ['helper'], requiredTools: [],
    checklist: [
      { item: 'Note elder preferences before visit', required: true },
      { item: 'Share visit summary with family', required: true },
    ],
    guidelines: ['Treat elders with full dignity and patience'],
    sortOrder: 512,
  },
  {
    code: 'elder_home_visit', name: 'Elder Home Wellness Check', category: 'helper',
    description: 'Regular home visit to check on elder wellness and needs.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 35000, priceRangeMaxPaise: 100000,
    requiredSkills: ['helper'], requiredTools: [],
    checklist: [
      { item: 'Check vitals if trained (temp, BP)', required: false },
      { item: 'Ensure medicines taken on schedule', required: true },
      { item: 'Report any health changes to family', required: true },
    ],
    guidelines: ['Background verified — elder safety is top priority'],
    sortOrder: 513,
  },
  {
    code: 'elder_transport', name: 'Elder Transportation Assist', category: 'helper',
    description: 'Safe, assisted transportation for elders to hospitals, temples, family.',
    estimatedDurationMinutes: 90, priceRangeMinPaise: 45000, priceRangeMaxPaise: 150000,
    requiredSkills: ['helper'], requiredTools: [],
    checklist: [
      { item: 'Confirm destination and return time', required: true },
      { item: 'Assist with boarding and alighting', required: true },
      { item: 'Update family on arrival', required: true },
    ],
    guidelines: [],
    sortOrder: 514,
  },

  /*
     EVENT CREW MARKETPLACE
 */

  {
    code: 'event_decorator', name: 'Event Decorator', category: 'other',
    description: 'Professional decorator for birthdays, anniversaries, parties.',
    estimatedDurationMinutes: 120, priceRangeMinPaise: 100000, priceRangeMaxPaise: 500000,
    requiredSkills: ['event_crew'], requiredTools: ['Decoration kit', 'Balloons', 'Lights'],
    checklist: [
      { item: 'Confirm theme and colour scheme before event', required: true },
      { item: 'Photograph setup before guest arrival', required: true },
    ],
    guidelines: ['Setup must finish 30 min before event start'],
    sortOrder: 601,
  },
  {
    code: 'event_setup_crew', name: 'Event Setup Crew', category: 'other',
    description: 'Trained crew for furniture setup, tent erection, stage setup.',
    estimatedDurationMinutes: 180, priceRangeMinPaise: 80000, priceRangeMaxPaise: 400000,
    requiredSkills: ['event_crew'], requiredTools: ['Hand tools', 'Lifting equipment'],
    checklist: [
      { item: 'Confirm layout plan before setup', required: true },
      { item: 'Safety check all structures', required: true },
    ],
    guidelines: [],
    sortOrder: 602,
  },
  {
    code: 'event_cleaning_crew', name: 'Post-Event Cleaning', category: 'other',
    description: 'Professional cleaning crew after events.',
    estimatedDurationMinutes: 120, priceRangeMinPaise: 60000, priceRangeMaxPaise: 250000,
    requiredSkills: ['event_crew'], requiredTools: ['Mops', 'Vacuum', 'Bin bags'],
    checklist: [
      { item: 'Remove all decorations and waste', required: true },
      { item: 'Return venue to original state', required: true },
    ],
    guidelines: [],
    sortOrder: 603,
  },
  {
    code: 'event_helper', name: 'Event Helper / Usher', category: 'other',
    description: 'General event helper — guest management, serving, errands.',
    estimatedDurationMinutes: 240, priceRangeMinPaise: 50000, priceRangeMaxPaise: 150000,
    requiredSkills: ['event_crew'], requiredTools: [],
    checklist: [
      { item: 'Brief from organiser before event starts', required: true },
    ],
    guidelines: [],
    sortOrder: 604,
  },
  {
    code: 'event_sound_crew', name: 'Sound System Crew', category: 'other',
    description: 'Sound system setup and operation for events.',
    estimatedDurationMinutes: 120, priceRangeMinPaise: 100000, priceRangeMaxPaise: 400000,
    requiredSkills: ['event_crew'], requiredTools: ['Speaker system', 'Mixer', 'Cables'],
    checklist: [
      { item: 'Sound check 1 hour before event', required: true },
      { item: 'Test all microphones', required: true },
    ],
    guidelines: [],
    sortOrder: 605,
  },
  {
    code: 'event_lighting_crew', name: 'Event Lighting Crew', category: 'other',
    description: 'Lighting setup — fairy lights, spotlights, LED strips.',
    estimatedDurationMinutes: 120, priceRangeMinPaise: 100000, priceRangeMaxPaise: 400000,
    requiredSkills: ['event_crew'], requiredTools: ['Lighting kit', 'Extension cords'],
    checklist: [
      { item: 'Test all lights before guest arrival', required: true },
    ],
    guidelines: [],
    sortOrder: 606,
  },
  {
    code: 'event_security_crew', name: 'Event Security', category: 'other',
    description: 'Trained security personnel for events.',
    estimatedDurationMinutes: 480, priceRangeMinPaise: 80000, priceRangeMaxPaise: 300000,
    requiredSkills: ['event_crew'], requiredTools: [],
    checklist: [
      { item: 'Brief on event layout and entry points', required: true },
    ],
    guidelines: ['Background verified only'],
    sortOrder: 607,
  },
  {
    code: 'event_birthday_setup', name: 'Birthday Setup', category: 'other',
    description: 'Complete birthday party setup — decor, balloons, banners.',
    estimatedDurationMinutes: 90, priceRangeMinPaise: 100000, priceRangeMaxPaise: 400000,
    requiredSkills: ['event_crew'], requiredTools: ['Birthday kit'],
    checklist: [
      { item: 'Confirm age and theme with customer', required: true },
      { item: 'Photograph finished setup', required: true },
    ],
    guidelines: [],
    sortOrder: 608,
  },
  {
    code: 'event_wedding_setup', name: 'Wedding / Engagement Setup', category: 'other',
    description: 'Premium decor crew for weddings and engagements.',
    estimatedDurationMinutes: 360, priceRangeMinPaise: 300000, priceRangeMaxPaise: 2000000,
    requiredSkills: ['event_crew'], requiredTools: ['Wedding decor kit'],
    checklist: [
      { item: 'Pre-event site visit required', required: true },
      { item: 'Confirm all decor elements 48h before', required: true },
    ],
    guidelines: ['Premium crew — verified and trained'],
    sortOrder: 609,
  },
  {
    code: 'event_photography_assist', name: 'Photography / Videography Assist', category: 'other',
    description: 'Professional photography assistant for events.',
    estimatedDurationMinutes: 240, priceRangeMinPaise: 80000, priceRangeMaxPaise: 300000,
    requiredSkills: ['event_crew'], requiredTools: ['Camera', 'Lighting'],
    checklist: [
      { item: 'Confirm shot list with customer', required: true },
    ],
    guidelines: [],
    sortOrder: 610,
  },
  {
    code: 'event_catering_assist', name: 'Catering Crew Assist', category: 'other',
    description: 'Service crew for serving food and beverages at events.',
    estimatedDurationMinutes: 240, priceRangeMinPaise: 80000, priceRangeMaxPaise: 250000,
    requiredSkills: ['event_crew'], requiredTools: ['Serving equipment'],
    checklist: [
      { item: 'Brief on menu and service style before event', required: true },
    ],
    guidelines: [],
    sortOrder: 611,
  },

  /*
     PET ASSISTANCE NETWORK
 */

  {
    code: 'pet_grooming', name: 'Pet Grooming', category: 'other',
    description: 'Professional grooming at home — bath, trim, nails, ears.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 40000, priceRangeMaxPaise: 150000,
    requiredSkills: ['pet_care'], requiredTools: ['Grooming kit', 'Dryer', 'Shampoo'],
    checklist: [
      { item: 'Check for skin conditions before bathing', required: true },
      { item: 'Use pet-safe shampoo only', required: true },
      { item: 'Photograph before and after', required: true },
    ],
    guidelines: ['Update pet passport with grooming record'],
    sortOrder: 701,
  },
  {
    code: 'pet_walking', name: 'Pet Walking', category: 'other',
    description: 'Regular pet walking — GPS-tracked, real-time updates.',
    estimatedDurationMinutes: 30, priceRangeMinPaise: 15000, priceRangeMaxPaise: 40000,
    requiredSkills: ['pet_care'], requiredTools: ['Leash', 'Poop bags'],
    checklist: [
      { item: "Check pet's mood and energy before walk", required: true },
      { item: 'Share GPS track with owner', required: true },
      { item: 'Photo at end of walk', required: true },
    ],
    guidelines: ['Never let pet off-leash without owner consent'],
    sortOrder: 702,
  },
  {
    code: 'pet_transport', name: 'Pet Transportation', category: 'other',
    description: 'Safe pet transport to vet, groomer, or boarding.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 30000, priceRangeMaxPaise: 100000,
    requiredSkills: ['pet_care'], requiredTools: ['Carrier', 'Harness'],
    checklist: [
      { item: 'Confirm destination and return with owner', required: true },
      { item: 'Share live location during trip', required: true },
    ],
    guidelines: ['Pet must be secured in carrier during transport'],
    sortOrder: 703,
  },
  {
    code: 'pet_sitting', name: 'Pet Sitting', category: 'other',
    description: 'Trusted pet sitter stays with pet at your home.',
    estimatedDurationMinutes: 480, priceRangeMinPaise: 25000, priceRangeMaxPaise: 100000,
    requiredSkills: ['pet_care'], requiredTools: [],
    checklist: [
      { item: 'Note feeding schedule and preferences', required: true },
      { item: 'Regular photo/video updates to owner', required: true },
      { item: 'Emergency vet contact confirmed', required: true },
    ],
    guidelines: ['Background verified — pet safety first'],
    sortOrder: 704,
  },
  {
    code: 'pet_vet_assist', name: 'Vet Visit Companion', category: 'other',
    description: 'Companion accompanies pet to vet — transport + support.',
    estimatedDurationMinutes: 120, priceRangeMinPaise: 50000, priceRangeMaxPaise: 150000,
    requiredSkills: ['pet_care'], requiredTools: ['Carrier', 'Medical records'],
    checklist: [
      { item: 'Carry vaccination records', required: true },
      { item: 'Note vet instructions and share with owner', required: true },
    ],
    guidelines: [],
    sortOrder: 705,
  },
  {
    code: 'pet_training_assist', name: 'Pet Training Session', category: 'other',
    description: 'Professional pet training — basic commands, behaviour correction.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 60000, priceRangeMaxPaise: 200000,
    requiredSkills: ['pet_care'], requiredTools: ['Training treats', 'Clicker'],
    checklist: [
      { item: 'Assess pet behaviour before training', required: true },
      { item: 'Share training progress report with owner', required: true },
    ],
    guidelines: ['Positive reinforcement only — never punishment'],
    sortOrder: 706,
  },

  // Tank & Water Cleaning
  {
    code: 'water_tank_cleaning', name: 'Water Tank Cleaning', category: 'home',
    description: 'Doorstep water tank cleaning — draining, scrubbing, sludge removal and disinfection.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 59900, priceRangeMaxPaise: 250000,
    requiredSkills: ['tank_cleaning'], requiredTools: ['Submersible pump', 'Pressure washer', 'Disinfectant', 'Vacuum'],
    checklist: [
      { item: 'Drain the tank completely', required: true },
      { item: 'Scrub walls and remove sludge', required: true },
      { item: 'Disinfect and rinse before refilling', required: true },
      { item: 'Share before/after photos with customer', required: true },
    ],
    guidelines: ['Use food-grade disinfectant only'],
    sortOrder: 720,
  },
  {
    code: 'overhead_tank_cleaning', name: 'Overhead Tank Cleaning', category: 'home',
    description: 'Rooftop / overhead tank cleaning with full disinfection.',
    estimatedDurationMinutes: 60, priceRangeMinPaise: 69900, priceRangeMaxPaise: 300000,
    requiredSkills: ['tank_cleaning'], requiredTools: ['Submersible pump', 'Pressure washer', 'Disinfectant', 'Safety harness'],
    checklist: [
      { item: 'Check roof access and safety', required: true },
      { item: 'Drain, scrub and remove sludge', required: true },
      { item: 'Disinfect and rinse', required: true },
    ],
    guidelines: ['Use a safety harness for rooftop work'],
    sortOrder: 721,
  },
  {
    code: 'underground_sump_cleaning', name: 'Underground Sump Cleaning', category: 'home',
    description: 'Underground sump/tank cleaning — desludging, scrubbing and disinfection.',
    estimatedDurationMinutes: 90, priceRangeMinPaise: 99900, priceRangeMaxPaise: 400000,
    requiredSkills: ['tank_cleaning'], requiredTools: ['Submersible pump', 'Pressure washer', 'Disinfectant', 'Blower/ventilation'],
    checklist: [
      { item: 'Ventilate the sump before entry', required: true },
      { item: 'Desludge, scrub and remove debris', required: true },
      { item: 'Disinfect and rinse', required: true },
    ],
    guidelines: ['Ensure confined-space ventilation before entry'],
    sortOrder: 722,
  },
  {
    code: 'sintex_tank_cleaning', name: 'Sintex / Plastic Tank Cleaning', category: 'home',
    description: 'Plastic (Sintex) water tank cleaning and disinfection.',
    estimatedDurationMinutes: 45, priceRangeMinPaise: 49900, priceRangeMaxPaise: 200000,
    requiredSkills: ['tank_cleaning'], requiredTools: ['Submersible pump', 'Soft brush', 'Disinfectant'],
    checklist: [
      { item: 'Drain and soft-scrub (no abrasive tools on plastic)', required: true },
      { item: 'Disinfect and rinse', required: true },
    ],
    guidelines: ['Use soft brushes only to avoid scratching plastic'],
    sortOrder: 723,
  },
];

(async () => {
  await connectMongo();

  // Disable old home/construction services (set isActive: false — preserve all data)
  for (const { code } of DISABLED_SERVICES) {
    await ServiceCatalog.findOneAndUpdate(
      { code },
      { $set: { isActive: false } },
      { new: true }
    );
    console.log(`  disabled: ${code}`);
  }

  // Upsert all new active services
  let upserted = 0;
  for (const svc of SERVICES) {
    await ServiceCatalog.findOneAndUpdate(
      { code: svc.code },
      { $set: { ...svc, isActive: true } },
      { upsert: true, new: true }
    );
    console.log(`  upserted: ${svc.code} — ${svc.name}`);
    upserted++;
  }

  console.log(`\n${DISABLED_SERVICES.length} services disabled | ${upserted}/${SERVICES.length} active services upserted`);
  process.exit(0);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
