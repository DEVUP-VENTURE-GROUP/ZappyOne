/**
 * Festive home (content/season): a festival shows on the customer home only
 * between its dates, its offer only while its promo code is live, and an edit
 * changes only what it sends.
 */
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const Season = require('../src/modules/content/season.model');
const Promo = require('../src/modules/promo/promo.model');
const seasons = require('../src/modules/content/season.service');

jest.setTimeout(60000);

let app;
const H = 3600000;
const base = (extra = {}) => ({
  name: 'Navratri', theme: 'navratri', greeting: 'Happy Navratri', headline: 'Festive-ready homes',
  startAt: new Date(Date.now() - H), endAt: new Date(Date.now() + 48 * H),
  tiles: [{ title: 'Pooja-ready home', serviceCode: 'water_tank_care', imageUrl: '', badge: 'New' }], ...extra,
});

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
});
afterAll(stopMongo);
beforeEach(() => Promise.all([Season.deleteMany({}), Promo.deleteMany({})]));

test('home shows the festival only between its dates, and nothing between festivals', async () => {
  expect((await request(app).get('/api/content/season')).body).toEqual({ season: null });
  await Season.create(base({ startAt: new Date(Date.now() + H), endAt: new Date(Date.now() + 2 * H) }));
  expect(await seasons.current()).toBeNull();
  await Season.create(base({ name: 'Running' }));
  const res = await request(app).get('/api/content/season');
  expect(res.body.season).toMatchObject({ name: 'Running', theme: 'navratri', headline: 'Festive-ready homes' });
  expect(res.body.season.tiles).toHaveLength(1);
});

test('a festival switched off does not show', async () => {
  await Season.create(base({ isActive: false }));
  expect(await seasons.current()).toBeNull();
});

test('the offer shows only while its promo code is live, and says what it gives', async () => {
  await Promo.create({
    code: 'FEST20', name: 'Festive 20', type: 'percent', discount: { value: 20, maxDiscountPaise: 15000 },
    validity: { startAt: new Date(Date.now() - H), endAt: new Date(Date.now() + H) },
  });
  await Season.create(base({ promoCode: 'FEST20' }));
  expect((await seasons.current()).offer).toMatchObject({ code: 'FEST20', type: 'percent', discountValue: 20, maxDiscountPaise: 15000 });

  await Promo.updateOne({ code: 'FEST20' }, { $set: { 'validity.endAt': new Date(Date.now() - 1000) } });
  expect((await seasons.current()).offer).toBeNull();
});

test('an edit changes only what it sends: tiles stay', async () => {
  const s = await Season.create(base());
  const { after } = await seasons.update(s._id, { headline: 'Diwali-ready homes' }, 'admin');
  expect(after.headline).toBe('Diwali-ready homes');
  expect(after.tiles).toHaveLength(1);
  await expect(seasons.update(s._id, { endAt: new Date(Date.now() - 2 * H) }, 'admin')).rejects.toMatchObject({ code: 'BAD_DATES' });
});
