// Home cleaning, electrician, plumbing and AC service as fixed-price packages (wash.seed packageVertical), done by partner shops, agencies and independent pros. Starting prices for Hyderabad, 2026-10; admin changes any of them.
const { packageVertical } = require('./wash.seed');

const HOME = [{ code: 'home', name: 'Home or office' }];
const one = (p) => ({ home: p });

const CLEANING = packageVertical({
  vertical: 'home_cleaning', prefix: 'hc', label: 'Home size', group: 'jobs', qaCode: 'clean',
  skill: { name: 'Cleaner', description: 'Trained in deep cleaning, safe chemicals and machine scrubbing' },
  qa: [
    { code: 'before_after_photos', label: 'Before and after photos of every room', required: true },
    { code: 'customer_walkthrough', label: 'Customer walked through and approved', required: true },
    { code: 'waste_removed', label: 'Waste bagged and taken away', required: true },
  ],
  types: [{ code: '1bhk', name: '1 BHK' }, { code: '2bhk', name: '2 BHK' }, { code: '3bhk', name: '3 BHK' }, { code: '4bhk', name: '4 BHK or villa' }],
  packages: [
    { code: 'full_deep', name: 'Full home deep clean', minutes: 300, prices: { '1bhk': 2999, '2bhk': 3999, '3bhk': 4999, '4bhk': 6499 } },
    { code: 'kitchen', name: 'Kitchen deep clean', minutes: 150, prices: { '1bhk': 1199, '2bhk': 1399, '3bhk': 1599, '4bhk': 1799 } },
    { code: 'bathrooms', name: 'Bathroom deep clean (all bathrooms)', minutes: 120, prices: { '1bhk': 499, '2bhk': 899, '3bhk': 1299, '4bhk': 1699 } },
    { code: 'move', name: 'Move-in or move-out clean (empty home)', minutes: 360, prices: { '1bhk': 2499, '2bhk': 3299, '3bhk': 4199, '4bhk': 5499 } },
  ],
});

const ELECTRICIAN = packageVertical({
  vertical: 'electrician', prefix: 'el', label: 'Place', group: 'jobs', qaCode: 'job',
  skill: { name: 'Electrician', description: 'Licensed for home wiring, fittings and safety checks' },
  qa: [
    { code: 'power_tested', label: 'Power tested and working after the job', required: true },
    { code: 'no_exposed_wires', label: 'No exposed wires left', required: true },
    { code: 'area_clean', label: 'Work area left clean', required: true },
  ],
  types: HOME,
  packages: [
    { code: 'visit', name: 'Electrician visit and inspection', minutes: 30, prices: one(149) },
    { code: 'fan', name: 'Ceiling fan install or replace', minutes: 45, prices: one(249) },
    { code: 'switch', name: 'Switch or socket replace', minutes: 20, prices: one(129) },
    { code: 'light', name: 'Light or tubelight fitting install', minutes: 30, prices: one(199) },
    { code: 'mcb', name: 'MCB or fuse change', minutes: 30, prices: one(249) },
    { code: 'doorbell', name: 'Doorbell install', minutes: 30, prices: one(149) },
    { code: 'inverter', name: 'Inverter install', minutes: 90, prices: one(599) },
  ],
});

const PLUMBING = packageVertical({
  vertical: 'plumbing', prefix: 'pl', label: 'Place', group: 'jobs', qaCode: 'job',
  skill: { name: 'Plumber', description: 'Trained in fittings, leaks, blockages and motor work' },
  qa: [
    { code: 'no_leak', label: 'Checked for leaks after the job', required: true },
    { code: 'water_flow', label: 'Water flow tested with the customer', required: true },
    { code: 'area_clean', label: 'Work area left dry and clean', required: true },
  ],
  types: HOME,
  packages: [
    { code: 'visit', name: 'Plumber visit and inspection', minutes: 30, prices: one(149) },
    { code: 'tap', name: 'Tap or mixer replace', minutes: 30, prices: one(199) },
    { code: 'leak', name: 'Leak repair (pipe or joint)', minutes: 45, prices: one(249) },
    { code: 'flush', name: 'Toilet flush tank repair', minutes: 45, prices: one(349) },
    { code: 'blockage', name: 'Drain or basin blockage clearing', minutes: 60, prices: one(399) },
    { code: 'basin', name: 'Wash basin install', minutes: 90, prices: one(599) },
    { code: 'motor', name: 'Water motor install', minutes: 90, prices: one(699) },
  ],
});

const AC = packageVertical({
  vertical: 'ac_service', prefix: 'ac', label: 'AC type', group: 'jobs', qaCode: 'job',
  skill: { name: 'AC technician', description: 'Trained in split and window AC service, gas and installation' },
  qa: [
    { code: 'cooling_tested', label: 'Cooling tested with the customer', required: true },
    { code: 'no_water_leak', label: 'No water leaking from the indoor unit', required: true },
    { code: 'area_clean', label: 'Work area left clean', required: true },
  ],
  types: [{ code: 'split', name: 'Split AC' }, { code: 'window', name: 'Window AC' }],
  packages: [
    { code: 'service', name: 'Foam jet service', minutes: 60, prices: { split: 599, window: 499 } },
    { code: 'repair_visit', name: 'Repair visit (not cooling, noise, leak)', minutes: 45, prices: { split: 299, window: 299 } },
    { code: 'gas', name: 'Gas refill (with leak check)', minutes: 90, prices: { split: 2499, window: 2199 } },
    { code: 'install', name: 'Installation', minutes: 120, prices: { split: 1499, window: 1199 } },
    { code: 'uninstall', name: 'Uninstallation', minutes: 60, prices: { split: 599, window: 499 } },
  ],
});

const HOME_SERVICES = { home_cleaning: CLEANING, electrician: ELECTRICIAN, plumbing: PLUMBING, ac_service: AC };

module.exports = { CLEANING, ELECTRICIAN, PLUMBING, AC, HOME_SERVICES };
