/**
 * Messages between a customer and whoever is doing their job, for every kind
 * in jobs/kinds.js (repairs, pet care, helping).
 *
 * Who: the customer, and the provider holding the job: the worker, or for a
 * shop booking the shop and the technician it put on it.
 * When: from the moment the provider accepts until the job ends, and for 7
 * days after it completes (a follow-up question about the work). Not before
 * anyone has accepted, and not on a cancelled job.
 *
 * Each message reaches the other side's own live channel at once, and a
 * notification wakes them if they are not looking. Text only; contact details
 * typed into a message are not blocked, but nothing here hands them out.
 */
const ChatMessage = require('../chat/chat-message.model');
const { KINDS, findJob } = require('./kinds');
const events = require('./job-events');

const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const AFTER_DAYS = 7;
const CANCELLED = /^(cancel|reject|expire|fail|refund)/i;

/** The people in this job's conversation: kind + id, customer first. */
function partiesOf(doc) {
  const out = [{ kind: 'user', id: String(doc.userId) }];
  if (doc.shopId) out.push({ kind: 'shop', id: String(doc.shopId) });
  if (doc.workerId) out.push({ kind: 'worker', id: String(doc.workerId) });
  return out;
}

/** Is the conversation open for this job right now? Returns a reason when not. */
function chatState(kind, doc, now = Date.now()) {
  const k = KINDS[kind];
  if (!k?.ops) return { open: false, reason: 'Messages are not available for this booking.' };
  if (!doc.workerId && !doc.shopId) return { open: false, reason: 'You can message once someone has accepted the booking.' };
  if (k.ops.waiting.includes(doc.status)) return { open: false, reason: 'You can message once the provider accepts.' };
  if (CANCELLED.test(doc.status)) return { open: false, reason: 'This booking was cancelled, so messages are closed.' };
  if (k.ops.terminal.includes(doc.status)) {
    const ended = new Date(doc.completedAt || doc.updatedAt || now).getTime();
    if (now - ended > AFTER_DAYS * 86_400_000) return { open: false, reason: 'Messages close 7 days after a booking is finished.' };
  }
  return { open: true };
}

async function load(jobId, actor) {
  const found = await findJob(jobId, 'userId workerId shopId status reference updatedAt completedAt');
  if (!found) throw err(404, 'NOT_FOUND', 'Booking not found');
  const parties = partiesOf(found.doc);
  if (!parties.some((p) => p.kind === actor.kind && p.id === String(actor.id))) throw err(404, 'NOT_FOUND', 'Booking not found');
  return { ...found, parties };
}

async function list({ jobId, actor, before, limit = 50 }) {
  const { kind, doc } = await load(jobId, actor);
  const filter = { jobId };
  if (before) filter.createdAt = { $lt: new Date(before) };
  const rows = await ChatMessage.find(filter).sort({ createdAt: -1 }).limit(Math.min(limit, 100)).lean();
  // Whatever the other side sent is now read.
  await ChatMessage.updateMany(
    { jobId, readAt: { $exists: false }, $nor: [{ 'from.kind': actor.kind, 'from.id': actor.id }] },
    { $set: { readAt: new Date() } },
  );
  return {
    kind,
    ...chatState(kind, doc),
    me: actor.kind,
    messages: rows.reverse().map((m) => ({
      id: String(m._id), text: m.text, from: m.from.kind, mine: m.from.kind === actor.kind && String(m.from.id) === String(actor.id),
      at: m.createdAt, readAt: m.readAt || null,
    })),
  };
}

async function send({ jobId, actor, text }) {
  const clean = String(text || '').trim();
  if (!clean) throw err(400, 'EMPTY', 'Type a message first.');
  if (clean.length > 1000) throw err(400, 'TOO_LONG', 'Keep messages under 1000 characters.');
  const { kind, doc, parties } = await load(jobId, actor);
  const state = chatState(kind, doc);
  if (!state.open) throw err(409, 'CHAT_CLOSED', state.reason);

  const msg = await ChatMessage.create({ kind, jobId, from: { kind: actor.kind, id: actor.id }, text: clean });
  const payload = { kind, jobId: String(jobId), id: String(msg._id), text: clean, from: actor.kind, at: msg.createdAt };
  const k = KINDS[kind];
  for (const p of parties) {
    events.toProvider(p.kind, p.id, 'chat.message', { ...payload, mine: p.kind === actor.kind && p.id === String(actor.id) });
    if (p.kind === actor.kind && p.id === String(actor.id)) continue;
    // A shop owner hears customers on their bookings; a technician hears them too.
    events.push(p, {
      title: actor.kind === 'user' ? 'New message from your customer' : 'New message about your booking',
      body: clean.slice(0, 120),
      deepLink: p.kind === 'user' ? k.link(String(jobId)) : k.providerLink(String(jobId)),
      data: { kind, id: String(jobId), type: 'chat' },
    }).catch(() => {});
  }
  return { id: String(msg._id), at: msg.createdAt };
}

module.exports = { list, send, chatState, partiesOf };
