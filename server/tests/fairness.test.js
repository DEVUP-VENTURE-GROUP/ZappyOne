// Fair dispatch (jobs/fairness): within the arrival promise the fewest jobs today wins, then the longest idle; beyond it, the nearest; staff first.
const { fairOrder, statsOf, istDay } = require('../src/modules/jobs/fairness');

const today = istDay();
const c = (id, km, jobs = 0, lastAt = 0, extra = {}) => ({ id, kind: 'worker', km, stats: { jobsToday: jobs, lastAt }, ...extra });
const ids = (list) => list.map((x) => x.id);

test('within the promise, the fewest jobs today wins over the nearest', () => {
  expect(ids(fairOrder([c('busy', 0.3, 6), c('new', 2, 0)]))).toEqual(['new', 'busy']);
});

test('equal jobs: whoever has waited longest since their last job', () => {
  expect(ids(fairOrder([c('recent', 1, 2, Date.now()), c('waiting', 2, 2, Date.now() - 3600000)]))).toEqual(['waiting', 'recent']);
});

test('someone who just started (no job yet) is first among equals', () => {
  expect(ids(fairOrder([c('veteran', 1, 1, Date.now() - 60000), c('starter', 1.5, 0, 0)]))).toEqual(['starter', 'veteran']);
});

test('anyone who can make the promise beats anyone who cannot, however few jobs they have had', () => {
  expect(ids(fairOrder([c('far', 9, 0), c('near', 1, 5)]))).toEqual(['near', 'far']);
});

test('beyond the promise, the nearest', () => {
  expect(ids(fairOrder([c('farther', 12, 0), c('far', 8, 9)]))).toEqual(['far', 'farther']);
});

test('a longer promise widens who counts as close', () => {
  expect(ids(fairOrder([c('busy', 1, 5), c('idle', 6, 0)], { promiseMin: 10 }))).toEqual(['busy', 'idle']);
  expect(ids(fairOrder([c('busy', 1, 5), c('idle', 6, 0)], { promiseMin: 25 }))).toEqual(['idle', 'busy']);
});

test('staff on duty stay first', () => {
  expect(ids(fairOrder([c('partner', 0.5, 0), c('staff', 3, 4, 0, { staff: true })]))).toEqual(['staff', 'partner']);
});

test('yesterday’s count does not carry over', () => {
  expect(statsOf({ dispatchStats: { day: '2000-01-01', jobs: 9, lastAt: new Date() } }).jobsToday).toBe(0);
  expect(statsOf({ dispatchStats: { day: today, jobs: 3 } }).jobsToday).toBe(3);
});

test('a thousand candidates rank quickly', () => {
  const many = Array.from({ length: 1000 }, (_, i) => c(String(i), (i % 50) / 5, i % 7, i));
  const t = Date.now();
  fairOrder(many);
  expect(Date.now() - t).toBeLessThan(50);
});
