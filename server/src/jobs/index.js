const { Queue, QueueEvents } = require('bullmq');
const { createBullConnection, bullPrefix: prefix } = require('../config/redis');
const EventEmitter = require('events');

// BullMQ's internal Bus attaches many listeners — raise the limit to suppress warning
EventEmitter.defaultMaxListeners = 25;

const connection = createBullConnection();

const QUEUES = {
  DISPATCH:            'dispatch',
  DISPATCH_EMERGENCY:  'dispatch-emergency',
  NOTIFICATIONS:       'notifications',
  PAYMENTS:            'payments',
  DLQ:                 'dead-letter',   // Orders that exhausted all dispatch retries
};

const dispatchQueue = new Queue(QUEUES.DISPATCH, {
  connection,
  prefix,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { age: 3600, count: 1000 },
    // Keep failed jobs for 48h in BullMQ UI visibility; DLQ handles recovery.
    removeOnFail: { age: 172800 },
  },
});

const notificationsQueue = new Queue(QUEUES.NOTIFICATIONS, {
  connection,
  prefix,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: { age: 86400 },
  },
});

const paymentsQueue = new Queue(QUEUES.PAYMENTS, {
  connection,
  prefix,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000, maxDelay: 60000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 }, // 7 days — payment failures need audit trail
  },
});

// Dead Letter Queue — receives orders that failed all dispatch retries.
// A separate worker (dlq.worker.js) processes these: alerts support + triggers refund.
const dlqQueue = new Queue(QUEUES.DLQ, {
  connection,
  prefix,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 604800 }, // 7 days visibility for ops
    removeOnFail:    { age: 604800 },
  },
});

// Shield Fund queue — weekly payouts + deferred fee collection
const shieldQueue = new Queue('shield', {
  connection,
  prefix,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 604800 }, // 7 days
    removeOnFail:    { age: 1209600 }, // 14 days
  },
});

// Schedule the weekly Monday payout at 08:00 IST (02:30 UTC).
// BullMQ repeat jobs are idempotent on jobId — safe to re-register on every restart.
shieldQueue.add(
  'weekly_payout',
  {},
  {
    jobId:  'shield:weekly_payout',
    repeat: { pattern: '30 2 * * 1' }, // 02:30 UTC = 08:00 IST every Monday
  }
).catch(() => {}); // non-fatal if Redis is unavailable at startup

// Dedicated queue for emergency orders — separate concurrency pool, never waits behind
// regular orders. Same processDispatchJob logic, dedicated BullWorker in dispatch.worker.js.
const emergencyDispatchQueue = new Queue(QUEUES.DISPATCH_EMERGENCY, {
  connection,
  prefix,
  defaultJobOptions: {
    attempts: 3,  // one extra retry vs regular — emergencies get more chances
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600, count: 500 },
    removeOnFail: { age: 172800 },
  },
});

// Share one extra connection between both QueueEvents — saves 1 connection vs 2.
// BullMQ still creates internal BlockingConnections per QueueEvents for XREAD.
const eventsConn = createBullConnection();
const dispatchEvents = new QueueEvents(QUEUES.DISPATCH, { connection: eventsConn, prefix });
const emergencyDispatchEvents = new QueueEvents(QUEUES.DISPATCH_EMERGENCY, { connection: eventsConn, prefix });

function routeToDlq(queue) {
  return async ({ jobId, failedReason }) => {
    try {
      const job = await queue.getJob(jobId);
      if (!job) return;
      const { orderId } = job.data || {};
      if (!orderId) return;
      const maxAttempts = job.opts?.attempts ?? 2;
      if (job.attemptsMade < maxAttempts) return;
      await dlqQueue.add('dispatch_failed', {
        orderId, failedReason, originalJobId: jobId,
        failedAt: new Date().toISOString(),
        isEmergency: !!job.data?.isEmergency,
      }, { jobId: `dlq_${orderId}` });
    } catch { /* DLQ routing failure must never crash the event emitter */ }
  };
}

// Listen for exhausted dispatch jobs and route to DLQ
dispatchEvents.on('failed', routeToDlq(dispatchQueue));
emergencyDispatchEvents.on('failed', routeToDlq(emergencyDispatchQueue));

module.exports = {
  QUEUES,
  dispatchQueue,
  emergencyDispatchQueue,
  notificationsQueue,
  paymentsQueue,
  dlqQueue,
  shieldQueue,
  dispatchEvents,
  emergencyDispatchEvents,
};
