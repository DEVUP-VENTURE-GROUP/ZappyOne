/**
 * Finding someone, in waves, for every kind of job nobody has taken yet.
 *
 *   now        live workers nearby are rung (job-events) / offered (repairs)
 *   wave 2     still nobody after staleNudgeMinutes (5): providers nearby who
 *              are OFFLINE get "a job near you is waiting, go online to take
 *              it". The customer never sees them; only live providers are
 *              shown or offered.
 *   slow       still nobody after staleRedispatchMinutes (10): the customer is
 *              told it is taking longer (and can boost); ops already sees the
 *              job in Needs intervention.
 *
 * Repairs are offered one provider at a time, so every minute the sweep also
 * tries the offer round again: someone may have come online.
 *
 * Both times are the first version's dispatch settings (PricingConfig).
 */
const { KINDS } = require('./kinds');
const logger = require('../../core/logger');

async function timings() {
  const cfg = await require('../pricing/services/config.service').getActiveConfig();
  return { waveMin: cfg.staleNudgeMinutes ?? 5, slowMin: cfg.staleRedispatchMinutes ?? 10 };
}

/** What is still waiting for someone, per kind. */
const WAITING = {
  repair: { status: ['CONFIRMED'], unheld: { workerId: null, shopId: null } },
  pet: { status: ['BOOKED', 'PROVIDER_SEARCHING'], unheld: { workerId: null, shopId: null } },
  helping: { status: ['CONFIRMED', 'WORKER_SEARCHING'], unheld: { workerId: null } },
};

/** When the job started waiting: the latest entry into a waiting status. */
function waitingSince(doc) {
  const hit = [...(doc.statusHistory || [])].reverse().find((h) => WAITING[doc._kind]?.status.includes(h.status));
  return new Date(hit?.at || doc.updatedAt || doc.createdAt).getTime();
}

const NO_PROVIDER = 'We could not find anyone available in time';

/** Nobody took it in time: closed, free, the customer told (booking.cancelled). */
async function closeUnmatched(kind, d) {
  if (kind === 'repair') {
    await require('../repair/services/booking.service').transition(d._id, 'EXPIRED', { actorRole: 'system', actorId: null, reason: NO_PROVIDER });
    return;
  }
  if (kind === 'helping') {
    const { HelpingTask } = require('../helping/models/task.model');
    const task = await HelpingTask.findById(d._id);
    if (task) await require('./cancel-fee').cancelHelping({ task, byRole: 'system', actorId: null, reason: NO_PROVIDER });
    return;
  }
  if (kind === 'pet') {
    await require('../pet/services/booking.service').cancelBooking({ bookingId: d._id, actorId: null, by: 'admin', reason: NO_PROVIDER });
  }
}

// Auto-accept the moment a job starts waiting, not at the next sweep; the same once-only claim as the sweep.
async function kick(kind, doc) {
  const w = WAITING[kind];
  if (!w?.status.includes(doc.status) || Object.keys(w.unheld).some((k) => doc[k]) || doc.matching?.autoTriedAt) return null;
  const fast = require('./fast-assign');
  const fa = await fast.settings();
  const later = doc.scheduledAt && new Date(doc.scheduledAt).getTime() - Date.now() > 60 * 60 * 1000;
  if (!fa.enabled || later) return null;
  const mine = await KINDS[kind].model().updateOne({ _id: doc._id, 'matching.autoTriedAt': null }, { $set: { 'matching.autoTriedAt': new Date() } });
  return mine.modifiedCount ? fast.tryAutoAccept(kind, doc, fa.autoAcceptKm) : null;
}

async function sweep({ now = Date.now() } = {}) {
  const { waveMin, slowMin } = await timings();
  // Wanted now: the two-minute clock (jobs/fast-assign), counted from when it was booked.
  const fa = await require('./fast-assign').settings();
  const fast = require('./fast-assign');
  const { unmatchedCloseMinutes = 15 } = await require('../order/cancellation.service').getConfig();
  const events = require('./job-events');
  const out = { reoffered: 0, offlineWaves: 0, slowNotices: 0, closed: 0 };

  for (const [kind, w] of Object.entries(WAITING)) {
    const Model = KINDS[kind].model();
    const docs = await Model.find({ status: { $in: w.status }, ...w.unheld, createdAt: { $gte: new Date(now - 2 * 86400000) } })
      .limit(200).lean();
    for (const d of docs) {
      d._kind = kind;
      const waitedMin = (now - waitingSince(d)) / 60000;
      const later = d.scheduledAt && new Date(d.scheduledAt).getTime() - now > 60 * 60 * 1000;
      const quick = fa.enabled && !later;
      // From when it last started waiting for a pro: a job handed back starts the clock again.
      const sinceBookedSec = (now - waitingSince(d)) / 1000;
      try {
        // Waited past the limit with nobody (from the booked time, if it is a later booking): closed free.
        const from = Math.max(waitingSince(d), d.scheduledAt ? new Date(d.scheduledAt).getTime() : 0);
        if ((now - from) / 60000 >= unmatchedCloseMinutes) {
          await closeUnmatched(kind, d);
          // If someone comes online near them soon, they are told (jobs/comeback).
          await require('./comeback').remember(kind, d);
          out.closed += 1;
          continue;
        }

        // Auto-accept at once: a pro who opted in, nearby, free (jobs/fast-assign).
        if (quick && !d.matching?.autoTriedAt) {
          const mine = await Model.updateOne({ _id: d._id, 'matching.autoTriedAt': null }, { $set: { 'matching.autoTriedAt': new Date(now) } });
          if (mine.modifiedCount && await fast.tryAutoAccept(kind, d, fa.autoAcceptKm)) { out.autoAccepted = (out.autoAccepted || 0) + 1; continue; }
        }
        // At the deadline, auto-accept again, further out, before telling the customer.
        if (quick && sinceBookedSec >= fa.deadlineSec && !d.matching?.autoWideTriedAt) {
          const mine = await Model.updateOne({ _id: d._id, 'matching.autoWideTriedAt': null }, { $set: { 'matching.autoWideTriedAt': new Date(now) } });
          if (mine.modifiedCount && await fast.tryAutoAccept(kind, d, fa.widenKm)) { out.autoAccepted = (out.autoAccepted || 0) + 1; continue; }
        }

        // Repairs: try the round again; someone may have come online.
        if (kind === 'repair') {
          const r = await require('../repair/services/booking/assignment').redispatch(d._id).catch(() => null);
          if (r?.assigned) { out.reoffered += 1; continue; }
        }

        if ((quick ? sinceBookedSec >= fa.firstLookSec + fa.broadcastSec : waitedMin >= waveMin) && !d.matching?.offlineWaveAt) {
          const claimed = await Model.updateOne(
            { _id: d._id, 'matching.offlineWaveAt': null },
            { $set: { 'matching.offlineWaveAt': new Date(now) } },
          );
          if (claimed.modifiedCount) {
            await alertOffline(kind, d);
            out.offlineWaves += 1;
          }
        }

        if ((quick ? sinceBookedSec >= fa.deadlineSec : waitedMin >= slowMin) && !d.matching?.slowNoticeAt) {
          const claimed = await Model.updateOne(
            { _id: d._id, 'matching.slowNoticeAt': null },
            { $set: { 'matching.slowNoticeAt': new Date(now) } },
          );
          if (claimed.modifiedCount) {
            out.slowNotices += 1;
            const boostable = await require('./boost-tip').boostView(kind, d).then((v) => v.available).catch(() => false);
            const f = await require('../messaging/facts').jobFacts(kind, d);
            await require('../messaging/send').send('booking.slow', { to: { kind: 'user', id: d.userId }, ctx: { f, boostable }, refId: `${kind}:${f.id}` });
          }
        }
      } catch (e) {
        logger.warn({ err: e.message, kind, id: String(d._id) }, '[waves] step failed');
      }
    }
  }
  return out;
}

/** Wave 2: providers nearby who can do it but are offline are asked to come online. */
async function alertOffline(kind, doc) {
  const events = require('./job-events');
  if (kind === 'repair') {
    const coords = doc.location?.coordinates;
    if (coords?.length !== 2) return;
    const providers = await require('../repair/services/matching.service')
      .findInspectors({ vertical: doc.vertical, lat: coords[1], lng: coords[0], cityCode: doc.location?.cityCode || null, includeOffline: true });
    const offline = providers.filter((p) => p.workerId && !p.live).slice(0, 30);
    await Promise.all(offline.map((p) => require('../messaging/send').send('provider.job_waiting', {
      to: { kind: 'worker', id: p.workerId }, ctx: { label: 'repair', km: p.distanceKm },
    })));
    return;
  }
  await events.alertNearbyProviders(kind, doc, { offlineOnly: true });
}

module.exports = { sweep, kick, timings, alertOffline, waitingSince };
