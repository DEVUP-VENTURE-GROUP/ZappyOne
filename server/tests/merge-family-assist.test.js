// Errands join Family Assist: lines, enrolments and their own (lighter) verification move; the old section is off; eligibility still works.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { ServiceDomain, ServiceLine, ProviderEnrolment, KycRequirementSet } = require('../src/modules/onboarding/onboarding.model');
const { merge } = require('../scripts/merge-family-assist');
const onboarding = require('../src/modules/onboarding/onboarding.service');
const { approvedLines } = require('../src/modules/onboarding/eligibility');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

test('moves the errands under Family Assist with their own rules, twice is safe', async () => {
  await ServiceDomain.create([{ code: 'family_assist', name: 'Family Assist' }, { code: 'helping_services', name: 'Helping Services' }]);
  await ServiceLine.create([
    { code: 'shopping_pickup', name: 'Shopping & Pickup Help', domainCode: 'helping_services', status: 'live', customerPath: '/helping/shopping', providerKinds: ['shop', 'individual'] },
    { code: 'returns_exchange', name: 'Returns & Exchange', domainCode: 'helping_services', status: 'live', customerPath: '/helping/returns', providerKinds: ['shop', 'individual'] },
  ]);
  await KycRequirementSet.create({ name: 'Helping', domainCode: 'helping_services', lineCode: null, providerKind: 'individual', documents: [{ code: 'aadhaar', label: 'Aadhaar', required: true }] });
  await KycRequirementSet.create({ name: 'Family', domainCode: 'family_assist', lineCode: null, providerKind: 'individual', documents: [{ code: 'police_verification', label: 'Police', required: true }] });
  const workerId = new mongoose.Types.ObjectId();
  await ProviderEnrolment.create({ providerKind: 'individual', workerId, domainCode: 'helping_services', lineCode: 'shopping_pickup', status: 'approved' });

  await merge();
  await merge();
  expect((await ServiceLine.findOne({ code: 'returns_exchange' }).lean()).domainCode).toBe('family_assist');
  expect((await ServiceDomain.findOne({ code: 'helping_services' }).lean()).isActive).toBe(false);
  expect((await ProviderEnrolment.findOne({ workerId }).lean()).domainCode).toBe('family_assist');
  expect(await KycRequirementSet.countDocuments({ domainCode: 'family_assist', lineCode: 'shopping_pickup' })).toBe(1);
  const { set } = await onboarding.resolveRequirements({ lineCode: 'shopping_pickup', providerKind: 'individual' });
  expect(set.documents.map((d) => d.code)).toEqual(['aadhaar']);
  expect((await approvedLines({ role: 'worker', id: workerId })).has('shopping_pickup')).toBe(true);
});
