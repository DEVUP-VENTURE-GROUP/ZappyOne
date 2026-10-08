/**
 * Who may be offered a new job: free workers, and workers on the last stretch
 * of a job with room for one more; mid-job workers are "busy" (offered only
 * when nobody free is near); workers at the cap are not offered at all.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let workload; let HelpingTask;
const oid = () => new mongoose.Types.ObjectId();
const HERE = { type: 'Point', coordinates: [78.39, 17.44], address: 'x' };

beforeAll(async () => {
  await startMongo();
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  workload = require('../src/modules/jobs/workload');
});
afterAll(stopMongo);

const task = (workerId, status) => HelpingTask.collection.insertOne({
  reference: `W${Math.random()}`, userId: oid(), workerId, serviceType: 'pickup', status, pickupLocation: HERE, destination: HERE, updatedAt: new Date(),
});

test('free, finishing, busy and full are told apart', async () => {
  const idle = oid(); const finishing = oid(); const midway = oid(); const full = oid();
  await task(finishing, 'RETURNING');
  await task(midway, 'IN_PROGRESS');
  await task(full, 'IN_PROGRESS'); await task(full, 'EN_ROUTE');
  const { free, busy } = await workload.classify([idle, finishing, midway, full]);
  expect([...free].sort()).toEqual([String(idle), String(finishing)].sort());
  expect([...busy]).toEqual([String(midway)]);
  await expect(workload.assertCanTakeAnother(full)).rejects.toMatchObject({ code: 'TOO_MANY_JOBS' });
  await expect(workload.assertCanTakeAnother(midway)).resolves.toBeUndefined();
});
