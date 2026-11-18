// Booked-for-later visits, confirmed before the time: the pro is asked, asked again, and if silent the job goes to the next pro or store while there is still time.
// Built on the arrival promise (jobs/promise): one record per accepted visit, its provider and booked time. Times are set in Economics → Booked visits.
const logger = require('../../core/logger');
const { KINDS } = require('./kinds');

const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const clock = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const minsTo = (d, now) => Math.round((new Date(d).getTime() - now) / 60000);

async function settings() {
  return require('../pricing/services/config.service').scheduleCheckSettings();
}

const Promise_ = () => require('./promise').ArrivalPromise;
const gb = () => require('./give-back');
const send = (key, to, ctx, refId) => require('../messaging/send').send(key, { to, ctx, refId }).catch(() => {});
const refOf = (p) => `${p.jobId}:${p.providerId}`;
const provider = (p) => ({ kind: p.providerKind, id: p.providerId });

// Set off or already there: the pro is clearly coming, so it counts as confirmed.
const onTheWay = (kind, doc) => !!gb().RULES[kind]?.late.includes(doc.status);
const ended = (kind, doc) => !doc || !!KINDS[kind]?.ops?.terminal?.includes(doc.status);

async function jobOf(p) {
  return KINDS[p.kind]?.model().findById(p.jobId);
}

// The job is still this provider's: a hand-back or reassignment since means the record is stale.
function stillHeld(p, doc) {
  const id = String(p.providerId);
  return p.providerKind === 'worker' ? String(doc.workerId || '') === id : String(doc.shopId || '') === id;
}

async function ask(p, now, again) {
  const field = again ? 'askedAgainAt' : 'askedAt';
  const claimed = await Promise_().updateOne({ _id: p._id, [field]: null, confirmedAt: null, closed: false }, { $set: { [field]: new Date(now) } });
  if (!claimed.modifiedCount) return false;
  const doc = await jobOf(p);
  if (ended(p.kind, doc) || !stillHeld(p, doc)) { await Promise_().updateOne({ _id: p._id }, { $set: { closed: true } }); return false; }
  if (onTheWay(p.kind, doc)) { await Promise_().updateOne({ _id: p._id }, { $set: { confirmedAt: new Date(now) } }); return false; }
  const s = await settings();
  await send(again ? 'provider.time_check_last' : 'provider.time_check', provider(p), {
    reference: p.reference, time: clock(p.promisedBy), reofferIn: Math.max(0, minsTo(p.promisedBy, now) - s.reofferBeforeMin),
    link: KINDS[p.kind].providerLink(String(p.jobId)),
  }, refOf(p));
  return true;
}

// Silent past the deadline: the job goes back to the pool (other pros and stores), counted like a hand-back but never charged.
async function reoffer(p, now) {
  const claimed = await Promise_().updateOne({ _id: p._id, confirmedAt: null, closed: false }, { $set: { closed: true } });
  if (!claimed.modifiedCount) return false;
  const doc = await jobOf(p);
  if (ended(p.kind, doc) || !stillHeld(p, doc)) return false;
  if (onTheWay(p.kind, doc)) { await Promise_().updateOne({ _id: p._id }, { $set: { closed: false, confirmedAt: new Date(now) } }); return false; }
  const who = provider(p);
  const q = { ...(await gb().quote({ kind: p.kind, doc, provider: { kind: who.kind, id: String(who.id) }, reason: 'other' })), penaltyPaise: 0, genuine: false, late: false };
  await gb().release({ kind: p.kind, doc, provider: { kind: who.kind, id: String(who.id) }, reasonLabel: 'Did not confirm the booked time', toShop: q.toShop, actor: { kind: 'system', id: null } });
  await gb().consequences({ kind: p.kind, doc, provider: { kind: who.kind, id: String(who.id) }, q, type: 'no_confirm', reason: 'no_confirm', note: '', from: doc.status })
    .catch((e) => logger.error({ err: e.message, id: String(p.jobId) }, '[time-check] record failed'));
  await send('provider.time_check_moved', who, { reference: p.reference, time: clock(p.promisedBy), toShop: q.toShop, link: '/worker/work' }, refOf(p));
  logger.info({ kind: p.kind, id: String(p.jobId) }, '[time-check] not confirmed, re-offered');
  return true;
}

async function alert(p, now) {
  const claimed = await Promise_().updateOne({ _id: p._id, alertedAt: null, closed: false }, { $set: { alertedAt: new Date(now) } });
  if (!claimed.modifiedCount) return false;
  const doc = await jobOf(p);
  if (ended(p.kind, doc) || !stillHeld(p, doc)) return false;
  const id = String(p.jobId);
  const ctx = { reference: p.reference, time: clock(p.promisedBy), label: KINDS[p.kind].label };
  if (!onTheWay(p.kind, doc)) await send('provider.leave_now', provider(p), { ...ctx, link: KINDS[p.kind].providerLink(id) }, refOf(p));
  await send('customer.pro_due_soon', { kind: 'user', id: p.userId }, { ...ctx, link: KINDS[p.kind].link(id) }, refOf(p));
  return true;
}

// Every minute (server.js). Each step claims its row first, so two servers never send twice.
async function sweep({ now = Date.now() } = {}) {
  const s = await settings();
  const out = { asked: 0, askedAgain: 0, reoffered: 0, alerted: 0 };
  if (!s.on) return out;
  const open = { scheduled: true, closed: false, arrivedAt: null };
  const at = (min) => new Date(now + min * 60000);
  const steps = [
    ['asked', { ...open, confirmedAt: null, askedAt: null, promisedBy: { $lte: at(s.askBeforeMin), $gt: at(s.reofferBeforeMin) } }, (p) => ask(p, now, false)],
    ['askedAgain', { ...open, confirmedAt: null, askedAt: { $ne: null }, askedAgainAt: null, promisedBy: { $lte: at(s.askAgainBeforeMin), $gt: at(s.reofferBeforeMin) } }, (p) => ask(p, now, true)],
    // Only someone we actually asked loses the job; a missed ask (server down) never costs a pro their booking.
    ['reoffered', { ...open, confirmedAt: null, askedAt: { $ne: null }, promisedBy: { $lte: at(s.reofferBeforeMin), $gt: new Date(now) } }, (p) => reoffer(p, now)],
    ['alerted', { ...open, alertedAt: null, promisedBy: { $lte: at(s.alertBeforeMin), $gt: new Date(now) } }, (p) => alert(p, now)],
  ];
  for (const [name, query, run] of steps) {
    const rows = await Promise_().find(query).limit(100).lean();
    for (const p of rows) {
      try { if (await run(p)) out[name] += 1; } catch (e) { logger.warn({ err: e.message, id: String(p.jobId), step: name }, '[time-check] step failed'); }
    }
  }
  return out;
}

const sweepTick = (opts) => sweep(opts).catch((e) => { logger.warn({ err: e.message }, '[time-check] sweep failed'); return null; });

// The pro answers: "I'll be there" or "Can't make it" (free while there is still time to find someone else).
async function answer({ kind, id, actor, answer: reply }) {
  const doc = await KINDS[kind]?.model().findById(id);
  if (!doc) throw err(404, 'NOT_FOUND', 'Booking not found');
  const holder = gb().holderOf(doc, actor);
  if (!holder) throw err(403, 'FORBIDDEN', 'This job is not yours');
  const p = await Promise_().findOne({ jobId: doc._id, closed: false, arrivedAt: null });
  if (!p?.scheduled) throw err(409, 'NOT_BOOKED_LATER', 'This job is not booked for a later time.');
  const now = Date.now();
  const s = await settings();
  if (reply === 'yes') {
    if (!p.confirmedAt) {
      await Promise_().updateOne({ _id: p._id, confirmedAt: null }, { $set: { confirmedAt: new Date(now) } });
      await send('customer.pro_confirmed', { kind: 'user', id: p.userId }, { reference: p.reference, time: clock(p.promisedBy), label: KINDS[kind].label, link: KINDS[kind].link(id) }, refOf(p));
    }
    return { confirmed: true, message: `Confirmed. Be there by ${clock(p.promisedBy)}.` };
  }
  if (minsTo(p.promisedBy, now) < s.reofferBeforeMin) {
    throw err(409, 'TOO_CLOSE', 'It is too close to the time for a free hand-back. Use "Hand it back" below; a charge may apply.');
  }
  if (!gb().RULES[kind]?.held.includes(doc.status) || onTheWay(kind, doc)) throw err(409, 'TOO_LATE', 'You have already set off for this job.');
  const toShop = holder.kind === 'worker' && !!doc.shopId;
  const q = { late: false, genuine: true, counts: false, isWarning: false, penaltyPaise: 0, pauses: false, toShop };
  await Promise_().updateOne({ _id: p._id }, { $set: { closed: true } });
  await gb().release({ kind, doc, provider: holder, reasonLabel: 'Cannot make the booked time', toShop, actor });
  await gb().consequences({ kind, doc, provider: holder, q, type: 'schedule_decline', reason: 'schedule_decline', note: '', from: doc.status })
    .catch((e) => logger.error({ err: e.message, id }, '[time-check] record failed'));
  return { handedBack: true, toShop, message: toShop ? 'Sent back to your shop owner, no charge.' : 'Handed back, no charge. We are finding someone else.' };
}

// What the pro's job screen shows: the booked time, whether to confirm now, and until when "can't make it" is free.
async function providerView(jobId, now = Date.now()) {
  const s = await settings();
  if (!s.on) return null;
  const p = await Promise_().findOne({ jobId, closed: false, arrivedAt: null, scheduled: true }).select('promisedBy confirmedAt').lean();
  if (!p) return null;
  const due = new Date(p.promisedBy).getTime();
  const freeUntil = new Date(due - s.reofferBeforeMin * 60000);
  return {
    dueAt: p.promisedBy,
    confirmedAt: p.confirmedAt,
    askOpen: !p.confirmedAt && now >= due - s.askBeforeMin * 60000 && now < due,
    freeUntil,
    canDeclineFree: now < freeUntil.getTime(),
  };
}

module.exports = { settings, sweep, sweepTick, answer, providerView };
