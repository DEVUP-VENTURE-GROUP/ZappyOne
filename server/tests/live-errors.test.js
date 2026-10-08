/**
 * Live errors (telemetry/errors): the same fault groups into one issue with
 * who it happened to; a resolved issue that happens again reopens; the plan
 * and messages to the people affected work.
 */
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let errors;

beforeAll(async () => {
  await startMongo();
  errors = require('../src/modules/telemetry/errors.service');
});
afterAll(stopMongo);

test('who comes from a verified token only (expired still names them), never from a forged one', () => {
  const sub = String(new mongoose.Types.ObjectId());
  const secret = require('../src/config').jwt.secret;
  expect(errors.whoFrom(jwt.sign({ sub, role: 'worker' }, secret, { expiresIn: -10 }))).toEqual({ role: 'worker', userId: sub });
  expect(errors.whoFrom(jwt.sign({ sub, role: 'worker' }, 'not-our-secret'))).toEqual({ role: 'guest', userId: null });
  expect(errors.whoFrom(null)).toEqual({ role: 'guest', userId: null });
});

test('one fault, many bookings and people: one issue, counted, with roles and people', async () => {
  const a = new mongoose.Types.ObjectId(); const b = new mongoose.Types.ObjectId();
  for (const [id, who] of [['6a1b2c3d4e5f6a7b8c9d0e1f', a], ['6a1b2c3d4e5f6a7b8c9d0e2f', b], ['6a1b2c3d4e5f6a7b8c9d0e3f', a]]) {
    await errors.record({ kind: 'api', app: 'zappyone', role: 'user', userId: who, message: `Booking ${id} not found`, api: { method: 'GET', url: `/repair/bookings/${id}`, status: 500 } });
  }
  await errors.record({ kind: 'crash', app: 'rakshak', role: 'worker', userId: b, message: 'x is undefined', path: '/worker/repair/6a1b2c3d4e5f6a7b8c9d0e1f' });

  const list = await errors.issues({ status: 'active' });
  const api = list.find((i) => i.kind === 'api');
  expect(api).toMatchObject({ count: 3, peopleCount: 2, roles: ['user'], where: 'GET /repair/bookings/:id' });
  expect(list).toHaveLength(2);
  const live = await errors.live({ role: 'worker' });
  expect(live).toHaveLength(1);
  expect((await errors.pulse()).lastHour).toBe(4);
});

test('plan, resolve, come back; message everyone affected', async () => {
  const [issue] = await errors.issues({ kind: 'api' });
  await errors.plan(issue._id, { status: 'resolved', priority: 'P0', owner: 'Faizan', steps: '1. fix lookup' }, 'Ops');
  const user = new mongoose.Types.ObjectId();
  await errors.record({ kind: 'api', app: 'zappyone', role: 'user', userId: user, message: 'Booking 6a1b2c3d4e5f6a7b8c9d0e9f not found', api: { method: 'GET', url: '/repair/bookings/6a1b2c3d4e5f6a7b8c9d0e9f', status: 500 } });
  const again = await errors.issue(issue._id);
  expect(again).toMatchObject({ status: 'open', cameBack: true, plan: { priority: 'P0', owner: 'Faizan' } });

  const r = await errors.message(issue._id, { to: 'all', title: 'Fixed', body: 'Please try again.' }, 'Ops');
  expect(r.sent).toBe(3);
});
