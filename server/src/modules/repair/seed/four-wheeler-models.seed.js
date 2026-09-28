/**
 * Four-wheeler model catalog.
 *
 * Real, current, high-volume Indian passenger cars — the ones a workshop
 * actually sees. §90 forbids inventing vehicle data and a wrong model produces
 * a wrong part, so this is a deliberate SHORTLIST rather than an attempt at
 * every SKU ever sold. Anything missing arrives through admin entry or a
 * customer identification request, which is the designed path.
 *
 * Two load-bearing fields:
 *
 *   `productTypeCode` — the body type. Decides nothing about parts on its own,
 *   but shapes the browse experience and the provider's capability claim.
 *
 *   `fuelTypes` — which powertrains this model is ACTUALLY sold with, and the
 *   reason this file exists rather than a global fuel list. An Ertiga owner is
 *   offered Petrol and CNG; a Nexon owner Petrol, Diesel and Electric. Offering
 *   every fuel for every car invites someone to describe a car nobody built,
 *   and then be asked about a CNG kit their vehicle does not have.
 *
 * Variants, generations and years are absent on purpose: they change what part
 * fits, so inventing them would be worse than leaving admin to enter the ones
 * that matter.
 */

const VERTICAL = 'four_wheeler';

const HATCH = 'hatchback', SEDAN = 'sedan', SUV = 'suv', MUV = 'muv', LUX = 'luxury';
const P = 'petrol', D = 'diesel', C = 'cng', H = 'hybrid', E = 'electric';

/** `M(brand, name, bodyType, fuels)` — the code is derived, never typed. */
const M = (brandCode, name, productTypeCode, fuelTypes) => ({
  brandCode, name, productTypeCode, fuelTypes,
});

const MODELS = [
  /* Maruti Suzuki */
  M('maruti-suzuki', 'Alto K10', HATCH, [P, C]),
  M('maruti-suzuki', 'S-Presso', HATCH, [P, C]),
  M('maruti-suzuki', 'Celerio', HATCH, [P, C]),
  M('maruti-suzuki', 'Wagon R', HATCH, [P, C]),
  M('maruti-suzuki', 'Swift', HATCH, [P, C]),
  M('maruti-suzuki', 'Baleno', HATCH, [P, C]),
  M('maruti-suzuki', 'Ignis', HATCH, [P]),
  M('maruti-suzuki', 'Dzire', SEDAN, [P, C]),
  M('maruti-suzuki', 'Ciaz', SEDAN, [P]),
  M('maruti-suzuki', 'Fronx', SUV, [P, C]),
  M('maruti-suzuki', 'Brezza', SUV, [P, C]),
  M('maruti-suzuki', 'Grand Vitara', SUV, [P, C, H]),
  M('maruti-suzuki', 'Jimny', SUV, [P]),
  M('maruti-suzuki', 'Ertiga', MUV, [P, C]),
  M('maruti-suzuki', 'XL6', MUV, [P, C]),
  M('maruti-suzuki', 'Invicto', MUV, [H]),
  M('maruti-suzuki', 'Eeco', MUV, [P, C]),

  /* Hyundai */
  M('hyundai', 'Grand i10 Nios', HATCH, [P, C]),
  M('hyundai', 'i20', HATCH, [P]),
  M('hyundai', 'Exter', SUV, [P, C]),
  M('hyundai', 'Venue', SUV, [P, D]),
  M('hyundai', 'Creta', SUV, [P, D]),
  M('hyundai', 'Creta Electric', SUV, [E]),
  M('hyundai', 'Alcazar', SUV, [P, D]),
  M('hyundai', 'Tucson', SUV, [P, D]),
  M('hyundai', 'Aura', SEDAN, [P, C]),
  M('hyundai', 'Verna', SEDAN, [P]),
  M('hyundai', 'Ioniq 5', SUV, [E]),

  /* Tata Motors */
  M('tata-motors', 'Tiago', HATCH, [P, C]),
  M('tata-motors', 'Tiago EV', HATCH, [E]),
  M('tata-motors', 'Altroz', HATCH, [P, D, C]),
  M('tata-motors', 'Tigor', SEDAN, [P, C]),
  M('tata-motors', 'Tigor EV', SEDAN, [E]),
  M('tata-motors', 'Punch', SUV, [P, C]),
  M('tata-motors', 'Punch EV', SUV, [E]),
  M('tata-motors', 'Nexon', SUV, [P, D, C]),
  M('tata-motors', 'Nexon EV', SUV, [E]),
  M('tata-motors', 'Curvv', SUV, [P, D]),
  M('tata-motors', 'Curvv EV', SUV, [E]),
  M('tata-motors', 'Harrier', SUV, [D]),
  M('tata-motors', 'Safari', SUV, [D]),

  /* Mahindra */
  M('mahindra', 'XUV 3XO', SUV, [P, D]),
  M('mahindra', 'Bolero', SUV, [D]),
  M('mahindra', 'Bolero Neo', SUV, [D]),
  M('mahindra', 'Thar', SUV, [P, D]),
  M('mahindra', 'Thar Roxx', SUV, [P, D]),
  M('mahindra', 'Scorpio Classic', SUV, [D]),
  M('mahindra', 'Scorpio N', SUV, [P, D]),
  M('mahindra', 'XUV700', SUV, [P, D]),
  M('mahindra', 'XEV 9e', SUV, [E]),
  M('mahindra', 'BE 6', SUV, [E]),
  M('mahindra', 'Marazzo', MUV, [D]),

  /* Toyota */
  M('toyota', 'Glanza', HATCH, [P, C]),
  M('toyota', 'Taisor', SUV, [P, C]),
  M('toyota', 'Urban Cruiser Hyryder', SUV, [P, C, H]),
  M('toyota', 'Fortuner', SUV, [D]),
  M('toyota', 'Innova Crysta', MUV, [D]),
  M('toyota', 'Innova HyCross', MUV, [P, H]),
  M('toyota', 'Rumion', MUV, [P, C]),
  M('toyota', 'Camry', SEDAN, [H]),

  /* Kia */
  M('kia', 'Sonet', SUV, [P, D]),
  M('kia', 'Syros', SUV, [P, D]),
  M('kia', 'Seltos', SUV, [P, D]),
  M('kia', 'Carens', MUV, [P, D]),
  M('kia', 'Carnival', MUV, [D]),
  M('kia', 'EV6', SUV, [E]),

  /* Honda */
  M('honda-car', 'Amaze', SEDAN, [P]),
  M('honda-car', 'City', SEDAN, [P, H]),
  M('honda-car', 'Elevate', SUV, [P]),

  /* MG, Renault, Nissan */
  M('mg-motor', 'Comet EV', HATCH, [E]),
  M('mg-motor', 'Astor', SUV, [P]),
  M('mg-motor', 'Hector', SUV, [P, D]),
  M('mg-motor', 'ZS EV', SUV, [E]),
  M('mg-motor', 'Windsor EV', SUV, [E]),
  M('renault', 'Kwid', HATCH, [P]),
  M('renault', 'Triber', MUV, [P]),
  M('renault', 'Kiger', SUV, [P]),
  M('nissan', 'Magnite', SUV, [P]),

  /* Volkswagen, Škoda, Jeep, Citroën */
  M('volkswagen', 'Virtus', SEDAN, [P]),
  M('volkswagen', 'Taigun', SUV, [P]),
  M('volkswagen', 'Tiguan', SUV, [P]),
  M('skoda', 'Slavia', SEDAN, [P]),
  M('skoda', 'Kushaq', SUV, [P]),
  M('skoda', 'Kylaq', SUV, [P]),
  M('jeep', 'Compass', SUV, [D]),
  M('jeep', 'Meridian', SUV, [D]),
  M('citroen', 'C3', HATCH, [P]),
  M('citroen', 'Basalt', SUV, [P]),

  /* Premium / luxury */
  M('mercedes-benz', 'A-Class', SEDAN, [P, D]),
  M('mercedes-benz', 'C-Class', SEDAN, [P, D]),
  M('mercedes-benz', 'E-Class', SEDAN, [P, D]),
  M('mercedes-benz', 'GLC', LUX, [P, D]),
  M('mercedes-benz', 'GLE', LUX, [P, D]),
  M('bmw', '3 Series', SEDAN, [P, D]),
  M('bmw', '5 Series', SEDAN, [P, D]),
  M('bmw', 'X1', LUX, [P, D]),
  M('bmw', 'X3', LUX, [P, D]),
  M('bmw', 'iX1', LUX, [E]),
  M('audi', 'A4', SEDAN, [P]),
  M('audi', 'Q3', LUX, [P]),
  M('audi', 'Q5', LUX, [P]),
  M('audi', 'Q8 e-tron', LUX, [E]),
  M('volvo', 'XC40', LUX, [P]),
  M('volvo', 'XC60', LUX, [P]),
  M('volvo', 'EX40', LUX, [E]),
  M('mini', 'Cooper', HATCH, [P]),
  M('mini', 'Countryman', LUX, [P]),
  M('jaguar', 'F-Pace', LUX, [P, D]),
  M('land-rover', 'Defender', LUX, [P, D]),
  M('land-rover', 'Range Rover Evoque', LUX, [P, D]),
  M('land-rover', 'Discovery Sport', LUX, [P, D]),
  M('lexus', 'NX', LUX, [H]),
  M('lexus', 'ES', SEDAN, [H]),

  /* EV specialists */
  M('byd', 'Atto 3', SUV, [E]),
  M('byd', 'Seal', SEDAN, [E]),
  M('byd', 'eMAX 7', MUV, [E]),
  M('tesla', 'Model 3', SEDAN, [E]),
  M('tesla', 'Model Y', SUV, [E]),
];

/** `tata-motors` + `Nexon EV` → `tata-motors-nexon-ev`. Stable and readable. */
function toCode(brandCode, name) {
  return `${brandCode}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { VERTICAL, MODELS, toCode };
