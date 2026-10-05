/**
 * A provider unticks work and it stays unticked: saving a smaller set removes
 * the rest within that service (and only that service), and the work list
 * read back afterwards shows exactly what was kept.
 */
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let app; let token; let Repair; let ProblemCategory; let Problem; let ProviderCapability;
const workerId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ Repair } = require('../src/modules/repair/models/repair.model'));
  ({ ProblemCategory, Problem } = require('../src/modules/repair/models/problem.model'));
  ({ ProviderCapability } = require('../src/modules/repair/models/capability.model'));
  const Worker = require('../src/modules/worker/worker.model');
  await Worker.collection.insertOne({ _id: workerId, phone: '9800000777', name: 'Ravi', isBlocked: false });
  const tokens = require('../src/modules/auth/token.service');
  token = (await tokens.issueTokenPair({ sub: String(workerId), role: 'worker' })).accessToken;

  const cat = await ProblemCategory.create({ code: 'tw_tyres', name: 'Tyres & wheels', vertical: 'two_wheeler', isActive: true });
  const repair = (code) => ({ code, name: code, vertical: 'two_wheeler', isActive: true, isArchived: false, minSkillLevel: 1, allowedServiceModes: ['doorstep'], pricingMode: 'fixed' });
  await Repair.collection.insertMany([repair('tw_tube_fix'), repair('tw_tyre_swap'), { ...repair('mb_screen'), vertical: 'mobile' }]);
  await Problem.create({ code: 'tw_puncture', name: 'Puncture', vertical: 'two_wheeler', categoryId: cat._id, categoryCode: 'tw_tyres', isActive: true, candidateRepairCodes: ['tw_tube_fix', 'tw_tyre_swap'] });
  // Phone work this worker also does: must survive a 2-wheeler save.
  await ProviderCapability.collection.insertOne({ workerId, vertical: 'mobile', repairCode: 'mb_screen', isActive: true, providerKind: 'individual' });
});
afterAll(stopMongo);

const auth = () => ({ Authorization: `Bearer ${token}` });
const save = (repairCodes) => request(app).put('/api/repair/provider/capabilities/bulk').set(auth())
  .send({ vertical: 'two_wheeler', repairCodes, candidateCodes: ['tw_tube_fix', 'tw_tyre_swap'], skillLevel: 2, serviceModes: ['doorstep'] });
const selectedNow = async () => {
  const res = await request(app).get('/api/repair/provider/work-catalog?vertical=two_wheeler').set(auth());
  return [...new Set(res.body.groups.flatMap((g) => g.repairs.filter((r) => r.selected).map((r) => r.code)))].sort();
};

test('tick two, untick one: the untick stays, phone work untouched', async () => {
  expect((await save(['tw_tube_fix', 'tw_tyre_swap'])).status).toBe(200);
  expect(await selectedNow()).toEqual(['tw_tube_fix', 'tw_tyre_swap']);

  expect((await save(['tw_tube_fix'])).status).toBe(200);
  expect(await selectedNow()).toEqual(['tw_tube_fix']);

  expect((await save([])).status).toBe(200); // untick everything
  expect(await selectedNow()).toEqual([]);
  expect(await ProviderCapability.countDocuments({ workerId, vertical: 'mobile' })).toBe(1);
});
