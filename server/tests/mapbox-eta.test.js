// Arrival times come from Mapbox driving-with-traffic in one call; any failure falls back to the road estimate, never a blank.
const arrival = require('../src/modules/jobs/arrival');
const mapbox = require('../src/modules/maps/mapbox.service');

const door = { lat: 17.4474, lng: 78.3762 };
const pro = { lat: 17.4600, lng: 78.3600 };
let env;
beforeEach(() => { env = { ...process.env }; process.env.NODE_ENV = 'production'; process.env.MAPBOX_TOKEN = 'pk.test'; });
afterEach(() => { process.env = env; jest.restoreAllMocks(); });

test('one matrix call routes several pros to the door', async () => {
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ durations: [[420], [null]], distances: [[2500], [null]] }) });
  const out = await mapbox.driveTimes([pro, { lat: 17.5, lng: 78.4 }], door);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toContain('/driving-traffic/78.36000,17.46000;78.40000,17.50000;78.37620,17.44740?sources=0;1&destinations=2');
  expect(out).toEqual([{ minutes: 7, km: 2.5 }, null]);
});

test('travel uses Mapbox traffic time, and the road estimate when Mapbox fails', async () => {
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true, json: async () => ({ durations: [[540], [0]], distances: [[3100], [0]] }) });
  expect(await arrival.travel(pro, door)).toEqual({ minutes: 9, km: 3.1, source: 'traffic' });
  expect(fetch.mock.calls[0][0]).toContain('?sources=0;1&destinations=1');

  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
  const far = { lat: 17.4700, lng: 78.3500 };
  expect((await arrival.travel(far, door)).source).toBe('estimate');
});
