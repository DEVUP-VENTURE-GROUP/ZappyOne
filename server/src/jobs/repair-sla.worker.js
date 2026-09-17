/**
 * Repair SLA watchdog
 * ----------------------------------------------------------------------------
 * Sweeps every minute for repairs that have run past the stage they are in.
 *
 * The one stage it ACTS on is acceptance. A repair is assigned to a single
 * provider, so if that provider does not answer within their window the
 * customer is simply waiting on nobody — the job is taken back and offered to
 * someone else. Everything after acceptance is a flag, not an intervention: a
 * technician whose hands are inside a phone does not need the platform
 * cancelling their work because a timer expired.
 *
 * The clock never runs while we are waiting on the customer — see
 * sla.service.js — so nobody is marked late for the customer's thinking time.
 * ----------------------------------------------------------------------------
 */

require('dotenv').config();
const { connectMongo } = require('../config/mongo');
const { RepairBooking } = require('../modules/repair/models/booking.model');
const eventsService = require('../modules/repair/services/events.service');
const slaService = require('../modules/repair/services/sla.service');
const logger = require('../utils/logger');

/** How far past due before operations is told about a stage that is not acceptance. */
const ESCALATE_AFTER_MIN = 10;

/**
 * Take an unanswered job back.
 *
 * Deliberately the same shape as a provider declining it: the assignment is
 * released, anything held for them is freed, and the reason is recorded — so a
 * provider who never answers and one who says no leave the same clean state
 * behind for the next provider.
 */
async function reclaimUnaccepted(booking) {
  const bookingService = require('../modules/repair/services/booking.service');

  if (booking.partId) {
    await bookingService
      .releaseStock({ shopId: booking.shopId, workerId: booking.workerId, partId: booking.partId })
      .catch(() => {});
  }

  const minutesLate = Math.round((Date.now() - new Date(booking.stageDeadlineAt).getTime()) / 60000);

  await RepairBooking.updateOne(
    { _id: booking._id, status: 'PROVIDER_ASSIGNED' },
    {
      $set: {
        status: 'CONFIRMED',
        workerId: null,
        shopId: null,
        partId: null,
        stageDeadlineAt: null,
      },
      $push: {
        declines: {
          providerKind: booking.shopId ? 'shop' : 'worker',
          providerId: booking.shopId || booking.workerId,
          reason: 'no_response',
          at: new Date(),
        },
        slaBreaches: {
          stage: 'accept',
          dueAt: booking.stageDeadlineAt,
          minutesLate,
          at: new Date(),
        },
        statusHistory: {
          status: 'CONFIRMED',
          at: new Date(),
          actorRole: 'system',
          reason: 'provider_did_not_respond',
        },
      },
    },
  );

  // Pull the alert off their screen — a job they no longer have must not keep
  // ringing at them.
  eventsService.announceOfferClosed(booking, 'timed_out');

  /**
   * "Released for reassignment" now actually reassigns it.
   *
   * Releasing set the booking back to CONFIRMED with nobody on it and left it
   * there — no retry, no queue, no alert to anyone. A customer whose technician
   * simply never answered was silently parked forever, and the only way anybody
   * found out was the customer asking. Orders have a dispatch loop; repairs had
   * the release half of one and none of the retry.
   */
  const handed = await bookingService.redispatch(booking._id).catch((err) => {
    logger.error(
      { bookingId: String(booking._id), err: err.message },
      '[repair-sla] re-dispatch failed after release',
    );
    return { assigned: false, reason: 'error' };
  });

  logger.warn(
    {
      bookingId: String(booking._id),
      reference: booking.reference,
      minutesLate,
      reoffered: handed.assigned,
      reason: handed.assigned ? undefined : handed.reason,
    },
    handed.assigned
      ? '[repair-sla] provider did not answer — job re-offered to the next provider'
      : '[repair-sla] provider did not answer — job released, nobody else available',
  );

  return { reclaimed: true, reoffered: handed.assigned };
}

/** Flag a stage that has overrun, once, without touching the work itself. */
async function flagLate(booking) {
  const minutesLate = Math.round((Date.now() - new Date(booking.stageDeadlineAt).getTime()) / 60000);
  const stage = slaService.STAGE_FOR_STATUS[booking.status]?.stage || booking.status;

  // Record it once per stage — a sweep every minute must not write a breach a
  // minute for the same overrun.
  const alreadyFlagged = (booking.slaBreaches || []).some((b) => b.stage === stage);
  if (!alreadyFlagged) {
    await RepairBooking.updateOne(
      { _id: booking._id },
      { $push: { slaBreaches: { stage, dueAt: booking.stageDeadlineAt, minutesLate, at: new Date() } } },
    );
  }

  if (minutesLate >= ESCALATE_AFTER_MIN) {
    logger.error(
      { bookingId: String(booking._id), reference: booking.reference, stage, minutesLate, status: booking.status },
      '[repair-sla] job well past its stage — needs someone to look at it',
    );
  }

  return { flagged: !alreadyFlagged };
}

async function sweep() {
  const overdue = await RepairBooking.find({
    stageDeadlineAt: { $ne: null, $lt: new Date() },
    status: { $nin: slaService.NO_CLOCK },
  })
    .limit(200)
    .lean();

  let reclaimed = 0;
  let flagged = 0;

  for (const booking of overdue) {
    try {
      if (booking.status === 'PROVIDER_ASSIGNED') {
        await reclaimUnaccepted(booking);
        reclaimed += 1;
      } else {
        const res = await flagLate(booking);
        if (res.flagged) flagged += 1;
      }
    } catch (err) {
      // One bad booking must not stop the sweep for the rest.
      logger.error({ err: err.message, bookingId: String(booking._id) }, '[repair-sla] sweep item failed');
    }
  }

  if (reclaimed || flagged) {
    logger.info({ reclaimed, flagged, scanned: overdue.length }, '[repair-sla] sweep complete');
  }
  return { scanned: overdue.length, reclaimed, flagged };
}

if (require.main === module) {
  connectMongo()
    .then(async () => {
      logger.info('[repair-sla] watchdog started');
      await sweep();
      setInterval(() => sweep().catch((err) => logger.error({ err: err.message }, '[repair-sla] sweep failed')), 60 * 1000);
    })
    .catch((err) => {
      logger.error({ err: err.message }, '[repair-sla] failed to start');
      process.exit(1);
    });
}

module.exports = { sweep, reclaimUnaccepted, flagLate };
