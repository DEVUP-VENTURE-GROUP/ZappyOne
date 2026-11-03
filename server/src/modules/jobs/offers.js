/**
 * "I can't come now, I can come by …": a pro who is busy or far offers a time
 * instead of passing, for every kind of job still waiting for someone.
 *
 *   offer    a verified pro who could take the job now (approved for the service,
 *            under their job cap and dues limit, not passed on it, not blocked by
 *            the customer) offers one of laterChoicesMin. One offer per pro; a
 *            new one replaces theirs. The customer hears at once.
 *   choose   the customer takes an offer (or another pro below it). The job is
 *            given through the same handler a pro's own tap uses (fast-assign
 *            TAKE), so every rule still applies; the arrival promise keeps to the
 *            offered time (jobs/promise).
 *   silent   the customer did not answer within customerDecisionSec: the
 *            earliest offer is taken for them, but only if it is within
 *            autoChooseMaxMin; a later one always waits for their own OK.
 *   lost     nothing is closed while an offer stands (jobs/waves); an offer
 *            whose time has passed, or whose pro can no longer take it, is
 *            dropped and the next is tried.
 */
const { KINDS, findJob } = require('./kinds');
const logger = require('../../core/logger');

const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const keyOf = (who) => `${who.kind}:${who.id}`;
const parse = (by) => { const [kind, id] = String(by).split(':'); return { kind, id }; };
const settings = () => require('../pricing/services/config.service').fastAssignSettings();

const WAITING = {
  repair: { status: ['CONFIRMED'], unheld: { workerId: null, shopId: null } },
  pet: { status: ['BOOKED', 'PROVIDER_SEARCHING'], unheld: { workerId: null, shopId: null } },
  helping: { status: ['CONFIRMED', 'WORKER_SEARCHING'], unheld: { workerId: null } },
};
const isWaiting = (kind, doc) => !!WAITING[kind] && WAITING[kind].status.includes(doc.status)
  && Object.keys(WAITING[kind].unheld).every((k) => !doc[k]);
const isLater = (doc) => require('./work-hours').isLater(doc.scheduledAt || doc.checkInAt);

/** Offers still worth showing: their time has not passed. */
const live = (doc, now = Date.now()) => (doc.matching?.offers || []).filter((o) => new Date(o.arriveBy).getTime() > now);

/** Could this pro take the job, apart from being free right now? Throws with the reason they can act on. */
async function assertMayOffer(kind, doc, who) {
  if (who.kind === 'shop' && kind === 'helping') throw err(403, 'NOT_FOR_SHOPS', 'Errands are taken by a person, not a shop.');
  const line = await KINDS[kind].line(doc);
  const approved = line ? await require('../onboarding/eligibility').approvedProviders(line) : [];
  if (!approved.some((p) => p.kind === who.kind && String(p.id) === String(who.id))) throw err(403, 'NOT_APPROVED', 'You are not verified for this service yet.');
  const passed = new Set([...(doc.declinedBy || []), ...(doc.releasedBy || []), ...(doc.declines || []).map((d) => d.providerId)].map(String));
  for (const id of await require('./customer-block').blockersOf(doc.userId)) passed.add(String(id));
  if (passed.has(String(who.id))) throw err(409, 'PASSED', 'You passed on this job.');
  if (who.kind === 'worker') {
    const Worker = require('../worker/worker.model');
    const w = await Worker.findById(who.id).select('shopId isBlocked').lean();
    if (!w || w.isBlocked) throw err(403, 'BLOCKED', 'Your account cannot take jobs right now.');
    if (w.shopId) throw err(403, 'SHOP_TECHNICIAN', 'Your shop takes jobs for you; ask your shop owner.');
    const { free, busy } = await require('./workload').classify([who.id]);
    if (!free.has(String(who.id)) && !busy.has(String(who.id))) throw err(409, 'TOO_MANY_JOBS', 'Finish a job first, then offer a time.');
    const working = await require('../worker/worker-dues.service').filterWorkingWorkers([who.id]);
    if (!working.has(String(who.id))) throw err(402, 'DUES', 'Pay what you owe ZappyOne to take new jobs.');
  }
  // Never more standing offers than jobs they could hold: ten customers must not all wait on one person who can do two.
  if (who.kind === 'worker') {
    const { maxActiveJobs = 2 } = await require('../order/cancellation.service').getConfig();
    let standing = 0;
    for (const [k, w] of Object.entries(WAITING)) {
      standing += await KINDS[k].model().countDocuments({ _id: { $ne: doc._id }, 'matching.offers': { $elemMatch: { by: keyOf(who), arriveBy: { $gt: new Date() } } }, status: { $in: w.status }, ...w.unheld });
    }
    if (standing >= maxActiveJobs) throw err(409, 'TOO_MANY_OFFERS', `You have offered a time on ${standing} jobs. Let those customers answer first.`);
  }
}

/** A pro offers to come by `minutes` from now. */
async function offerLater({ jobId, who, minutes }) {
  const found = await findJob(jobId, '');
  if (!found) throw err(404, 'NOT_FOUND', 'Booking not found');
  const { kind, doc } = found;
  const s = await settings();
  const m = Number(minutes);
  if (!s.laterChoicesMin.includes(m)) throw err(400, 'BAD_TIME', `Pick one of ${s.laterChoicesMin.join(', ')} minutes.`);
  if (!isWaiting(kind, doc)) throw err(409, 'ALREADY_CLAIMED', 'Taken by another pro');
  if (isLater(doc)) throw err(409, 'BOOKED_FOR_LATER', 'This booking already has a time; take it if you can make it.');
  await assertMayOffer(kind, doc, who);

  const now = new Date();
  const offer = { by: keyOf(who), minutes: m, arriveBy: new Date(now.getTime() + m * 60000), at: now };
  const Model = KINDS[kind].model();
  // Only while still waiting for someone, and one offer per pro (a new one replaces theirs).
  const held = { _id: doc._id, status: { $in: WAITING[kind].status }, ...WAITING[kind].unheld };
  await Model.updateOne(held, { $pull: { 'matching.offers': { by: offer.by } } });
  const r = await Model.updateOne(held, { $push: { 'matching.offers': offer } });
  if (!r.modifiedCount) throw err(409, 'ALREADY_CLAIMED', 'Taken by another pro');

  tellCustomer(kind, doc, offer).catch(() => {});
  return { kind, offer };
}

async function nameOf(who) {
  const Model = who.kind === 'shop' ? require('../shop/shop.model') : require('../worker/worker.model');
  const p = await Model.findById(who.id).select('name businessName rating reviewCount completedJobs profilePhotoKey coverImageUrl').lean();
  return p;
}

async function tellCustomer(kind, doc, offer) {
  const p = await nameOf(parse(offer.by));
  const name = (p?.businessName || p?.name || 'A pro').split(' ')[0];
  const at = new Date(offer.arriveBy).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  await require('../notification/notification.service').notify({
    recipient: { kind: 'user', id: doc.userId }, type: 'system_alert',
    title: `${name} can come by ${at}`,
    body: 'Open your booking to say OK, or pick someone else.',
    deepLink: KINDS[kind].link(doc._id),
    data: { jobId: String(doc._id), kind },
  });
}

/** What the customer sees: every standing offer, soonest first, with who is offering. */
async function viewFor({ jobId, userId }) {
  const found = await findJob(jobId, '');
  if (!found || String(found.doc.userId) !== String(userId)) throw err(404, 'NOT_FOUND', 'Booking not found');
  const { kind, doc } = found;
  const s = await settings();
  const offers = live(doc).sort((a, b) => new Date(a.arriveBy) - new Date(b.arriveBy));
  const s3 = require('../../core/storage/s3');
  const rows = await Promise.all(offers.map(async (o) => {
    const who = parse(o.by);
    const p = await nameOf(who);
    if (!p) return null;
    const photoKey = who.kind === 'shop' ? p.coverImageUrl : p.profilePhotoKey;
    return {
      by: o.by, kind: who.kind, name: p.businessName || p.name || 'Pro', rating: p.reviewCount ? p.rating : null,
      completedJobs: p.completedJobs || 0, minutes: o.minutes, arriveBy: o.arriveBy, offeredAt: o.at,
      photoUrl: photoKey ? await s3.signMedia(photoKey).catch(() => null) : null,
    };
  }));
  const first = offers[0] ? Math.min(...offers.map((o) => new Date(o.at).getTime())) : null;
  return {
    kind, waiting: isWaiting(kind, doc), offers: rows.filter(Boolean),
    // When the soonest offer is taken for them if they say nothing, and whether it would be.
    decideBy: first ? new Date(first + s.customerDecisionSec * 1000) : null,
    autoTakes: !!offers[0] && offers[0].minutes <= s.autoChooseMaxMin,
  };
}

/**
 * Give the job on an offer. `how`: 'customer' (they tapped OK) or 'auto' (silence). Returns { ok, reason }.
 * The promise is set before the handler runs so the arrival promise that starts on acceptance reads it.
 */
async function take(kind, doc, offer, how) {
  const Model = KINDS[kind].model();
  const promise = { by: offer.by, minutes: offer.minutes, arriveBy: offer.arriveBy, chosenAt: new Date(), how };
  const held = { _id: doc._id, status: { $in: WAITING[kind].status }, ...WAITING[kind].unheld };
  const set = await Model.updateOne(held, { $set: { 'matching.promise': promise } });
  if (!set.modifiedCount) return { ok: false, reason: 'ALREADY_CLAIMED' };
  const r = await require('./fast-assign').TAKE[kind](parse(offer.by), doc._id);
  if (!r.ok) {
    // They can no longer take it (a new job, dues, gone offline for good): their offer goes, the job keeps waiting.
    await Model.updateOne({ _id: doc._id, 'matching.promise.by': offer.by }, { $set: { 'matching.promise': null }, $pull: { 'matching.offers': { by: offer.by } } });
    return { ok: false, reason: r.body?.code || 'CANNOT_TAKE', message: r.body?.error };
  }
  tellPros(kind, doc, offer).catch(() => {});
  return { ok: true };
}

async function tellPros(kind, doc, chosen) {
  const notify = require('../notification/notification.service').notify;
  const at = new Date(chosen.arriveBy).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const winner = parse(chosen.by);
  await notify({ recipient: winner, type: 'system_alert', title: `It is yours: be there by ${at}`, body: 'The customer is expecting you at the time you offered.', data: { jobId: String(doc._id), kind } });
}

/**
 * Every status change (jobs/job-events): once the job is no longer waiting, whoever still has an offer standing hears why
 * (another pro has it, or the customer cancelled), and the offers are cleared, once.
 */
async function onStatus(kind, doc) {
  if (!WAITING[kind] || isWaiting(kind, doc)) return;
  const Model = KINDS[kind].model();
  const fresh = await Model.findOneAndUpdate({ _id: doc._id, 'matching.offers.0': { $exists: true } }, { $set: { 'matching.offers': [] } }, { new: false }).select('matching status workerId shopId').lean();
  if (!fresh) return;
  const holder = fresh.workerId ? `worker:${fresh.workerId}` : fresh.shopId ? `shop:${fresh.shopId}` : null;
  const cancelled = KINDS[kind].ops?.terminal?.includes(doc.status) && !holder;
  const notify = require('../notification/notification.service').notify;
  for (const o of fresh.matching?.offers || []) {
    if (o.by === holder) continue;
    await notify({
      recipient: parse(o.by), type: 'system_alert',
      title: cancelled ? 'That booking was cancelled' : 'That job went to another pro',
      body: 'Thanks for offering a time. More jobs near you will ring.', data: { jobId: String(doc._id), kind },
    }).catch(() => {});
  }
}

/** The customer says OK to one offer. */
async function choose({ jobId, userId, by }) {
  const found = await findJob(jobId, '');
  if (!found || String(found.doc.userId) !== String(userId)) throw err(404, 'NOT_FOUND', 'Booking not found');
  const { kind, doc } = found;
  if (!isWaiting(kind, doc)) throw err(409, 'ALREADY_CLAIMED', 'Someone already has this booking.');
  const offer = live(doc).find((o) => o.by === by);
  if (!offer) throw err(410, 'OFFER_GONE', 'That offer is no longer open. Pick another.');
  const r = await take(kind, doc, offer, 'customer');
  if (!r.ok) throw err(409, r.reason, 'They can no longer take it. Pick another, or keep waiting.');
  return { ok: true, kind };
}

/** From the waves sweep: the customer said nothing; take the soonest offer for them when it is soon enough. Returns true when given. */
async function autoChoose(kind, doc, now = Date.now()) {
  const offers = live(doc, now).sort((a, b) => new Date(a.arriveBy) - new Date(b.arriveBy));
  if (!offers.length || doc.matching?.promise) return false;
  const s = await settings();
  const first = Math.min(...offers.map((o) => new Date(o.at).getTime()));
  if (now - first < s.customerDecisionSec * 1000) return false;
  for (const offer of offers) {
    if (offer.minutes > s.autoChooseMaxMin) break;
    const r = await take(kind, doc, offer, 'auto').catch((e) => { logger.warn({ err: e.message, kind, id: String(doc._id) }, '[offers] auto take failed'); return { ok: false }; });
    if (r.ok) return true;
  }
  return false;
}

module.exports = { offerLater, viewFor, choose, autoChoose, onStatus, live, isWaiting, WAITING };
