/**
 * Worker sign-up: what we ask for, and what it does NOT grant.
 *
 * Registration used to demand a skill list at the login screen, chosen from a
 * fixed set of chips. That was self-certification — ticking "screen repair"
 * made you dispatchable for it with nothing verified behind the claim. Skills
 * are no longer collected here; what a worker may do is decided by enrolling in
 * a service and passing its verification.
 *
 * These tests hold that line: registering is possible without skills, and doing
 * so grants no service access on its own.
 */

const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const { redis } = require('../src/config/redis');

const buildApp = require('../src/app');
const Worker = require('../src/modules/worker/worker.model');
const { signAccessToken } = require('../src/modules/auth/token.service');
const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
const runner = require('../src/modules/onboarding/run-onboarding-seed');

jest.setTimeout(90000);

let app;

beforeAll(async () => {
  await startMongo();
  app = buildApp();
  await runner.seedDomains();
  await runner.seedLines();
  await runner.seedRequirementSets();
});

afterAll(async () => { await stopMongo(); });
beforeEach(async () => { await redis.flushall(); });

/** Ask for an OTP and read it back — non-production echoes it in the response. */
async function otpFor(phone) {
  const res = await request(app)
    .post('/api/auth/otp/request')
    .send({ phone, role: 'worker' });
  expect(res.status).toBe(200);
  expect(res.body.otp).toBeTruthy();
  return res.body.otp;
}

describe('worker registration', () => {
  it('registers with a name alone — no skills asked for', async () => {
    const phone = '9811100001';
    const otp = await otpFor(phone);

    const res = await request(app)
      .post('/api/auth/worker/login')
      .send({ phone, otp, name: 'Imran S' });

    expect(res.status).toBe(200);
    expect(res.body.worker.name).toBe('Imran S');

    const worker = await Worker.findOne({ phone }).lean();
    expect(worker.skills).toEqual([]);
  });

  it('still refuses an anonymous account', async () => {
    const phone = '9811100002';
    const otp = await otpFor(phone);

    const res = await request(app)
      .post('/api/auth/worker/login')
      .send({ phone, otp });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WORKER_ONBOARDING_REQUIRED');
    expect(await Worker.countDocuments({ phone })).toBe(0);
  });

  it('grants no service access just by existing', async () => {
    const phone = '9811100003';
    const otp = await otpFor(phone);
    const login = await request(app)
      .post('/api/auth/worker/login')
      .send({ phone, otp, name: 'Fresh Worker' });

    const token = login.body.accessToken;
    const status = await request(app)
      .get('/api/provider/onboarding/status')
      .set('Authorization', `Bearer ${token}`);

    expect(status.status).toBe(200);
    expect(status.body.approvedLineCodes).toEqual([]);
    expect(status.body.repairVerticals).toEqual([]);
    // The dashboard should be pointing them at the only thing worth doing next.
    expect(status.body.nextStep.code).toBe('PICK_SERVICE');
  });

  it('completes the profile gate without touching skills', async () => {
    const worker = await Worker.create({ phone: '9811100004', name: 'Gate Test', skills: ['legacy_skill'] });
    const token = signAccessToken({ sub: worker._id.toString(), role: 'worker', phone: worker.phone });

    const res = await request(app)
      .post('/api/workers/onboarding/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Gate Test', emergencyContact: { name: 'Sister', phone: '9876543210' } });

    expect(res.status).toBe(200);

    const after = await Worker.findById(worker._id).lean();
    expect(after.onboardingComplete).toBe(true);
    expect(after.emergencyContact.phone).toBe('9876543210');
    // An existing worker's skills must survive a step that no longer collects them.
    expect(after.skills).toEqual(['legacy_skill']);
  });

  it('lets a registered worker enrol, and only then be approved', async () => {
    const worker = await Worker.create({ phone: '9811100005', name: 'Enrolling Worker' });
    const token = signAccessToken({ sub: worker._id.toString(), role: 'worker', phone: worker.phone });

    const enrol = await request(app)
      .post('/api/provider/onboarding/enrolments')
      .set('Authorization', `Bearer ${token}`)
      .send({ lineCode: 'mobile_repair' });

    expect(enrol.status).toBe(201);
    expect(enrol.body.enrolment.status).toBe('draft');
    expect(enrol.body.enrolment.providerKind).toBe('individual');

    // Draft is not access: nothing is approved until an admin says so.
    const row = await ProviderEnrolment.findById(enrol.body.enrolment._id).lean();
    expect(row.status).not.toBe('approved');
  });
});
