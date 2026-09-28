/**
 * Shield Payout Worker
 * Processes the 'shield' BullMQ queue.
 *
 * Job types:
 *   weekly_payout  — distributes last week's fund to affected workers (runs Monday IST morning)
 *   collect_pending — collect a specific user's pending fees (triggered at order creation)
 */

const { Worker } = require('bullmq');
const { createBullConnection } = require('../config/redis');
const shieldService = require('../modules/order/shield.service');
const logger        = require('../core/logger');

const shieldWorker = new Worker(
  'shield',
  async (job) => {
    const { name, data } = job;

    if (name === 'weekly_payout') {
      logger.info({ jobId: job.id }, 'Shield weekly payout started');
      const results = await shieldService.runWeeklyPayout({ triggeredBy: 'cron' });
      const paid    = results.filter(r => r.status === 'paid_out').length;
      const skipped = results.filter(r => r.status === 'skipped').length;
      logger.info({ paid, skipped }, 'Shield weekly payout complete');
      return { paid, skipped };
    }

    if (name === 'collect_pending') {
      const { userId, orderId } = data;
      const result = await shieldService.collectPendingFees(userId, orderId);
      logger.info({ userId, collected: result.collected }, 'Shield pending fee collection done');
      return result;
    }

    logger.warn({ name }, 'Shield worker: unknown job type');
  },
  {
    connection: createBullConnection(),
    concurrency: 2,
  }
);

shieldWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, name: job?.name, err: err.message }, 'Shield job failed');
});

module.exports = shieldWorker;
