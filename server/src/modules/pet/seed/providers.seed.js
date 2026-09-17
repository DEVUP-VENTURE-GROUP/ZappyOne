/**
 * DEMO Pet Services providers and Hyderabad service areas (§48, §52).
 *
 * Every provider name is prefixed `[DEMO]` and every row carries
 * `isDemo: true` (§52) — a demo provider can never be mistaken for a real
 * one, and can be found and removed with one query. No real person's
 * information is used.
 *
 * Each provider is given a DIFFERENT slice of capability, deliberately —
 * §52's own example is followed: one groomer, one walker/home-care sitter,
 * one boarding operator, one cat specialist, one transport provider, one vet
 * assistance provider. That spread is what makes every category testable at
 * once instead of one provider quietly backing all seven.
 *
 * Areas are the platform's own existing Hyderabad seed list (§48) — reused,
 * not duplicated — with an explicit note that provider coverage, not this
 * list, determines real availability.
 */

const CENTRE = { gachibowli: [78.3487, 17.4401], kondapur: [78.3672, 17.4615], madhapur: [78.3915, 17.4483], jubileehills: [78.4089, 17.4325] };

const SERVICE_AREAS = [
  { code: 'gachibowli', name: 'Gachibowli', coords: [78.3487, 17.4401] },
  { code: 'kondapur', name: 'Kondapur', coords: [78.3672, 17.4615] },
  { code: 'madhapur', name: 'Madhapur', coords: [78.3915, 17.4483] },
  { code: 'hitec_city', name: 'HITEC City', coords: [78.3809, 17.4483] },
  { code: 'jubilee_hills', name: 'Jubilee Hills', coords: [78.4089, 17.4325] },
  { code: 'banjara_hills', name: 'Banjara Hills', coords: [78.4482, 17.4156] },
  { code: 'begumpet', name: 'Begumpet', coords: [78.4675, 17.4400] },
  { code: 'kukatpally', name: 'Kukatpally', coords: [78.4011, 17.4849] },
  { code: 'miyapur', name: 'Miyapur', coords: [78.3573, 17.4966] },
  { code: 'manikonda', name: 'Manikonda', coords: [78.3809, 17.4067] },
  { code: 'nallagandla', name: 'Nallagandla', coords: [78.3086, 17.4614] },
  { code: 'financial_district', name: 'Financial District', coords: [78.3389, 17.4143] },
  { code: 'narsingi', name: 'Narsingi', coords: [78.3486, 17.3892] },
  { code: 'secunderabad', name: 'Secunderabad', coords: [78.4983, 17.4399] },
];

/**
 * `P(name, providerType, phone-suffix, capability)` — phone is a reserved
 * 9999-8-prefixed demo range, never a real number.
 */
function P(name, providerType, suffix, capability) {
  return {
    name: `[DEMO] ${name}`,
    phone: `99998${String(suffix).padStart(5, '0')}`,
    providerType,
    capability,
  };
}

const DEMO_PROVIDERS = [
  P('PawCare Hyderabad Demo', 'pet_groomer', 10001, {
    species: ['dog', 'cat'], sizes: ['small', 'medium', 'large'],
    categoryCodes: ['pet_grooming'], modes: ['doorstep', 'provider_location'],
    serviceAreaCodes: ['gachibowli', 'kondapur', 'madhapur', 'hitec_city'],
    baseLocation: CENTRE.gachibowli, serviceRadiusKm: 10, experienceYears: 6,
    qualifications: [], equipment: ['clippers', 'dryer', 'grooming_table'],
  }),
  P('PetBuddy Care Demo', 'dog_walker', 10002, {
    species: ['dog', 'cat'], sizes: ['small', 'medium', 'large', 'extra_large'],
    categoryCodes: ['pet_walk', 'pet_home_care', 'pet_check'],
    modes: ['doorstep', 'home_visit'],
    serviceAreaCodes: ['jubilee_hills', 'banjara_hills', 'begumpet'],
    baseLocation: CENTRE.jubileehills, serviceRadiusKm: 8, experienceYears: 3,
  }),
  P('Happy Tails Grooming Demo', 'pet_groomer', 10003, {
    species: ['dog', 'cat'], sizes: ['small', 'medium', 'large', 'extra_large'],
    categoryCodes: ['pet_grooming'], modes: ['doorstep'],
    handlesAggressive: true,
    serviceAreaCodes: ['kukatpally', 'miyapur'],
    baseLocation: CENTRE.kondapur, serviceRadiusKm: 12, experienceYears: 8,
    equipment: ['mobile_grooming_van', 'clippers', 'dryer'],
  }),
  P('Urban Paws Boarding Demo', 'boarding_provider', 10004, {
    species: ['dog'], sizes: ['small', 'medium', 'large', 'extra_large'],
    categoryCodes: ['pet_boarding'], modes: ['boarding', 'daycare'],
    boardingCapacity: 8, daycareCapacity: 12,
    serviceAreaCodes: ['manikonda', 'narsingi', 'financial_district'],
    baseLocation: CENTRE.gachibowli, serviceRadiusKm: 15, experienceYears: 5,
    equipment: ['kennels', 'cctv', 'ac_rooms'],
  }),
  P('Whiskers Home Care Demo', 'pet_sitter', 10005, {
    species: ['cat'], sizes: ['small', 'medium', 'large'],
    categoryCodes: ['pet_home_care', 'pet_check', 'pet_boarding'],
    modes: ['home_visit', 'boarding'],
    boardingCapacity: 4,
    optInVariantCodes: ['pb_daycare', 'pb_half_day_daycare', 'pb_full_day_daycare'],
    serviceAreaCodes: ['nallagandla', 'kondapur', 'gachibowli'],
    baseLocation: CENTRE.kondapur, serviceRadiusKm: 10, experienceYears: 4,
  }),
  P('PetRide Hyderabad Demo', 'pet_transport', 10006, {
    species: ['dog', 'cat'], sizes: ['small', 'medium', 'large', 'extra_large'],
    categoryCodes: ['pet_transport'], modes: ['transport', 'pickup_and_return'],
    serviceAreaCodes: ['gachibowli', 'kondapur', 'madhapur', 'hitec_city', 'jubilee_hills', 'banjara_hills'],
    baseLocation: CENTRE.madhapur, serviceRadiusKm: 20, experienceYears: 4,
    equipment: ['ac_vehicle', 'pet_carrier'],
  }),
  P('VetAssist Hyderabad Demo', 'vet_assistant', 10007, {
    species: ['dog', 'cat'], sizes: ['small', 'medium', 'large', 'extra_large'],
    categoryCodes: ['pet_vet_assist', 'pet_transport'], modes: ['transport', 'pickup_and_return', 'provider_location'],
    serviceAreaCodes: ['secunderabad', 'begumpet', 'jubilee_hills'],
    baseLocation: CENTRE.jubileehills, serviceRadiusKm: 18, experienceYears: 5,
    qualifications: ['vet_assistant_certified'],
  }),
];

module.exports = { SERVICE_AREAS, DEMO_PROVIDERS };
