/**
 * PM2 process definitions for EC2 (single-node production).
 *
 * Run everything:
 *     cd server
 *     pm2 start ecosystem.config.js
 *     pm2 save && pm2 startup     # survive an EC2 reboot
 *
 * Why this file exists
 * --------------------
 * `npm start` alone runs the API *plus* dispatch/notifications/stale/shield
 * IN-PROCESS — but NOT the dlq, payments or retention workers. That meant, in
 * production:
 *   - dlq + payments never ran, so the auto-refund pipeline was dead: a customer
 *     who paid and never got a worker was NEVER refunded, and support was never
 *     alerted.
 *   - retention never ran, so "service due" reminders never fired.
 *
 * Here the API runs with RUN_INLINE_WORKERS=false and every worker is its own
 * supervised process, so nothing is silently missing and one crashing worker
 * cannot take the API down with it.
 *
 * Useful:
 *   pm2 status                 # what's alive
 *   pm2 logs zappy-dispatch    # tail one worker
 *   pm2 restart zappy-dispatch # after a deploy
 *   pm2 restart all
 */

const common = {
  cwd: __dirname,
  autorestart: true,
  max_restarts: 20,
  restart_delay: 3000,
  // NEVER cluster mode. Socket.io rooms and the in-memory geo write-buffer are
  // per-process; cluster would fan connections across workers that can't see each
  // other's rooms/buffers. `instances` is deliberately omitted for the same reason.
  exec_mode: 'fork',
  env: { NODE_ENV: 'production' },
  time: true,                       // timestamp every log line
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'zappy-api',
      script: 'src/server.js',
      max_memory_restart: '600M',
      // Workers run as dedicated processes below — the API must NOT also run them,
      // or the stale sweep would execute twice (duplicate nudges/notifications).
      env: { NODE_ENV: 'production', RUN_INLINE_WORKERS: 'false' },
    },

    // Matching
    {
      ...common,
      name: 'zappy-dispatch',
      script: 'src/jobs/dispatch.worker.js',
      max_memory_restart: '500M',
    },
    {
      ...common,
      name: 'zappy-notifications',
      script: 'src/jobs/notifications.worker.js',
      max_memory_restart: '300M',
    },
    {
      ...common,
      name: 'zappy-stale',
      script: 'src/jobs/stale-order.worker.js',
      max_memory_restart: '300M',
    },

    // Money: the auto-refund pipeline (dispatch fails -> DLQ -> refund)
    // These two were NOT running in production. Without them a paid customer with
    // no available worker is never refunded and support is never alerted.
    {
      ...common,
      name: 'zappy-dlq',
      script: 'src/jobs/dlq.worker.js',
      max_memory_restart: '300M',
    },
    {
      ...common,
      name: 'zappy-payments',
      script: 'src/jobs/payments.worker.js',
      max_memory_restart: '300M',
    },
    {
      ...common,
      name: 'zappy-shield',
      script: 'src/jobs/shield-payout.worker.js',
      max_memory_restart: '300M',
    },

    // Retention: "service due" rebook reminders
    {
      ...common,
      name: 'zappy-retention',
      script: 'src/jobs/retention.worker.js',
      max_memory_restart: '300M',
    },
  ],
};
