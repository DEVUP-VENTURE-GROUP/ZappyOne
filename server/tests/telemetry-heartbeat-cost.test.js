// Heartbeats keep a visitor live in Redis every time but write the database at most once per 5 minutes per visit.
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let ctrl; let VisitorSession; let redis;
beforeAll(async () => {
  await startMongo();
  ctrl = require('../src/modules/telemetry/telemetry.controller');
  ({ VisitorSession } = require('../src/modules/telemetry/telemetry.model'));
  ({ redis } = require('../src/config/redis'));
});
afterAll(stopMongo);

const res = () => ({ status() { return this; }, end() {} });

test('three beats in a row: live each time, one database write', async () => {
  await redis.flushall();
  const sessionId = 'abcdef1234567890abcdef12';
  const writes = jest.spyOn(VisitorSession, 'updateOne');
  for (let i = 0; i < 3; i += 1) await ctrl.heartbeat({ body: { sessionId } }, res());
  expect(writes).toHaveBeenCalledTimes(1);
  expect(await redis.zscore(ctrl.ONLINE_KEY, sessionId)).not.toBeNull();
  expect(ctrl.ONLINE_WINDOW_MS).toBeGreaterThan(120_000);
  writes.mockRestore();
});
