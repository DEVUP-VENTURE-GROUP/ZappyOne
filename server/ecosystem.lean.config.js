/**
 * LEAN profile — for a single small EC2 box (t2.micro / t3.small).
 *
 *     pm2 delete all
 *     pm2 start ecosystem.lean.config.js
 *     pm2 save && pm2 startup
 *
 * Why this exists
 * ---------------
 * ecosystem.config.js runs 8 separate processes (~900MB). That buys isolation, but
 * it will OOM a 1-2GB box. Here the API keeps hosting the four hot workers
 * in-process (RUN_INLINE_WORKERS defaults to true) — exactly what it always did —
 * and we only add dedicated processes for the three that were NEVER running:
 * dlq, payments and retention.
 *
 *   4 processes, ~400MB, and nothing is silently missing.
 *
 * Trade-off vs the full profile: a crash in the dispatch/notifications/stale/shield
 * worker restarts the API with it. For a single-node deployment that is an
 * acceptable price; move to ecosystem.config.js once you outgrow one box.
 */

const common = {
  cwd: __dirname,
  autorestart: true,
  // Retry with a growing delay instead of giving up after a fixed count (see ecosystem.config.js).
  exp_backoff_restart_delay: 500,
  max_restarts: 1000,
  min_uptime: 10000,
  exec_mode: 'fork',                 // never cluster: socket.io + in-memory geo buffer
  env: { NODE_ENV: 'production' },
  time: true,
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'zappy-api',
      script: 'src/server.js',
      max_memory_restart: '700M',
      // Inline workers ON (the default): dispatch, notifications, stale, shield all
      // run inside the API process, as they always have.
      env: { NODE_ENV: 'production', RUN_INLINE_WORKERS: 'true' },
    },

    // The auto-refund pipeline: dispatch exhausts retries -> DLQ -> refund.
    // Neither of these has ever run in production, so a customer who PAID and
    // never got a worker was never refunded and support was never alerted.
    {
      ...common,
      name: 'zappy-dlq',
      script: 'src/jobs/dlq.worker.js',
      max_memory_restart: '250M',
    },
    {
      ...common,
      name: 'zappy-payments',
      script: 'src/jobs/payments.worker.js',
      max_memory_restart: '250M',
    },

    // "Service due" rebook reminders.
    {
      ...common,
      name: 'zappy-retention',
      script: 'src/jobs/retention.worker.js',
      max_memory_restart: '250M',
    },
  ],
};
