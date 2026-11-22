// Electronics beside the built-in phone and laptop repair: more smart-home jobs and five new services; prices are starting suggestions, each partner sets their own.
const { ONE, job } = require('./helpers');

const TVS = [{ code: 'small', name: 'Up to 32 inch' }, { code: 'medium', name: '40 to 50 inch' }, { code: 'large', name: '55 inch and above' }];
const tv = (s, m, l) => ({ small: s, medium: m, large: l });

const extend = {
  tech_setup: [
    job('video_doorbell', 'Video doorbell installation', 60, 599, 'Mounted and wired|App set up on your phone|Tested'),
    job('intercom', 'Intercom installation or repair visit', 60, 499, 'Units fixed and wired|Tested|Repair quoted if needed'),
    job('smart_lock', 'Smart lock pairing and setup', 45, 399, 'App and Wi-Fi pairing|Users and codes added|Tested'),
    job('alexa', 'Smart speaker and voice control setup', 30, 299, 'Speaker set up|Lights and plugs linked|Routines made'),
  ],
};

const lines = [
  { code: 'tv_repair', prefix: 'tvrep', name: 'TV repair & installation', domainCode: 'electronics', icon: 'Monitor', typeWord: 'TV size', thing: 'tv', types: TVS, isPopular: true,
    packages: [
      job('inspect', 'TV inspection and repair quote', 45, tv(299, 349, 399), 'Fault found|Repair quoted before work|Small fixes done'),
      job('wall_mount', 'TV wall mounting', 45, tv(399, 499, 699), 'Bracket fixed|Level|Cables tidied'),
      job('uninstall', 'TV uninstall from wall', 30, tv(199, 249, 349), 'Taken down safely|Holes filled|Bracket kept for you'),
      job('panel', 'Screen panel replacement (panel extra)', 120, tv(999, 1499, 1999), 'Old panel removed|New panel fitted|Tested'),
      job('board', 'Motherboard or power board repair', 90, tv(799, 999, 1299), 'Board repaired or replaced (part extra)|Tested|Warranty on work'),
      job('setup', 'Smart TV setup and apps', 30, tv(199, 199, 249), 'Wi-Fi and accounts|Apps installed|Remote paired'),
    ] },
  { code: 'audio_repair', prefix: 'audio', name: 'Speakers, home theatre & sound repair', domainCode: 'electronics', icon: 'Music', thing: 'device', types: ONE,
    packages: [
      job('inspect', 'Audio system inspection and quote', 45, 299, 'Fault found|Repair quoted|Small fixes done'),
      job('ht_install', 'Home theatre installation', 90, 799, 'Speakers placed|Wires concealed where possible|Sound tuned'),
      job('soundbar', 'Soundbar mounting and setup', 45, 399, 'Wall or table|TV connection|Tested'),
      job('speaker_repair', 'Speaker repair', 60, 499, 'Driver or wire fixed (part extra)|Tested|Warranty on work'),
      job('amp_repair', 'Amplifier repair', 60, 699, 'Fault fixed (part extra)|Tested|Warranty on work'),
      job('ceiling_speakers', 'Ceiling speaker installation, per pair', 120, 1499, 'Cut-outs made|Wired|Tested'),
    ] },
  { code: 'small_appliance', prefix: 'smallapp', name: 'Mixer, iron & small appliance repair', domainCode: 'electronics', icon: 'Plug', thing: 'appliance', types: ONE, isPopular: true,
    packages: [
      job('mixer', 'Mixer grinder repair', 45, 299, 'Pickup or at home|Coupler, blades or motor checked|Tested'),
      job('iron', 'Iron box repair', 30, 199, 'Thermostat or cord fixed|Tested|Safe to use'),
      job('kettle', 'Kettle or induction repair', 45, 299, 'Fault fixed (part extra)|Tested|Safe to use'),
      job('fan', 'Table, pedestal or ceiling fan repair', 45, 249, 'Capacitor or winding checked|Fixed (part extra)|Tested'),
      job('hair_dryer', 'Hair dryer or trimmer repair', 30, 199, 'Fault fixed (part extra)|Tested|Safe to use'),
      job('water_heater', 'Immersion rod or instant geyser repair', 45, 249, 'Element or thermostat checked|Fixed (part extra)|Tested'),
    ] },
  { code: 'camera_repair', prefix: 'camrep', name: 'Camera & drone repair', domainCode: 'electronics', icon: 'Camera', thing: 'device', types: ONE,
    packages: [
      job('inspect', 'Camera inspection and quote', 30, 299, 'Fault found|Repair quoted|Pickup and drop option'),
      job('sensor_clean', 'Camera sensor cleaning', 30, 799, 'Dust spots removed|Safe tools|Test shots'),
      job('lens', 'Lens cleaning and fungus check', 30, 699, 'Elements cleaned|Fungus checked|Test shots'),
      job('shutter', 'Shutter or button repair', 60, 1499, 'Part replaced (part extra)|Tested|Warranty on work'),
      job('drone', 'Drone repair visit', 60, 999, 'Motors, props and gimbal checked|Fixed (parts extra)|Test flight'),
      job('action_cam', 'Action camera repair', 45, 799, 'Screen, battery or port|Fixed (part extra)|Tested'),
    ] },
  { code: 'office_networking', prefix: 'netwrk', name: 'Office & home networking', domainCode: 'electronics', icon: 'Cpu', thing: 'network', types: ONE,
    packages: [
      job('visit', 'Network survey and quote', 45, 299, 'Coverage checked|Equipment advised|Fixed quote'),
      job('lan_point', 'LAN cable point, per point', 45, 399, 'Cable laid and crimped|Tested|Labelled'),
      job('mesh', 'Mesh Wi-Fi setup for full coverage', 60, 799, 'Nodes placed|One network name|Speed tested'),
      job('printer_share', 'Printer and file sharing setup', 45, 499, 'Printer on the network|Shared folders|Tested on each PC'),
      job('rack', 'Network rack and switch setup', 120, 1999, 'Rack fixed|Switch and patching|Labelled'),
      job('troubleshoot', 'Internet and Wi-Fi troubleshooting', 45, 349, 'Slow or dropping fixed|Router settings|Speed tested'),
    ] },
];

module.exports = { extend, lines };
