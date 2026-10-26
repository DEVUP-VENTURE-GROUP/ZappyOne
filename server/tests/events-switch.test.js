// One switch hides all of Events from customers: no occasions, no themes, config says not live, new bookings refused; on again brings it back.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const EventCategory = require('../src/modules/events/event-category.model');
const flags = require('../src/modules/feature-flags/feature-flag.service');
const svc = require('../src/modules/events/event.service');

jest.setTimeout(60000);
let app;
beforeAll(async () => { await startMongo(); app = require('../src/app')(); await EventCategory.create({ slug: 'birthday', name: 'Birthday', emoji: '🎂' }); });
afterAll(stopMongo);

test('off hides everything and refuses bookings; on restores it', async () => {
  expect((await request(app).get('/api/events/categories')).body.categories).toHaveLength(1);
  expect((await request(app).get('/api/events/config')).body.live).toBe(true);

  await flags.set('events', false, null);
  expect((await request(app).get('/api/events/categories')).body.categories).toEqual([]);
  expect((await request(app).get('/api/events/themes')).body).toMatchObject({ themes: [], total: 0 });
  expect((await request(app).get('/api/events/config')).body.live).toBe(false);
  await expect(svc.createBooking({ userId: null, themeId: null })).rejects.toMatchObject({ code: 'FEATURE_OFF' });

  await flags.set('events', true, null);
  expect((await request(app).get('/api/events/categories')).body.categories).toHaveLength(1);
});
