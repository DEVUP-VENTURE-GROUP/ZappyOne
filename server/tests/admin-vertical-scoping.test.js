/**
 * The admin console must report one vertical at a time.
 *
 * Reported from production: the Mobile and Laptop consoles showed the SAME
 * revenue, and a booking taken on a phone appeared in the laptop list. Both had
 * the same cause — `listHandler` destructured `vertical` out of the query and
 * then never re-applied it, and the dashboard aggregation carried no scope at
 * all. Every list and every counter therefore returned the sum of all verticals,
 * displayed on each screen as if it belonged to that one.
 *
 * That is worse than a wrong number: an operator deciding where to spend on
 * supply was reading laptop demand as mobile demand.
 *
 * The subtlety that makes this easy to get wrong twice: mobile rows predate the
 * `vertical` field, so scoping with a plain `{ vertical: 'mobile' }` equality
 * hides every legacy booking and reports mobile revenue as near zero. The fix
 * has to use `verticalFilter`, and the legacy case is asserted below.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');
const buildApp = require('../src/app');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
// The admin console lives behind a configurable slug, not a fixed /api/admin.
const ADMIN = `/api/${process.env.ADMIN_LOGIN_SLUG}`;

const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');

jest.setTimeout(60000);

const ctx = {};
let app;

/** A completed booking worth a known amount, in a named vertical. */
async function completed(vertical, totalPaise, { omitVertical = false } = {}) {
  const doc = {
    reference: `T${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    userId: new mongoose.Types.ObjectId(),
    vertical,
    brandCode: 'x', modelCode: 'y', serviceMode: 'doorstep',
    status: 'COMPLETED',
    location: { type: 'Point', coordinates: [78.4, 17.4], address: 'Test' },
    priceSnapshot: { subtotalPaise: totalPaise, totalPaise, commissionPaise: Math.round(totalPaise * 0.1) },
  };
  const created = await RepairBooking.create(doc);
  if (omitVertical) {
    // Exactly how the oldest mobile bookings sit on disk: no `vertical` key.
    await RepairBooking.collection.updateOne({ _id: created._id }, { $unset: { vertical: '' } });
  }
  return created;
}

beforeAll(async () => {
  await startMongo();
  app = buildApp();
  await RepairConfig.insertMany([
    { vertical: 'mobile' }, { vertical: 'laptop' }, { vertical: 'two_wheeler' },
  ]);

  ctx.token = await require('./helpers').adminToken();

  await completed('mobile', 100000);
  await completed('mobile', 50000);
  await completed('mobile', 25000, { omitVertical: true }); // legacy row
  await completed('laptop', 800000);
  await completed('two_wheeler', 30000);
});

afterAll(async () => { await stopMongo(); });

const dashboard = (vertical) => request(app)
  .get(`${ADMIN}/repair/dashboard?vertical=${vertical}`).set(auth(ctx.token));

const bookings = (vertical) => request(app)
  .get(`${ADMIN}/repair/bookings?vertical=${vertical}`).set(auth(ctx.token));

describe('admin dashboard revenue', () => {
  it('reports each vertical its OWN revenue, not the total', async () => {
    const mobile = await dashboard('mobile');
    const laptop = await dashboard('laptop');
    const tw = await dashboard('two_wheeler');

    expect(mobile.status).toBe(200);
    // ₹1,000 + ₹500 + ₹250 legacy = ₹1,750
    expect(mobile.body.revenuePaise).toBe(175000);
    expect(laptop.body.revenuePaise).toBe(800000);
    expect(tw.body.revenuePaise).toBe(30000);

    // The bug: all three were equal, and equal to the sum.
    expect(mobile.body.revenuePaise).not.toBe(laptop.body.revenuePaise);
    const total = 175000 + 800000 + 30000;
    for (const r of [mobile, laptop, tw]) expect(r.body.revenuePaise).not.toBe(total);
  });

  it('counts completed jobs per vertical', async () => {
    expect((await dashboard('mobile')).body.completed).toBe(3);
    expect((await dashboard('laptop')).body.completed).toBe(1);
    expect((await dashboard('two_wheeler')).body.completed).toBe(1);
  });

  it('includes legacy mobile rows that have no vertical field', async () => {
    // The trap in the fix: a plain equality would return ₹1,500 and quietly
    // lose the oldest bookings — the ones with the longest history.
    const mobile = await dashboard('mobile');
    expect(mobile.body.revenuePaise).toBe(175000);
    expect(mobile.body.revenuePaise).not.toBe(150000);
  });

  it('never leaks a legacy row into another vertical', async () => {
    // "Field absent" must mean mobile, and only mobile.
    expect((await dashboard('laptop')).body.completed).toBe(1);
    expect((await dashboard('two_wheeler')).body.completed).toBe(1);
  });
});

describe('admin booking list', () => {
  it('shows a phone booking only in the mobile console', async () => {
    const laptop = await bookings('laptop');
    expect(laptop.status).toBe(200);
    expect(laptop.body.items).toHaveLength(1);
    expect(laptop.body.items.every((b) => b.vertical === 'laptop')).toBe(true);
  });

  it('shows every mobile booking, legacy ones included', async () => {
    const mobile = await bookings('mobile');
    expect(mobile.body.total).toBe(3);
    expect(mobile.body.items.every((b) => b.vertical == null || b.vertical === 'mobile')).toBe(true);
  });

  it('keeps the two-wheeler console to two-wheeler work', async () => {
    const tw = await bookings('two_wheeler');
    expect(tw.body.total).toBe(1);
    expect(tw.body.items[0].vertical).toBe('two_wheeler');
  });
});
