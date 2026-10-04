/**
 * Before a provider accepts, they see the area, never the house; once a job
 * is over, the customer no longer gets the provider's number.
 */
const { areaOf, roughCoords, shortName, areaOnly } = require('../src/modules/jobs/privacy');

test('area keeps locality and city, drops house details, pincode and state', () => {
  expect(areaOf('Flat 2B, Sri Sai Residency, Road 5, Madhapur, Hyderabad, Telangana 500081')).toBe('Madhapur, Hyderabad');
  expect(areaOf('H.No 4-12, Gandhi Nagar, Vikarabad, Telangana')).toBe('Gandhi Nagar, Vikarabad');
  expect(areaOf('Plot 44')).toBe('');
  expect(areaOf('')).toBe('');
});

test('a pin is rounded to about a kilometre', () => {
  expect(roughCoords([78.391532, 17.448311])).toEqual([78.39, 17.45]);
  expect(roughCoords(null)).toBeNull();
});

test('people are introduced by first name and initial', () => {
  expect(shortName('Ravi Kumar Reddy')).toBe('Ravi R.');
  expect(shortName('Asha')).toBe('Asha');
  expect(shortName('', 'Your pro')).toBe('Your pro');
});

test('areaOnly strips flat number and landmark', () => {
  expect(areaOnly({ address: 'Flat 9, Lake View Apts, Kondapur, Hyderabad', flatNumber: '9', landmark: 'near temple', coordinates: [78.3615, 17.4615], cityCode: 'hyd' }))
    .toEqual({ address: 'Kondapur, Hyderabad', cityCode: 'hyd', coordinates: [78.36, 17.46] });
});
