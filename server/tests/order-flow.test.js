require('./env');
const request = require('supertest');
const { startMongo, stopMongo, resetDb } = require('./helpers');
const { redis } = require('../src/config/redis');

const buildApp = require('../src/app');
const User = require('../src/modules/user/user.model');
const Worker = require('../src/modules/worker/worker.model');
const ServiceCatalog = require('../src/modules/service/service-catalog.model');
const { signAccessToken } = require('../src/modules/auth/token.service');

let app;

// Mirror production: every live service has a catalog entry with a fixed
// servicePricePaise, which switches the pricing engine to the ADDITIVE model
// (service price + travel + platform). puncture is seeded at ₹120 in prod
// (see scripts/seed-service-prices.js), so the quote must reflect that — not
// the bare vehicle-path fallback that only appears when no catalog exists.
async function seedPunctureCatalog() {
  await ServiceCatalog.create({
    code: 'puncture',
    name: 'Bike Puncture',
    category: 'vehicle',
    servicePricePaise: 12000,      // ₹120 fixed job rate
    priceRangeMinPaise: 10000,     // ₹100
    priceRangeMaxPaise: 30000,     // ₹300 safety ceiling
    requiredSkills: ['puncture'],
  });
}

beforeAll(async () => {
  await startMongo();
  app = buildApp();
});
afterAll(async () => { await stopMongo(); });
beforeEach(async () => { await resetDb(); await redis.flushall(); });

async function setupUserAndWorker() {
  const user = await User.create({ phone: '9876543210', name: 'Test User' });
  const worker = await Worker.create({
    phone: '8876543210',
    name: 'Test Worker',
    skills: ['puncture'],
    isOnline: true,
    isAvailable: true,
    currentLocation: { type: 'Point', coordinates: [78.40, 17.40], updatedAt: new Date() },
    kyc: { status: 'approved', aadhaarUrl: 'x', selfieUrl: 'x' },
  });
  const userToken = signAccessToken({ sub: user._id.toString(), role: 'user', phone: user.phone });
  const workerToken = signAccessToken({ sub: worker._id.toString(), role: 'worker', phone: worker.phone });
  return { user, worker, userToken, workerToken };
}

describe('POST /api/orders — input validation + access control', () => {
  test('rejects unauthenticated request', async () => {
    const res = await request(app).post('/api/orders').send({});
    expect(res.status).toBe(401);
  });

  test('rejects malformed payload (missing service)', async () => {
    const { userToken } = await setupUserAndWorker();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        pickupLocation: { lat: 17.4, lng: 78.4, address: 'Somewhere' },
      });
    expect(res.status).toBe(400);
    // validate middleware responds with { error: 'Validation failed', details }.
    expect(res.body.error).toBeTruthy();
  });

  test('rejects NoSQL injection attempts (sanitizer strips $ keys)', async () => {
    const { userToken } = await setupUserAndWorker();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        service: 'puncture',
        // $ keys should be stripped before Joi sees them
        pickupLocation: { $ne: null, lat: 17.4, lng: 78.4, address: 'Somewhere' },
      });
    // The $ne is stripped; the remaining payload is a valid locationSchema.
    // Order creation should succeed (201), not accidentally query with {$ne: null}.
    expect([201, 409, 429]).toContain(res.status);
  });
});

describe('worker KYC gate', () => {
  test('unapproved worker cannot go online', async () => {
    const worker = await Worker.create({
      phone: '7776543210',
      name: 'Unapproved',
      skills: ['puncture'],
      kyc: { status: 'not_submitted' },
    });
    const token = signAccessToken({ sub: worker._id.toString(), role: 'worker' });
    const res = await request(app)
      .post('/api/workers/online')
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: 17.4, lng: 78.4 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('KYC_NOT_APPROVED');
  });
});

describe('quote + order creation happy path', () => {
  test('order creates with correct pricing snapshot', async () => {
    const { userToken } = await setupUserAndWorker();
    await seedPunctureCatalog();

    const q = await request(app)
      .get('/api/orders/quote')
      .set('Authorization', `Bearer ${userToken}`)
      .query({ service: 'puncture', pickupLat: 17.4, pickupLng: 78.4 });
    expect(q.status).toBe(200);
    // Additive model must engage: total = ₹120 service price + travel + platform,
    // so it can never drop below the fixed service price.
    expect(q.body.quote.pricingModel).toBe('additive');
    expect(q.body.quote.total).toBeGreaterThanOrEqual(120);

    const create = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        service: 'puncture',
        description: 'bike tyre flat',
        pickupLocation: { lat: 17.4, lng: 78.4, address: 'Test road' },
      });
    expect(create.status).toBe(201);
    expect(create.body.order.status).toBe('created');
    expect(create.body.order.pricing.total).toBeGreaterThan(0);
  });

  test('second order while one is active returns 409 with activeOrderId', async () => {
    const { userToken } = await setupUserAndWorker();
    await request(app)
      .post('/api/orders').set('Authorization', `Bearer ${userToken}`)
      .send({
        service: 'puncture',
        pickupLocation: { lat: 17.4, lng: 78.4, address: 'A' },
      });
    const res = await request(app)
      .post('/api/orders').set('Authorization', `Bearer ${userToken}`)
      .send({
        service: 'puncture',
        pickupLocation: { lat: 17.4, lng: 78.4, address: 'A' },
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACTIVE_ORDER_EXISTS');
    expect(res.body.activeOrderId).toBeTruthy();
  });
});
