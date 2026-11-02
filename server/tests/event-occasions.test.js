// Occasions are fully editable: add (slug from the name, placed last), rename, hide, reorder; removed only when no theme uses them.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const EventCategory = require('../src/modules/events/event-category.model');
const EventTheme = require('../src/modules/events/event-theme.model');
const svc = require('../src/modules/events/event.service');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

test('add, edit, hide, remove; an occasion in use is kept', async () => {
  await EventCategory.create({ slug: 'birthday', name: 'Birthday', emoji: '🎂', sortOrder: 1 });
  const added = await svc.adminUpsertCategory({ name: 'Naming Ceremony', emoji: '👶' });
  expect(added).toMatchObject({ slug: 'naming-ceremony', sortOrder: 2, emoji: '👶' });
  await expect(svc.adminUpsertCategory({ slug: 'nope' })).rejects.toMatchObject({ code: 'NAME_REQUIRED' });

  await svc.adminUpsertCategory({ slug: 'naming-ceremony', name: 'Naamkaran', isActive: false });
  expect(await EventCategory.findOne({ slug: 'naming-ceremony' }).lean()).toMatchObject({ name: 'Naamkaran', isActive: false });
  // Nothing to book yet: no occasion is offered.
  expect(await svc.listCategories()).toEqual([]);

  const birthday = await EventCategory.findOne({ slug: 'birthday' }).lean();
  await EventTheme.collection.insertOne({ categoryId: birthday._id, partnerId: new mongoose.Types.ObjectId(), title: 'Balloon arch', status: 'approved' });
  expect((await svc.adminListCategories()).find((c) => c.slug === 'birthday').themesUsing).toBe(1);
  await expect(svc.adminDeleteCategory('birthday')).rejects.toMatchObject({ code: 'IN_USE' });
  expect(await svc.adminDeleteCategory('naming-ceremony')).toEqual({ deleted: 'naming-ceremony' });
  await expect(svc.adminDeleteCategory('naming-ceremony')).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('occasions and packages come only from approved partners serving the city', async () => {
  const EventPartner = require('../src/modules/events/event-partner.model');
  const cat = await EventCategory.create({ slug: 'anniversary', name: 'Anniversary' });
  const pending = await EventPartner.create({ businessName: 'Pending Decor', ownerName: 'B', cities: ['hyderabad'], kyc: { status: 'pending' } });
  await EventTheme.collection.insertOne({ categoryId: cat._id, partnerId: pending._id, title: 'Rose setup', status: 'approved', cities: [] });
  expect(await svc.liveInCity('Hyderabad')).toBe(false);
  expect((await svc.listCategories({ city: 'hyderabad' })).map((c) => c.slug)).not.toContain('anniversary');

  const live = await EventPartner.create({ businessName: 'Live Decor', ownerName: 'C', cities: ['hyderabad'], kyc: { status: 'approved' } });
  await EventTheme.collection.insertOne({ categoryId: cat._id, partnerId: live._id, title: 'Candle setup', status: 'approved', cities: [] });
  expect(await svc.liveInCity('Hyderabad')).toBe(true);
  expect(await svc.liveInCity('Mumbai')).toBe(false);
  expect((await svc.listCategories({ city: 'hyderabad' })).map((c) => c.slug)).toContain('anniversary');
  expect(await svc.listCategories({ city: 'mumbai' })).toEqual([]);
  const { themes } = await svc.listThemes({ city: 'hyderabad' });
  expect(themes.map((t) => t.title)).toEqual(['Candle setup']);

  await EventPartner.updateOne({ _id: live._id }, { isBlocked: true });
  expect(await svc.liveInCity('Hyderabad')).toBe(false);
});
