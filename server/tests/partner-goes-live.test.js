// Partners list directly: an ID-verified partner goes live on a service the moment they submit, a complete new-service request opens live
// with their cover photo, and admin reviews afterwards. The ID check itself, safety-critical services and duplicates still wait for admin.
const { startMongo, stopMongo } = require('./helpers');
const { ServiceDomain, ServiceLine, KycRequirementSet, ServiceLineRequest } = require('../src/modules/onboarding/onboarding.model');
const Worker = require('../src/modules/worker/worker.model');
const service = require('../src/modules/onboarding/onboarding.service');

jest.setTimeout(90000);
const ID = [{ code: 'aadhaar', label: 'Aadhaar card', required: true }];
const owner = (w) => ({ kind: 'worker', id: w._id });
const verified = (phone) => Worker.create({ name: 'Ravi', phone, kyc: { status: 'approved', aadhaarUrl: 'kyc/a.jpg' } });

beforeAll(async () => {
  await startMongo();
  await ServiceDomain.create([{ code: 'pet_services', name: 'Pet' }, { code: 'tutors', name: 'Tutors' }]);
  await ServiceLine.create([
    { code: 'pet_walk', name: 'Pet walks', domainCode: 'pet_services', status: 'live', providerKinds: ['individual'] },
    { code: 'pet_boarding', name: 'Pet boarding', domainCode: 'pet_services', status: 'live', providerKinds: ['individual'] },
    { code: 'yoga_home', name: 'Yoga at home', domainCode: 'tutors', status: 'live', providerKinds: ['individual'] },
  ]);
  await KycRequirementSet.create([
    { name: 'Walks', domainCode: 'pet_services', lineCode: 'pet_walk', providerKind: 'individual', documents: ID },
    { name: 'Boarding', domainCode: 'pet_services', lineCode: 'pet_boarding', providerKind: 'individual', documents: ID, manualReview: true },
  ]);
});
afterAll(stopMongo);

const submit = async (w, lineCode) => {
  const e = await service.enrol({ owner: owner(w), providerKind: 'individual', lineCode });
  return service.submitForReview({ owner: owner(w), enrolmentId: e._id });
};

test('an ID-verified pro is live on a service at submit; without a verified ID, or where admin checks each one, it waits', async () => {
  expect((await submit(await verified('9000000991'), 'pet_walk')).status).toBe('approved');
  expect((await submit(await verified('9000000992'), 'pet_boarding')).status).toBe('pending_review');
  const fresh = await Worker.create({ name: 'Sita', phone: '9000000993' });
  await service.enrol({ owner: owner(fresh), providerKind: 'individual', lineCode: 'pet_walk' })
    .then((e) => service.saveSubmission({ owner: owner(fresh), enrolmentId: e._id, documents: [{ code: 'aadhaar', url: 'a.jpg' }] }))
    .then((e) => service.submitForReview({ owner: owner(fresh), enrolmentId: e._id }))
    .then((e) => expect(e.status).toBe('pending_review'));
});

test('a complete new service opens live with the partner cover; a duplicate name or one without jobs waits for admin, with the reason', async () => {
  const w = await verified('9000000994');
  const ask = (extra) => service.requestLine({ owner: { kind: 'worker', id: w._id }, providerKind: 'individual', domainCode: 'tutors', description: 'Salsa and bachata for beginners at home', photos: ['line-requests/cover.jpg', 'line-requests/two.jpg'], packages: [{ name: 'One class', minutes: 60, pricePaise: 49900 }], ...extra });

  const opened = await ask({ proposedName: 'Salsa classes' });
  expect(opened.opened).toMatchObject({ name: 'Salsa classes' });
  const line = await ServiceLine.findOne({ code: opened.opened.code }).lean();
  expect(line).toMatchObject({ status: 'live', imageUrl: 'line-requests/cover.jpg' });
  expect((await ServiceLineRequest.findById(opened.request._id).lean()).status).toBe('approved');

  const dup = await ask({ proposedName: 'Yoga at home' });
  expect(dup.opened).toBeUndefined();
  expect(dup.warnings.map((x) => x.code)).toContain('DUPLICATE');
  const noJobs = await ask({ proposedName: 'Zumba', packages: [] });
  expect(noJobs.warnings.map((x) => x.code)).toContain('NO_JOBS');
  expect((await ServiceLineRequest.findById(noJobs.request._id).lean()).status).toBe('pending');
});
