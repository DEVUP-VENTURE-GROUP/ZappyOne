// Training: passing a module pays its bonus into the wallet ledger (what withdrawals read) exactly once, however many times the quiz is sent.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(120000);
let app; let Worker; let TrainingModule; let wallet;
let n = 0;
const auth = (w) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(w._id), role: 'worker' })}` });
const QUIZ = [{ question: 'Safe?', options: ['Yes', 'No'], correct: 0 }, { question: 'Gloves?', options: ['Yes', 'No'], correct: 0 }];
const submit = (w, mod, answers) => request(app).post(`/api/worker/training/${mod._id}/submit`).set(auth(w)).send({ answers });
const pro = () => { n += 1; return Worker.create({ name: `Trainee ${n}`, phone: `87${String(n).padStart(8, '0')}` }); };
const balance = async (w) => (await wallet.getBalance({ kind: 'worker', id: w._id })).balancePaise;

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  Worker = require('../src/modules/worker/worker.model');
  TrainingModule = require('../src/modules/worker/training.model');
  wallet = require('../src/modules/wallet/wallet.service');
  await require('../src/modules/payment/transaction.model').init();
});
afterAll(stopMongo);

test('the first pass pays the bonus into the ledger and certifies them', async () => {
  const w = await pro();
  const mod = await TrainingModule.create({ category: 'safety', description: 'How to do the job safely and well.', title: 'Electrical safety', quiz: QUIZ, passingScore: 50, bonusRupees: 100, unlockService: 'ac_repair' });
  const r = await submit(w, mod, [0, 0]);
  expect(r.body).toMatchObject({ passed: true, score: 100, bonusRupees: 100, alreadyCertified: false });
  expect(await balance(w)).toBe(10000);
  const after = await Worker.findById(w._id).lean();
  expect(after.certifications).toHaveLength(1);
  expect(after.skills).toContain('ac_repair');
});

test('ten quick submissions at once: one certificate, one bonus', async () => {
  const w = await pro();
  const mod = await TrainingModule.create({ category: 'safety', description: 'How to do the job safely and well.', title: 'Customer care', quiz: QUIZ, passingScore: 50, bonusRupees: 50 });
  const res = await Promise.all(Array.from({ length: 10 }, () => submit(w, mod, [0, 0])));
  expect(res.filter((r) => r.status >= 500)).toEqual([]);
  expect(res.filter((r) => r.body.alreadyCertified === false)).toHaveLength(1);
  expect(await balance(w)).toBe(5000);
  expect((await Worker.findById(w._id).lean()).certifications).toHaveLength(1);
});

test('passing again pays nothing more; a better score is kept, a worse one is not', async () => {
  const w = await pro();
  const mod = await TrainingModule.create({ category: 'safety', description: 'How to do the job safely and well.', title: 'Tools', quiz: QUIZ, passingScore: 50, bonusRupees: 20 });
  await submit(w, mod, [0, 1]);
  const better = await submit(w, mod, [0, 0]);
  expect(better.body).toMatchObject({ alreadyCertified: true, bonusRupees: 0 });
  expect(better.body.message).toMatch(/best score has been updated/);
  await submit(w, mod, [0, 1]);
  expect((await Worker.findById(w._id).lean()).certifications[0].score).toBe(100);
  expect(await balance(w)).toBe(2000);
});

test('failing pays nothing and certifies nothing', async () => {
  const w = await pro();
  const mod = await TrainingModule.create({ category: 'safety', description: 'How to do the job safely and well.', title: 'Hard one', quiz: QUIZ, passingScore: 100, bonusRupees: 500 });
  expect((await submit(w, mod, [1, 0])).body.passed).toBe(false);
  expect(await balance(w)).toBe(0);
  expect((await Worker.findById(w._id).lean()).certifications || []).toHaveLength(0);
});

test('a module with no bonus certifies without touching the wallet', async () => {
  const w = await pro();
  const mod = await TrainingModule.create({ category: 'safety', description: 'How to do the job safely and well.', title: 'Free module', quiz: QUIZ, passingScore: 50 });
  expect((await submit(w, mod, [0, 0])).body.passed).toBe(true);
  expect(await balance(w)).toBe(0);
});

test.each([['too few answers', [0]], ['not a list', 'A']])('%s → 400', async (_name, answers) => {
  const mod = await TrainingModule.create({ category: 'safety', description: 'How to do the job safely and well.', title: 'Shape', quiz: QUIZ });
  expect((await submit(await pro(), mod, answers)).status).toBe(400);
});

test('an inactive module cannot be passed', async () => {
  const mod = await TrainingModule.create({ category: 'safety', description: 'How to do the job safely and well.', title: 'Retired', quiz: QUIZ, isActive: false, bonusRupees: 100 });
  expect((await submit(await pro(), mod, [0, 0])).status).toBe(404);
});
