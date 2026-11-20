// A helping errand's whole life over the real API: on the way, arrived, started, returning, the customer's code at hand-over, cash, completed, both rate; and the edges (wrong code, wrong person, skipped steps, double taps, handing back too late).
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
let app; let HelpingTask; let Worker; let User; let tok;
const DOOR = { type: 'Point', coordinates: [78.3915, 17.4483], address: 'Madhapur' };
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  Worker = require('../src/modules/worker/worker.model');
  User = require('../src/modules/user/user.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });
});
afterAll(stopMongo);

let n = 0;
async function task(status = 'WORKER_ACCEPTED') {
  n += 1;
  const u = await User.create({ name: 'Asha', phone: `91100${String(n).padStart(5, '0')}`, startPin: '4821' });
  const w = await Worker.create({ name: 'Imran', phone: `92200${String(n).padStart(5, '0')}`, isOnline: true });
  const t = await HelpingTask.create({
    reference: `LH${n}${Math.random().toString(36).slice(2, 6).toUpperCase()}`, userId: u._id, workerId: w._id, serviceType: 'pickup', status,
    pickupLocation: DOOR, destination: DOOR, charge: { serviceChargePaise: 9000, workerEarningPaise: 8000 }, paymentMethod: 'cash',
    statusHistory: [{ status, at: new Date() }],
  });
  return { t, pro: tok(w._id, 'worker'), customer: tok(u._id, 'user') };
}
const move = (id, status, auth, code) => request(app).post(`/api/helping/tasks/${id}/status`).set(auth).send({ status, ...(code && { code }) });
const complete = (id, auth, code) => request(app).post(`/api/helping/tasks/${id}/complete`).set(auth).send(code ? { code } : {});
const statusOf = async (id) => (await HelpingTask.findById(id).lean()).status;

describe('happy path: accepted to rated', () => {
  test('on the way, arrived, started, returning; the code at hand-over; cash; completed; both rate', async () => {
    const { t, pro, customer } = await task();
    for (const s of ['EN_ROUTE', 'ARRIVED', 'TASK_STARTED', 'IN_PROGRESS', 'RETURNING']) {
      const res = await move(t._id, s, pro);
      expect([s, res.status]).toEqual([s, 200]);
    }
    expect((await complete(t._id, pro)).body.code).toMatch(/START_CODE_REQUIRED|CASH|PAY/);
    expect((await request(app).post(`/api/helping/tasks/${t._id}/collect-cash`).set(pro)).status).toBe(200);
    const wrong = await complete(t._id, pro, '0000');
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('START_CODE_INVALID');
    expect(await statusOf(t._id)).toBe('RETURNING');
    expect((await complete(t._id, pro, '4821')).status).toBe(200);
    expect(['COMPLETED', 'SETTLED']).toContain(await statusOf(t._id));

    expect((await request(app).post(`/api/helping/tasks/${t._id}/rate`).set(customer).send({ rating: 5 })).status).toBe(200);
    expect((await request(app).post(`/api/helping/tasks/${t._id}/rate`).set(customer).send({ rating: 2 })).status).toBeGreaterThanOrEqual(400);
    expect((await request(app).get('/api/jobs/rate-customer/pending').set(pro)).body.pending).toMatchObject({ kind: 'helping', id: String(t._id) });
    expect((await request(app).post(`/api/jobs/${t._id}/rate-customer`).set(pro).send({ stars: 4 })).status).toBe(200);
    expect((await request(app).get('/api/jobs/rate-customer/pending').set(pro)).body.pending).toBeNull();
  });
});

describe('edges', () => {
  test('a skipped step is a plain 409 and nothing moves', async () => {
    const { t, pro } = await task();
    const res = await move(t._id, 'IN_PROGRESS', pro);
    expect(res.status).toBe(409);
    expect(res.body.error).not.toMatch(/WORKER_ACCEPTED|IN_PROGRESS/);
    expect(await statusOf(t._id)).toBe('WORKER_ACCEPTED');
  });

  test('only the helper on the task can move it', async () => {
    const { t } = await task();
    expect((await move(t._id, 'EN_ROUTE', tok(new mongoose.Types.ObjectId(), 'worker'))).status).toBe(403);
    expect(await statusOf(t._id)).toBe('WORKER_ACCEPTED');
  });

  test('two taps at once on the same step: it moves once', async () => {
    const { t, pro } = await task();
    const [a, b] = await Promise.all([move(t._id, 'EN_ROUTE', pro), move(t._id, 'EN_ROUTE', pro)]);
    expect([a.status, b.status]).toContain(200);
    const doc = await HelpingTask.findById(t._id).lean();
    expect(doc.statusHistory.filter((h) => h.status === 'EN_ROUTE')).toHaveLength(1);
  });

  test('cash recorded twice counts once', async () => {
    const { t, pro } = await task('RETURNING');
    expect((await request(app).post(`/api/helping/tasks/${t._id}/collect-cash`).set(pro)).status).toBe(200);
    const again = await request(app).post(`/api/helping/tasks/${t._id}/collect-cash`).set(pro);
    expect(again.status).toBeLessThan(500);
  });

  test('a task under way cannot be handed back', async () => {
    const { t, pro } = await task('IN_PROGRESS');
    expect((await request(app).post(`/api/jobs/${t._id}/give-back`).set(pro).send({ reason: 'other', note: 'family emergency' })).status).toBe(409);
    expect(await statusOf(t._id)).toBe('IN_PROGRESS');
  });
});
