/**
 * Festivals home turns festive for by itself (content/season.service), so the
 * customer home is never plain on Diwali because nobody set it up. A season
 * created in Admin → Festive home always wins over these. No offer here: an
 * offer is a promo code someone chose.
 *
 * Windows open a few days early (the cleaning and repairs happen before the
 * day) and close the day after. Dates are India's 2026–27 calendar; lunar
 * festivals (Eid, Holi) can move a day, which the windows absorb. Extend the
 * list each year.
 *
 * Tiles name services; one not live where the customer is simply is not shown.
 */
const at = (day) => new Date(`${day}T00:00:00+05:30`);

const LOOKS = {
  dussehra: {
    theme: 'navratri', greeting: 'Happy Bathukamma & Dussehra',
    headline: 'Festive-ready, before the guests arrive', subline: 'Verified pros at your door, with the price agreed before work starts.',
    tiles: [
      { title: 'Ayudha Puja bike service', serviceCode: 'two_wheeler', badge: 'Puja' },
      { title: 'Car wash & care', serviceCode: 'four_wheeler', badge: '' },
      { title: 'Deep home cleaning', serviceCode: 'cleaning', badge: '' },
      { title: 'Water tank clean', serviceCode: 'water_tank_care', badge: '' },
      { title: 'Lights & wiring', serviceCode: 'electrical', badge: '' },
      { title: 'Phone repair', serviceCode: 'mobile_repair', badge: '' },
    ],
  },
  diwali: {
    theme: 'diwali', greeting: 'Happy Diwali',
    headline: 'Light up a ready home', subline: 'Cleaning, lights and repairs done before the diyas are lit.',
    tiles: [
      { title: 'Diwali deep clean', serviceCode: 'cleaning', badge: 'Popular' },
      { title: 'Lights & wiring', serviceCode: 'electrical', badge: 'Diwali' },
      { title: 'Water tank clean', serviceCode: 'water_tank_care', badge: '' },
      { title: 'Car shine', serviceCode: 'four_wheeler', badge: '' },
      { title: 'Appliance repair', serviceCode: 'appliance', badge: '' },
      { title: 'Phone repair', serviceCode: 'mobile_repair', badge: '' },
    ],
  },
  christmas: {
    theme: 'christmas', greeting: 'Merry Christmas & Happy New Year',
    headline: 'Start the new year sorted', subline: 'Party-ready homes, devices and rides, by verified pros.',
    tiles: [
      { title: 'Party décor', serviceCode: 'events', badge: 'New Year' },
      { title: 'Deep home cleaning', serviceCode: 'cleaning', badge: '' },
      { title: 'Laptop repair', serviceCode: 'laptop_repair', badge: '' },
      { title: 'Phone repair', serviceCode: 'mobile_repair', badge: '' },
      { title: 'Car care', serviceCode: 'four_wheeler', badge: '' },
      { title: 'Appliance repair', serviceCode: 'appliance', badge: '' },
    ],
  },
  sankranti: {
    theme: 'sankranti', greeting: 'Happy Sankranti',
    headline: 'Home for the harvest festival', subline: 'Travel-ready rides and a clean home to come back to.',
    tiles: [
      { title: 'Road-trip car check', serviceCode: 'four_wheeler', badge: 'Travel' },
      { title: 'Bike service', serviceCode: 'two_wheeler', badge: '' },
      { title: 'Pet stay while away', serviceCode: 'pet_boarding', badge: '' },
      { title: 'Deep home cleaning', serviceCode: 'cleaning', badge: '' },
      { title: 'Water tank clean', serviceCode: 'water_tank_care', badge: '' },
      { title: 'Phone repair', serviceCode: 'mobile_repair', badge: '' },
    ],
  },
  holi: {
    theme: 'holi', greeting: 'Happy Holi',
    headline: 'Colours in, mess out', subline: 'After the play: cleaning, washing and wet-phone rescue.',
    tiles: [
      { title: 'After-Holi clean', serviceCode: 'cleaning', badge: 'Holi' },
      { title: 'Wet phone rescue', serviceCode: 'mobile_repair', badge: '' },
      { title: 'Car wash', serviceCode: 'four_wheeler', badge: '' },
      { title: 'Bike wash & service', serviceCode: 'two_wheeler', badge: '' },
      { title: 'Pet colour wash', serviceCode: 'pet_grooming', badge: '' },
      { title: 'Water tank clean', serviceCode: 'water_tank_care', badge: '' },
    ],
  },
  eid: {
    theme: 'eid', greeting: 'Eid Mubarak',
    headline: 'Ready for family and feasts', subline: 'A home, kitchen and ride ready for the guests.',
    tiles: [
      { title: 'Deep home cleaning', serviceCode: 'cleaning', badge: 'Eid' },
      { title: 'Appliance repair', serviceCode: 'appliance', badge: '' },
      { title: 'Lights & wiring', serviceCode: 'electrical', badge: '' },
      { title: 'Eid décor', serviceCode: 'events', badge: '' },
      { title: 'Car care', serviceCode: 'four_wheeler', badge: '' },
      { title: 'Water tank clean', serviceCode: 'water_tank_care', badge: '' },
    ],
  },
};

/** [look, opens, closes (exclusive)] */
const WINDOWS = [
  ['dussehra', '2026-10-08', '2026-10-22'],
  ['diwali', '2026-10-25', '2026-11-11'],
  ['christmas', '2026-12-18', '2027-01-02'],
  ['sankranti', '2027-01-08', '2027-01-17'],
  ['eid', '2027-03-03', '2027-03-12'],
  ['holi', '2027-03-15', '2027-03-24'],
  ['dussehra', '2027-09-27', '2027-10-11'],
  ['diwali', '2027-10-15', '2027-11-01'],
  ['christmas', '2027-12-18', '2028-01-02'],
];

const FESTIVALS = WINDOWS.map(([key, from, to]) => ({
  id: `auto:${key}-${from.slice(0, 4)}`, name: `${key[0].toUpperCase()}${key.slice(1)} ${from.slice(0, 4)}`,
  ...LOOKS[key], startAt: at(from), endAt: at(to), auto: true,
}));

/** The built-in festival on now, or null. */
const festivalAt = (now = new Date()) => FESTIVALS.find((f) => f.startAt <= now && f.endAt > now) || null;

/** The next ones, for the admin page. */
const upcoming = (now = new Date(), n = 4) => FESTIVALS.filter((f) => f.endAt > now).slice(0, n);

module.exports = { festivalAt, upcoming, FESTIVALS };
