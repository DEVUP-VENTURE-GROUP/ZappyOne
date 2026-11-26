// A partner's jobs as a day plan (shared/src/provider/jobDays, same file on web and app): jobs now first, booked ones by day in time order.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobdays-'));
const src = path.join(__dirname, '../../shared/src');
fs.writeFileSync(path.join(dir, 'schedule.mjs'), fs.readFileSync(path.join(src, 'customer/schedule.js')));
fs.writeFileSync(path.join(dir, 'jobDays.mjs'), fs.readFileSync(path.join(src, 'provider/jobDays.js'), 'utf8').replace("'../customer/schedule'", "'./schedule.mjs'"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

function plan(jobs, now) {
  const file = path.join(dir, 'jobDays.mjs').split(path.sep).join('/');
  const code = `import { jobDays } from 'file:///${file}'; console.log(JSON.stringify(jobDays(${JSON.stringify(jobs)}, ${now})));`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: 'Asia/Kolkata' } }).toString());
}

const now = new Date('2026-11-26T10:00:00+05:30').getTime();
const at = (iso) => new Date(iso).toISOString();
const shape = (groups) => groups.map((g) => [g.title, g.jobs.map((j) => j.id)]);

test('a job for now, two today later and one tomorrow', () => {
  const groups = plan([
    { id: 'tom', scheduledAt: at('2026-11-27T09:00:00+05:30') },
    { id: 'pm', scheduledAt: at('2026-11-26T17:00:00+05:30') },
    { id: 'live', scheduledAt: null },
    { id: 'noon', scheduledAt: at('2026-11-26T12:30:00+05:30') },
  ], now);
  expect(shape(groups)).toEqual([['Now', ['live']], ['Today', ['noon', 'pm']], ['Tomorrow', ['tom']]]);
  expect(groups[1].jobs[0].time).toMatch(/12:30/);
  expect(groups[0].jobs[0].time).toBeNull();
});

test('a booked time already passed stays in Now with its time', () => {
  const groups = plan([{ id: 'late', scheduledAt: at('2026-11-26T08:00:00+05:30') }], now);
  expect(shape(groups)).toEqual([['Now', ['late']]]);
  expect(groups[0].jobs[0].time).toMatch(/8:00/);
});

test('a later day is named, and empty input gives nothing', () => {
  expect(plan([{ id: 'x', scheduledAt: at('2026-11-30T10:00:00+05:30') }], now)[0].title).toMatch(/Monday/);
  expect(plan([], now)).toEqual([]);
});
