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

async function sweep({ now = Date.now() } = {}) {
  const { waveMin, slowMin } = await timings();
  const events = require('./job-events');
  const out = { reoffered: 0, offlineWaves: 0, slowNotices: 0 };

  for (const [kind, w] of Object.entries(WAITING)) {
    const Model = KINDS[kind].model();
    const docs = await Model.find({ status: { $in: w.status }, ...w.unheld, createdAt: { $gte: new Date(now - 2 * 86400000) } })
      .limit(200).lean();
    for (const d of docs) {
      d._kind = kind;
      const waitedMin = (now - waitingSince(d)) / 60000;
      try {
        // Repairs: try the round again; someone may have come online.
        if (kind === 'repair') {
          const r = await require('../repair/services/booking/assignment').redispatch(d._id).catch(() => null);
          if (r?.assigned) { out.reoffered += 1; continue; }
        }

        if (waitedMin >= waveMin && !d.matching?.offlineWaveAt) {
          const claimed = await Model.updateOne(
            { _id: d._id, 'matching.offlineWaveAt': null },
            { $set: { 'matching.offlineWaveAt': new Date(now) } },
          );
          if (claimed.modifiedCount) {
            await alertOffline(kind, d);
            out.offlineWaves += 1;
          }
        }

        if (waitedMin >= slowMin && !d.matching?.slowNoticeAt) {
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

module.exports = { sweep, timings, alertOffline };
