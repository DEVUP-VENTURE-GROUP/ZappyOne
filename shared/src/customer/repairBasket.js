/**
 * Several vehicles or devices in one booking (server repair/services/group),
 * for the website and the app alike. The basket holds the OTHER items; the one
 * being chosen in the flow right now joins them at checkout.
 */

/** Where "+ Add another" can go: every kind we repair or service, by its flow's path. */
export const ADD_TARGETS = [
  { vertical: 'two_wheeler', label: 'Bike or scooter', path: '/repair/two-wheeler' },
  { vertical: 'four_wheeler', label: 'Car', path: '/repair/four-wheeler' },
  { vertical: 'mobile', label: 'Phone', path: '/repair' },
  { vertical: 'laptop', label: 'Laptop', path: '/repair/laptop' },
  { vertical: 'water_tank_care', label: 'Water tank', path: '/repair/water-tank-care' },
  { vertical: 'bike_wash', label: 'Bike wash', path: '/repair/bike-wash' },
  { vertical: 'car_wash', label: 'Car wash', path: '/repair/car-wash' },
  { vertical: 'home_cleaning', label: 'Home cleaning', path: '/repair/home-cleaning' },
  { vertical: 'electrician', label: 'Electrician', path: '/repair/electrician' },
  { vertical: 'plumbing', label: 'Plumber', path: '/repair/plumbing' },
  { vertical: 'ac_service', label: 'AC service', path: '/repair/ac-service' },
];

// Fixed-price package services: the brand slot holds a type (vehicle, home size, AC type), so it is worded as that.
export const PACKAGE_TYPE_WORD = { bike_wash: 'vehicle', car_wash: 'car type', home_cleaning: 'home size', electrician: 'place', plumbing: 'place', ac_service: 'AC type' };

/** "vehicle", "device" or "tank", for "+ Add another …". */
export const thingOf = (vertical) => ({ two_wheeler: 'vehicle', four_wheeler: 'vehicle', bike_wash: 'vehicle', car_wash: 'vehicle', water_tank_care: 'tank', home_cleaning: 'home', electrician: 'job', plumbing: 'job', ac_service: 'AC' }[vertical] || 'device');

// The built-in lists above, joined with every service the server books (useRepairVerticalsQuery items), so a service opened in admin appears without an app change.
export const targetsWith = (items = []) => [...ADD_TARGETS, ...items.filter((i) => i.status === 'live' && !ADD_TARGETS.some((t) => t.vertical === i.vertical)).map((i) => ({ vertical: i.vertical, label: i.name, path: i.path }))];
export const typeWordOf = (vertical, items = []) => PACKAGE_TYPE_WORD[vertical] || items.find((i) => i.vertical === vertical)?.typeWord?.toLowerCase() || undefined;
export const thingFor = (vertical, items = []) => (PACKAGE_TYPE_WORD[vertical] || ['two_wheeler', 'four_wheeler', 'water_tank_care', 'mobile', 'laptop'].includes(vertical) ? thingOf(vertical) : items.find((i) => i.vertical === vertical)?.thing || thingOf(vertical));

/** The chosen repair of a flow: what the diagnosis landed on. */
export const repairOf = (diagnosis) => diagnosis?.primaryRepairCode || diagnosis?.recommendations?.[0]?.repairCode || null;

/**
 * One item from the flow's choices, as the server takes it, plus what the
 * basket shows. Null until a repair is chosen (an item must be priced).
 * @param {{ vertical: string, brand: any, model: any, configuration?: any, fuelType?: string | null, problem?: any,
 *   diagnosis?: any, repairCode?: string | null, repairName?: string, qualityCode?: string | null, label?: string }} choices
 */
export function itemFrom({ vertical, brand, model, configuration = null, fuelType = '', problem, diagnosis, repairCode = null, repairName = '', qualityCode = null, label = '' }) {
  const code = repairCode || repairOf(diagnosis);
  if (!brand || !model || !code) return null;
  return {
    vertical, label,
    brandCode: brand.code, modelCode: model.code, modelId: model._id || null,
    configurationCode: configuration?.code || null, fuelType: fuelType || '',
    problemCodes: problem?.code ? [problem.code] : [],
    diagnosisSummary: diagnosis?.summary || '',
    repairCode: code, qualityCode: qualityCode || diagnosis?.recommendedQuality || null,
    // For the basket only; stripped before it is sent.
    show: {
      title: [brand.name, model.name].filter(Boolean).join(' '),
      service: repairName || diagnosis?.recommendations?.[0]?.repairName || problem?.name || 'Service',
    },
  };
}

/** The same item twice is one item (same thing, same service). */
export const sameItem = (a, b) => !!a && !!b && a.vertical === b.vertical && a.modelCode === b.modelCode && a.repairCode === b.repairCode && (a.label || '') === (b.label || '');

/** Basket + the current one, as the server takes them. */
export function groupItems(basket, current) {
  const all = current && !basket.some((b) => sameItem(b, current)) ? [...basket, current] : basket;
  return all.map(({ show, ...item }) => item);
}

/** A single-provider option's key, as the server reads `choice`. */
export const choiceOf = (option) => (option?.plan === 'split'
  ? 'split'
  : `${option?.provider?.shopId ? 'shop' : 'worker'}:${option?.provider?.shopId || option?.provider?.workerId}`);

/** How each item of a booked group reads on its tracking page (jobKinds repair stages). */
export const STAGE_LABEL = {
  searching: 'Finding your pro', assigned: 'Pro confirmed', on_the_way: 'On the way', arrived: 'Arrived',
  in_progress: 'In progress', completed: 'Done', cancelled: 'Cancelled', failed: 'Could not be done',
};
