/**
 * A booking started and not finished (jobs/checkout-draft): kept for home's
 * "Continue your booking", one reminder push 30 min later, cleared once they book.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let drafts; let send;
beforeAll(async () => {
  await startMongo();
  drafts = require('../src/modules/jobs/checkout-draft');
  send = require('../src/modules/messaging/send');
});
afterAll(stopMongo);

test('saved, listed, refreshed in place, and cleared', async () => {
  const user = new mongoose.Types.ObjectId();
  await drafts.save(user, { kind: 'repair', title: 'Bike wash', step: 'Confirm', path: '/repair/two-wheeler', pricePaise: 49900 });
  await drafts.save(user, { kind: 'repair', title: 'Bike wash', step: 'Confirm', path: '/repair/two-wheeler', pricePaise: 52000 });
  const list = await drafts.list(user);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ kind: 'repair', title: 'Bike wash', pricePaise: 52000 });
  await drafts.clear(user, 'repair');
  expect(await drafts.list(user)).toEqual([]);
  await expect(drafts.save(user, { kind: 'nope', title: 'x', path: '/x' })).rejects.toMatchObject({ code: 'BAD_KIND' });
  await expect(drafts.save(user, { kind: 'repair', title: 'x', path: 'https://evil.example' })).rejects.toMatchObject({ code: 'BAD_PATH' });
});

test('one reminder after 30 minutes, never twice; none once they booked', async () => {
  const spy = jest.spyOn(send, 'send').mockResolvedValue({ ok: true });
  const user = new mongoose.Types.ObjectId();
  await drafts.save(user, { kind: 'helping', title: 'Errand', step: 'Address', path: '/helping', pricePaise: 9900 });
  expect((await drafts.sweep()).sent).toBe(0); // too soon
  const later = Date.now() + 31 * 60000;
  expect((await drafts.sweep({ now: later })).sent).toBe(1);
  expect((await drafts.sweep({ now: later + 60000 })).sent).toBe(0); // once
  expect(spy.mock.calls.find(([ev]) => ev === 'customer.finish_booking')[1]).toMatchObject({ to: { kind: 'user', id: user }, ctx: { link: '/helping' } });

  const booked = new mongoose.Types.ObjectId();
  await drafts.save(booked, { kind: 'helping', title: 'Errand', path: '/helping' });
  const { HelpingTask } = require('../src/modules/helping/models/task.model');
  await HelpingTask.collection.insertOne({ reference: 'HT-DR-1', userId: booked, status: 'CONFIRMED', createdAt: new Date(Date.now() + 1000) });
  expect((await drafts.sweep({ now: later })).sent).toBe(0);
  expect(await drafts.list(booked)).toEqual([]);
  spy.mockRestore();
});
