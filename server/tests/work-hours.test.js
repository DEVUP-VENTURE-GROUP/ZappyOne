/**
 * A worker's week (jobs/work-hours): for now, online decides; for later, the
 * hours decide (offline is fine inside them, never on a day off); no hours set
 * means no rule.
 */
const wh = require('../src/modules/jobs/work-hours');

// A moment N days ahead at an India-time hour.
function istAt(daysAhead, hour, minute = 0) {
  const now = new Date(Date.now() + 330 * 60000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead, hour, minute) - 330 * 60000);
  return d;
}
const allWeek = (from, to) => [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, on: true, from, to }));

test('no hours set: no rule — online now decides, for later too', () => {
  const later = istAt(2, 11);
  expect(wh.covers(undefined, later)).toBeNull();
  expect(wh.availableFor({}, later, { live: false })).toBe(false);
  expect(wh.availableFor({}, later, { live: true })).toBe(true);
});

test('for later: inside hours even offline; outside hours or a day off never', () => {
  const w = { workHours: { setAt: new Date(), acceptLater: true, week: allWeek('09:00', '18:00'), daysOff: [] } };
  expect(wh.availableFor(w, istAt(2, 11), { live: false })).toBe(true);
  expect(wh.availableFor(w, istAt(2, 20), { live: true })).toBe(false);
  w.workHours.daysOff = [wh.dayKey(istAt(2, 11))];
  expect(wh.availableFor(w, istAt(2, 11), { live: true })).toBe(false);
});

test('asked for later work only while online: inside hours still needs them online', () => {
  const w = { workHours: { setAt: new Date(), acceptLater: false, week: allWeek('09:00', '18:00'), daysOff: [] } };
  expect(wh.availableFor(w, istAt(2, 11), { live: false })).toBe(false);
  expect(wh.availableFor(w, istAt(2, 11), { live: true })).toBe(true);
});

test('for now: hours do not matter, online does; past-midnight shifts work', () => {
  const w = { workHours: { setAt: new Date(), week: allWeek('09:00', '18:00'), daysOff: [] } };
  expect(wh.availableFor(w, new Date(), { live: true })).toBe(true);
  const night = { setAt: new Date(), week: allWeek('20:00', '02:00'), daysOff: [] };
  expect(wh.covers(night, istAt(2, 23))).toBe(true);
  expect(wh.covers(night, istAt(2, 1))).toBe(true);
  expect(wh.covers(night, istAt(2, 12))).toBe(false);
});

test('clean: bad times fall back, past days off dropped', () => {
  const c = wh.clean({ week: [{ day: 1, on: true, from: '25:00', to: '17:30' }], daysOff: ['2000-01-01', '2999-01-01'] });
  expect(c.week).toHaveLength(7);
  expect(c.week[1]).toMatchObject({ on: true, from: '09:00', to: '17:30' });
  expect(c.daysOff).toEqual(['2999-01-01']);
});
