/**
 * Subscription expiry sweeper.
 *
 * Run on a cron (every 5–15 min) or as a long-lived process.
 * Marks active subscriptions whose endAt has passed as `expired`,
 * then busts the active-subscription cache.
 *
 *   node scripts/expire-subscriptions.js          # one-shot
 *   node scripts/expire-subscriptions.js --loop   # forever, every 5 min
 */
require('dotenv').config();
const { connectMongo } = require('../src/config/mongo');
const subscriptionService = require('../src/modules/subscription/subscription.service');
const logger = require('../src/core/logger');

async function once() {
  const n = await subscriptionService.expireOverdue();
  logger.info({ expired: n }, 'Sweeper run complete');
  return n;
}

(async () => {
  await connectMongo();
  if (process.argv.includes('--loop')) {
    while (true) {
      try { await once(); } catch (err) { logger.error({ err: err.message }, 'Sweep failed'); }
      await new Promise((r) => setTimeout(r, 5 * 60 * 1000));
    }
  } else {
    await once();
    process.exit(0);
  }
})();
