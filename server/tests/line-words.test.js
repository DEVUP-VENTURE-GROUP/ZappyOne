// A service whose words differ from its category's: a bike wash has a washer and a wash, not a mechanic and a service.
const { lineTerms } = require('../src/modules/onboarding/workspace');

test('a bike wash uses washer words, not the vehicle mechanic words', () => {
  const t = lineTerms({ code: 'bike_wash', repairVertical: 'bike_wash', name: 'Bike Wash' }, { code: 'vehicles' });
  expect(t).toMatchObject({ pro: 'washer', job: 'wash', warranty: false });
});

test('a 2-wheeler repair keeps the category words', () => {
  const t = lineTerms({ code: 'two_wheeler', repairVertical: 'two_wheeler', name: '2-Wheeler' }, { code: 'vehicles' });
  expect(t).toMatchObject({ pro: 'mechanic', job: 'service' });
});
