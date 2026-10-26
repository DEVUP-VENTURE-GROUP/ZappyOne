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
  expect((await svc.listCategories()).map((c) => c.slug)).toEqual(['birthday']);

  const birthday = await EventCategory.findOne({ slug: 'birthday' }).lean();
  await EventTheme.collection.insertOne({ categoryId: birthday._id, partnerId: new mongoose.Types.ObjectId(), title: 'Balloon arch', status: 'approved' });
  expect((await svc.adminListCategories()).find((c) => c.slug === 'birthday').themesUsing).toBe(1);
  await expect(svc.adminDeleteCategory('birthday')).rejects.toMatchObject({ code: 'IN_USE' });
  expect(await svc.adminDeleteCategory('naming-ceremony')).toEqual({ deleted: 'naming-ceremony' });
  await expect(svc.adminDeleteCategory('naming-ceremony')).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
