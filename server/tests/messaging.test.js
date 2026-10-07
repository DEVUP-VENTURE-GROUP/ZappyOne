/**
 * Automatic messages (messaging/):
 *   - every catalog entry renders a push and/or email from its sample, branded,
 *     with no "undefined"/"NaN" leaking into the words
 *   - an email goes only to a verified address, once per event and job
 *   - quiet hours keep non-urgent pushes in-app; urgent ones still go
 *   - a customer who turned order updates off gets no booking emails, but
 *     still gets the receipt
 *   - a job's status changes send the catalog's messages (and the provider
 *     hears a customer's cancellation)
 *   - the receipt PDF builds from a real booking
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let send; let MessageLog; let CATALOG; let settings; let User; let Notification; let HelpingTask;
const HERE = { type: 'Point', coordinates: [78.4867, 17.385], address: 'Madhapur, Hyderabad' };

beforeAll(async () => {
  await startMongo();
  ({ send, MessageLog } = require('../src/modules/messaging/send'));
  ({ CATALOG } = require('../src/modules/messaging/catalog'));
  settings = require('../src/modules/messaging/settings');
  User = require('../src/modules/user/user.model');
  Notification = require('../src/modules/notification/notification.model');
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  await MessageLog.init();
  // Never quiet unless a test says so.
  await settings.update({ quietFromHour: 0, quietToHour: 0 });
});
afterAll(stopMongo);

async function customer(over = {}) {
  return User.create({ phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`, name: 'Aarav Sharma', email: `a${Date.now()}${Math.random()}@ex.com`.replace(/0\./, ''), emailVerified: true, ...over });
}

test('every message renders, branded, with nothing missing', async () => {
  const { build } = require('../src/modules/messaging/send');
  for (const [key, e] of Object.entries(CATALOG)) {
    const out = await build(key, e.sample(), e.audience === 'ops' ? 'ops' : e.audience === 'provider' ? 'worker' : 'user');
    const words = JSON.stringify([out.push, out.email?.subject, out.email?.text]);
    expect(words).not.toMatch(/undefined|NaN|\[object Object\]/);
    if (e.channels.includes('push')) expect(out.push?.title).toBeTruthy();
    if (e.channels.includes('email') && out.email) {
      expect(out.email.html).toContain('venture of DEVUP ECOSYSTEM PVT LTD');
      expect(out.email.html).toContain('/logo.png');
      expect(out.email.text.length).toBeGreaterThan(20);
    }
  }
});

test('email only to a verified address, once per event and job', async () => {
  const u = await customer();
  const unverified = await customer({ emailVerified: false });
  const ctx = CATALOG['booking.confirmed'].sample();
  await send('booking.confirmed', { to: { kind: 'user', id: u._id }, ctx, refId: 'helping:1' });
  await send('booking.confirmed', { to: { kind: 'user', id: u._id }, ctx, refId: 'helping:1' });
  await send('booking.confirmed', { to: { kind: 'user', id: unverified._id }, ctx, refId: 'helping:2' });

  const mine = await MessageLog.find({ toId: String(u._id) }).lean();
  expect(mine.filter((r) => r.channel === 'email')).toHaveLength(1);
  expect(mine.filter((r) => r.channel === 'push')).toHaveLength(1);
  expect(await Notification.countDocuments({ 'recipient.id': u._id })).toBe(1);
  const theirs = await MessageLog.findOne({ toId: String(unverified._id), channel: 'email' }).lean();
  expect(theirs.status).toBe('skipped');
  expect(theirs.reason).toBe('no verified email');
});

test('quiet hours: non-urgent stays in-app, urgent still pushes', async () => {
  await settings.update({ quietFromHour: 0, quietToHour: 23 }); // nearly all day
  const u = await customer();
  await send('booking.rate_reminder', { to: { kind: 'user', id: u._id }, ctx: CATALOG['booking.rate_reminder'].sample(), refId: 'r:1' });
  await send('booking.arrived', { to: { kind: 'user', id: u._id }, ctx: CATALOG['booking.arrived'].sample(), refId: 'r:1' });
  const rows = await MessageLog.find({ toId: String(u._id), channel: 'push' }).lean();
  expect(rows.find((r) => r.key === 'booking.rate_reminder').status).toBe('in_app');
  expect(rows.find((r) => r.key === 'booking.arrived').status).toBe('sent');
  await settings.update({ quietFromHour: 0, quietToHour: 0 });
});

test('order updates off: no booking emails, the receipt still comes', async () => {
  const u = await customer({ notificationPrefs: { orderUpdates: false } });
  await send('booking.confirmed', { to: { kind: 'user', id: u._id }, ctx: CATALOG['booking.confirmed'].sample(), refId: 'p:1' });
  await send('booking.completed', { to: { kind: 'user', id: u._id }, ctx: CATALOG['booking.completed'].sample(), refId: 'p:1' });
  const rows = await MessageLog.find({ toId: String(u._id), channel: 'email' }).lean();
  expect(rows.find((r) => r.key === 'booking.confirmed').status).toBe('skipped');
  expect(rows.find((r) => r.key === 'booking.completed').status).toBe('queued');
});

test('a job\'s status changes send the catalog\'s messages; the provider hears a customer cancel', async () => {
  const u = await customer();
  const workerId = new mongoose.Types.ObjectId();
  await require('../src/modules/worker/worker.model').collection.insertOne({ _id: workerId, phone: '9711100001', name: 'Sana Helper', isBlocked: false });
  const t = await HelpingTask.create({
    reference: 'HT-MSG-1', userId: u._id, workerId, serviceType: 'shopping', status: 'WORKER_ACCEPTED', pickupLocation: HERE, destination: HERE,
    charge: { serviceChargePaise: 12000, workerEarningPaise: 10800, baseFeePaise: 12000 },
    statusHistory: [{ status: 'CANCELLED', at: new Date(), byRole: 'user' }], cancellationReason: 'No longer needed',
  });
  const { onStatus } = require('../src/modules/messaging/lifecycle');
  await onStatus('helping', t.toObject(), 'WORKER_ACCEPTED');
  await onStatus('helping', { ...t.toObject(), status: 'CANCELLED' }, 'CANCELLED');

  const toCustomer = await MessageLog.find({ toId: String(u._id) }).lean();
  expect(toCustomer.map((r) => `${r.key}/${r.channel}`).sort()).toEqual(
    ['booking.accepted/push', 'booking.cancelled/email', 'booking.cancelled/push'],
  );
  expect(await MessageLog.exists({ key: 'provider.job_cancelled', toId: String(workerId) })).toBeTruthy();
  const accepted = toCustomer.find((r) => r.key === 'booking.accepted');
  expect(accepted.subject).toContain('Sana Helper');
});

test('the receipt PDF builds from a real booking', async () => {
  const u = await customer();
  const t = await HelpingTask.create({
    reference: 'HT-RCPT-1', userId: u._id, serviceType: 'shopping', status: 'COMPLETED', pickupLocation: HERE, destination: HERE,
    charge: { serviceChargePaise: 15000, baseFeePaise: 14000, platformFeePaise: 1000 }, completedAt: new Date(), paymentMethod: 'cash',
  });
  const pdf = await require('../src/modules/messaging/receipt').build('helping', t.toObject());
  expect(pdf.buffer.slice(0, 4).toString()).toBe('%PDF');
  expect(pdf.filename).toBe('ZappyOne-receipt-HT-RCPT-1.pdf');
  expect(pdf.number).toMatch(/^ZO-\d{4}-HT-RCPT-1$/);
});
