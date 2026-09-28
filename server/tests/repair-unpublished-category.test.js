/**
 * Unpublishing a category (admin → Categories → Active off) must hide it
 * everywhere a customer can reach it: the category list, the "popular" strip,
 * and a direct booking by problem code. Vehicles launch roadside-only, so the
 * heavy categories ship unpublished.
 */

const { startMongo, stopMongo } = require('./helpers');
const { ProblemCategory, Problem } = require('../src/modules/repair/models/problem.model');
const { listProblems } = require('../src/modules/repair/controllers/catalog.controller');
const bookingService = require('../src/modules/repair/services/booking.service');
const tw = require('../src/modules/repair/seed/two-wheeler.seed');
const fw = require('../src/modules/repair/seed/four-wheeler.seed');

jest.setTimeout(60000);
const V = 'two_wheeler';

beforeAll(async () => {
  await startMongo();
  const [breakdown, cvt] = await ProblemCategory.insertMany([
    { vertical: V, code: 'tw_breakdown', name: 'Breakdown' },
    { vertical: V, code: 'tw_cvt', name: 'CVT', isActive: false },
  ]);
  await Problem.insertMany([
    { vertical: V, code: 'tw_wont_start', name: "Won't start", categoryId: breakdown._id, categoryCode: 'tw_breakdown', isPopular: true },
    { vertical: V, code: 'tw_cvt_belt_issue', name: 'CVT belt issue', categoryId: cvt._id, categoryCode: 'tw_cvt', isPopular: true },
  ]);
});
afterAll(stopMongo);

async function customerList() {
  let body;
  await listProblems({ query: { vertical: V } }, { json: (b) => { body = b; } }, (e) => { throw e; });
  return body;
}

test('an unpublished category and its problems are hidden, including from popular', async () => {
  const { categories, popular } = await customerList();
  expect(categories.map((c) => c.code)).toEqual(['tw_breakdown']);
  expect(popular.map((p) => p.code)).toEqual(['tw_wont_start']);
});

test('a problem in an unpublished category cannot be booked directly', async () => {
  await expect(bookingService.createBooking({
    userId: '64b000000000000000000001', vertical: V, problemCodes: ['tw_cvt_belt_issue'],
    location: { type: 'Point', coordinates: [78.4, 17.4], address: 'Road No. 1' },
  })).rejects.toMatchObject({ code: 'PROBLEM_UNAVAILABLE' });
});

test('re-publishing brings it back without any other change', async () => {
  await ProblemCategory.updateOne({ vertical: V, code: 'tw_cvt' }, { $set: { isActive: true } });
  const { popular } = await customerList();
  expect(popular.map((p) => p.code).sort()).toEqual(['tw_cvt_belt_issue', 'tw_wont_start']);
});

test('vehicles ship roadside-first: heavy categories are seeded unpublished', () => {
  const hidden = (s) => s.PROBLEM_CATEGORIES.filter((c) => c.isActive === false).map((c) => c.code).sort();
  expect(hidden(tw)).toEqual(['tw_body', 'tw_cvt', 'tw_fuel', 'tw_lights_controls', 'tw_suspension_steering']);
  expect(hidden(fw)).toEqual(['fw_adas', 'fw_suspension']);
});
