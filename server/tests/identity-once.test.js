/**
 * Identity is verified once per person; each service asks only its own questions.
 *
 *   - a worker who passed the old ID check is not asked for Aadhaar or a selfie again
 *   - documents given for one service are carried into the next
 *   - a service can be submitted with only its own details when identity is on file
 *   (approving a service also verifies the person: provider-onboarding.test.js)
 */
const { startMongo, stopMongo } = require('./helpers');
const { ServiceDomain, ServiceLine, KycRequirementSet, ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
const Worker = require('../src/modules/worker/worker.model');
const service = require('../src/modules/onboarding/onboarding.service');

jest.setTimeout(60000);

const IDENTITY = [
  { code: 'aadhaar', label: 'Aadhaar card', required: true },
  { code: 'pan', label: 'PAN card', required: false },
  { code: 'selfie', label: 'Live selfie', capture: 'user', required: true },
  { code: 'address_proof', label: 'Address proof', required: true },
];

beforeAll(async () => {
  await startMongo();
  await ServiceDomain.create([{ code: 'pet_services', name: 'Pet' }, { code: 'helping_services', name: 'Helping' }]);
  await ServiceLine.create([
    { code: 'pet_walk', name: 'Pet walks', domainCode: 'pet_services', status: 'live', providerKinds: ['individual'] },
    { code: 'shopping_pickup', name: 'Shopping', domainCode: 'helping_services', status: 'live', providerKinds: ['individual'] },
  ]);
  await KycRequirementSet.create([
    { name: 'Pet', domainCode: 'pet_services', lineCode: null, providerKind: 'individual', documents: IDENTITY,
      fields: [{ code: 'experience_years', label: 'Years', required: true }] },
    { name: 'Helping', domainCode: 'helping_services', lineCode: null, providerKind: 'individual', documents: IDENTITY,
      fields: [{ code: 'can_advance_money', label: 'Front cash?', required: true }] },
  ]);
});
afterAll(stopMongo);

const owner = (w) => ({ kind: 'worker', id: w._id });

test('the old ID check counts: Aadhaar and selfie are carried, not asked again', async () => {
  const w = await Worker.create({
    name: 'Ravi', phone: '9000000801',
    kyc: { status: 'approved', aadhaarUrl: 'kyc/aadhaar.jpg', selfieUrl: 'kyc/selfie.jpg', selfieMetadata: { captureMethod: 'live_camera' } },
  });
  const e = await service.enrol({ owner: owner(w), providerKind: 'individual', lineCode: 'pet_walk' });
  const docs = Object.fromEntries(e.documents.map((d) => [d.code, d]));
  expect(docs.aadhaar).toMatchObject({ url: 'kyc/aadhaar.jpg', carried: true });
  expect(docs.selfie).toMatchObject({ url: 'kyc/selfie.jpg', carried: true, captureMethod: 'live_camera' });
});

test('one service’s identity documents carry into the next; only its own details are asked', async () => {
  const w = await Worker.create({ name: 'Sita', phone: '9000000802' });
  const pet = await service.enrol({ owner: owner(w), providerKind: 'individual', lineCode: 'pet_walk' });
  await service.saveSubmission({
    owner: owner(w), enrolmentId: pet._id,
    documents: [{ code: 'aadhaar', url: 'a.jpg' }, { code: 'selfie', url: 's.jpg', captureMethod: 'live_camera' }, { code: 'address_proof', url: 'addr.pdf' }],
    fields: [{ code: 'experience_years', value: '3' }],
  });
  await service.submitForReview({ owner: owner(w), enrolmentId: pet._id });

  const helping = await service.enrol({ owner: owner(w), providerKind: 'individual', lineCode: 'shopping_pickup' });
  expect(helping.documents.filter((d) => d.carried).map((d) => d.code).sort()).toEqual(['aadhaar', 'address_proof', 'selfie']);

  // Only the helping question is new; it submits without any upload.
  await service.saveSubmission({ owner: owner(w), enrolmentId: helping._id, fields: [{ code: 'can_advance_money', value: 'yes' }] });
  const submitted = await service.submitForReview({ owner: owner(w), enrolmentId: helping._id });
  expect(submitted.status).toBe('pending_review');
});
