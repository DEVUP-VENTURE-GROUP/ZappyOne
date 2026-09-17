/**
 * "My things" — a customer's saved tank/phone/vehicle (§27, §34).
 *
 * What this suite exists to prove:
 *
 *   1. IT IS PRIVATE. One customer must never read, edit or delete another
 *      customer's saved asset by guessing an id (§37, IDOR).
 *
 *   2. HISTORY IS DERIVED, NOT STORED. The service history shown for an asset
 *      is a live query over that customer's own completed bookings, so it can
 *      never drift from what actually happened.
 *
 *   3. DELETE MEANS ARCHIVE. A removed asset stops appearing in the list, but
 *      it is never actually deleted — a booking may still reference it.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');
const buildApp = require('../src/app');

const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { CustomerAsset } = require('../src/modules/repair/models/customer-asset.model');
const Brand = require('../src/modules/service/brand.model');

jest.setTimeout(60000);

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let app;
const ctx = {};

beforeAll(async () => {
  await startMongo();
  app = buildApp();

  ctx.userId = new mongoose.Types.ObjectId();
  ctx.otherUserId = new mongoose.Types.ObjectId();
  ctx.token = signAccessToken({ sub: ctx.userId.toString(), role: 'user' });
  ctx.otherToken = signAccessToken({ sub: ctx.otherUserId.toString(), role: 'user' });

  await Brand.create({ code: 'overhead', name: 'Overhead Tank', category: 'water_tank_care' });
});

afterAll(async () => { await stopMongo(); });

const create = (token, body) => request(app).post('/api/repair/assets').set(auth(token)).send(body);

describe('creating and listing', () => {
  it('creates an asset and returns it with a real brand name attached', async () => {
    const res = await create(ctx.token, {
      vertical: 'water_tank_care', brandCode: 'overhead', label: 'Terrace tank',
    });
    expect(res.status).toBe(201);
    expect(res.body.asset.userId).toBe(String(ctx.userId));

    const list = await request(app).get('/api/repair/assets').set(auth(ctx.token));
    expect(list.body.assets).toHaveLength(1);
    expect(list.body.assets[0].brandName).toBe('Overhead Tank');
    expect(list.body.assets[0].label).toBe('Terrace tank');
  });

  it('never lists another customer\'s asset', async () => {
    const mine = await request(app).get('/api/repair/assets').set(auth(ctx.otherToken));
    expect(mine.body.assets).toHaveLength(0);
  });
});

describe('object-level authorisation (IDOR)', () => {
  it('refuses to edit another customer\'s asset', async () => {
    const asset = await CustomerAsset.create({
      userId: ctx.userId, vertical: 'water_tank_care', brandCode: 'overhead', label: 'Mine',
    });
    const res = await request(app)
      .patch(`/api/repair/assets/${asset._id}`)
      .set(auth(ctx.otherToken))
      .send({ label: 'Hijacked' });
    expect(res.status).toBe(404);

    const untouched = await CustomerAsset.findById(asset._id).lean();
    expect(untouched.label).toBe('Mine');
  });

  it('refuses to delete another customer\'s asset', async () => {
    const asset = await CustomerAsset.create({
      userId: ctx.userId, vertical: 'water_tank_care', brandCode: 'overhead', label: 'Mine 2',
    });
    const res = await request(app)
      .delete(`/api/repair/assets/${asset._id}`)
      .set(auth(ctx.otherToken));
    expect(res.status).toBe(404);

    const stillThere = await CustomerAsset.findById(asset._id).lean();
    expect(stillThere.isArchived).toBe(false);
  });

  it('refuses another customer\'s history request', async () => {
    const asset = await CustomerAsset.create({
      userId: ctx.userId, vertical: 'water_tank_care', brandCode: 'overhead', label: 'Mine 3',
    });
    const res = await request(app)
      .get(`/api/repair/assets/${asset._id}/history`)
      .set(auth(ctx.otherToken));
    expect(res.status).toBe(404);
  });
});

describe('delete archives, never destroys', () => {
  it('removes an archived asset from the list without deleting the row', async () => {
    const asset = await CustomerAsset.create({
      userId: ctx.userId, vertical: 'water_tank_care', brandCode: 'overhead', label: 'To remove',
    });
    const del = await request(app).delete(`/api/repair/assets/${asset._id}`).set(auth(ctx.token));
    expect(del.status).toBe(200);

    const list = await request(app).get('/api/repair/assets').set(auth(ctx.token));
    expect(list.body.assets.some((a) => a._id === String(asset._id))).toBe(false);

    const row = await CustomerAsset.findById(asset._id).lean();
    expect(row).not.toBeNull();
    expect(row.isArchived).toBe(true);
  });
});

describe('service history is derived from real bookings, never stored', () => {
  it('shows a completed booking against the matching asset', async () => {
    const asset = await CustomerAsset.create({
      userId: ctx.userId, vertical: 'water_tank_care', brandCode: 'overhead',
      modelCode: 'overhead-up-to-500-l', label: 'History tank',
    });

    await RepairBooking.create({
      reference: `H${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      userId: ctx.userId, vertical: 'water_tank_care',
      brandCode: 'overhead', modelCode: 'overhead-up-to-500-l',
      serviceMode: 'doorstep', status: 'COMPLETED', repairCode: 'wt_deep_cleaning',
      location: { type: 'Point', coordinates: [78.4, 17.4], address: 'Test' },
      priceSnapshot: { subtotalPaise: 50000, totalPaise: 50000 },
      completedAt: new Date(),
    });

    const res = await request(app)
      .get(`/api/repair/assets/${asset._id}/history`)
      .set(auth(ctx.token));
    expect(res.status).toBe(200);
    expect(res.body.bookings).toHaveLength(1);
    expect(res.body.bookings[0].repairCode).toBe('wt_deep_cleaning');
  });

  it('does not mix a booking on a different capacity into this asset\'s history', async () => {
    // Distinct capacity codes from every other test in this file — the point
    // is isolation, so nothing here may collide with an earlier test's
    // leftover booking.
    const asset = await CustomerAsset.create({
      userId: ctx.userId, vertical: 'water_tank_care', brandCode: 'overhead',
      modelCode: 'overhead-5000-10000-l', label: 'Isolated',
    });
    await RepairBooking.create({
      reference: `X${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      userId: ctx.userId, vertical: 'water_tank_care',
      brandCode: 'overhead', modelCode: 'overhead-10000-plus-l', // different capacity
      serviceMode: 'doorstep', status: 'COMPLETED', repairCode: 'wt_deep_cleaning',
      location: { type: 'Point', coordinates: [78.4, 17.4], address: 'Test' },
      priceSnapshot: { subtotalPaise: 50000, totalPaise: 50000 },
      completedAt: new Date(),
    });

    const res = await request(app)
      .get(`/api/repair/assets/${asset._id}/history`)
      .set(auth(ctx.token));
    expect(res.body.bookings).toHaveLength(0);
  });
});
