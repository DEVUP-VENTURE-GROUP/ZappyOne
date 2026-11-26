// Every job status a partner sees has Hindi and Telugu, looked up by its English words (labelKey); values fill into translated sentences.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-'));
const src = path.join(__dirname, '../../shared/src');
fs.writeFileSync(path.join(dir, 'translations.mjs'), fs.readFileSync(path.join(src, 'i18n/translations.js')));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const jobsFile = fs.readFileSync(path.join(src, 'provider/useProviderJobs.js'), 'utf8');
const stageBlock = jobsFile.slice(jobsFile.indexOf('const STAGE = {'), jobsFile.indexOf('};', jobsFile.indexOf('const STAGE = {')));
const STAGES = [...new Set([...stageBlock.matchAll(/\['([^']+)'/g)].map((m) => m[1]))];

function run(code) {
  const file = path.join(dir, 'translations.mjs').split(path.sep).join('/');
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as T from 'file:///${file}'; console.log(JSON.stringify((${code})(T)));`]).toString());
}

test('the stage list was read', () => {
  expect(STAGES.length).toBeGreaterThan(25);
});

test.each(['hi', 'te'])('every partner job status has %s', (lang) => {
  const missing = run(`(T) => ${JSON.stringify(STAGES)}.filter((s) => !T.translations['${lang}'][T.labelKey(s)])`);
  expect(missing).toEqual([]);
});

test.each(['Take this job', 'Your jobs', 'Today', 'Tomorrow', 'Reply', 'My reviews', 'Invite'])('"%s" has Hindi and Telugu', (s) => {
  expect(run(`(T) => ['hi', 'te'].map((l) => !!T.translations[l][T.labelKey(${JSON.stringify(s)})])`)).toEqual([true, true]);
});

test('values fill into a translated sentence, and an unknown one is left as it is', () => {
  expect(run("(T) => T.fillIn(T.translations.te[T.labelKey('Invite partners, earn {amount}')], { amount: '₹200' })")).toContain('₹200');
  expect(run("(T) => T.fillIn('Earn {amount} by {day}', { amount: '₹50' })")).toBe('Earn ₹50 by {day}');
});
