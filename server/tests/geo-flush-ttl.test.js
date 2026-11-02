// A pro who only streams location (no fresh online mark) stays in the fast Redis search instead of the whole set expiring.
const { redis } = require('../src/config/redis');
const geo = require('../src/modules/worker/geo.service');

test('a batched location flush refreshes the shared sets expiry', async () => {
  const sent = [];
  const pipe = new Proxy({}, { get: (_, cmd) => (cmd === 'exec' ? async () => [] : (...args) => { sent.push([cmd, ...args]); return pipe; }) });
  jest.spyOn(redis, 'pipeline').mockReturnValue(pipe);
  await geo.updateLocation('w-moving', 78.39, 17.45);
  await geo.flushGeoBuffer();
  expect(sent).toEqual(expect.arrayContaining([
    ['geoadd', 'workers:online', 78.39, 17.45, 'w-moving'],
    ['expire', 'workers:online', 600],
    ['expire', 'workers:alive', 600],
  ]));
});
