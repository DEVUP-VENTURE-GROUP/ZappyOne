const http = require("http");
const buildApp = require("./app");
const config = require("./config");
const logger = require("./core/logger");
const { connectMongo } = require("./config/mongo");
const { initSockets } = require("./sockets");
const { ensureAdminSeeded } = require("./modules/admin/admin.seed");
const { seedPlans } = require("./modules/subscription/plan.seed");
const { seedEventCategories } = require("./modules/events/event-category.seed");
const EventBooking = require("./modules/events/event-booking.model");

/**
 * Startup reconciliation: reset workers who are marked unavailable but whose
 * current order has already reached a terminal state (completed/cancelled/failed).
 * Ts handles crashes or restarts that left worker state inconsistent.
 */
async function reconcileWorkers() {
  try {
    const Worker = require("./modules/worker/worker.model");
    const Order = require("./modules/order/order.model");
    const geoService = require("./modules/worker/geo.service");

    const TERMINAL_STATUSES = ["completed", "cancelled", "failed"];

    const stuckWorkers = await Worker.find({
      isAvailable: false,
      currentOrderId: { $ne: null },
    })
      .select("_id currentOrderId")
      .lean();

    if (stuckWorkers.length === 0) {
      logger.info("[RECONCILE] No stuck workers found");
      return;
    }

    logger.info(
      { count: stuckWorkers.length },
      "[RECONCILE] Checking stuck workers",
    );

    let resetCount = 0;
    for (const worker of stuckWorkers) {
      const order = await Order.findById(worker.currentOrderId)
        .select("status")
        .lean();
      if (!order || TERMINAL_STATUSES.includes(order.status)) {
        await Worker.updateOne(
          { _id: worker._id },
          { $set: { isAvailable: true, currentOrderId: null } },
        );
        await geoService.setAvailability(String(worker._id), true);
        resetCount++;
        logger.info(
          {
            workerId: worker._id,
            orderId: worker.currentOrderId,
            orderStatus: order?.status || "missing",
          },
          "[RECONCILE] Worker reset",
        );
      }
    }

    logger.info(
      { checked: stuckWorkers.length, reset: resetCount },
      "[RECONCILE] Worker reconciliation complete",
    );
  } catch (err) {
    logger.error(
      { err: err.message },
      "[RECONCILE] Worker reconciliation failed — continuing startup",
    );
  }
}

function warnMissingEnv() {
  const criticalForFCM = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
  ];
  const missingFCM = criticalForFCM.filter((k) => !process.env[k]);
  if (missingFCM.length > 0) {
    logger.warn(
      { missing: missingFCM },
      "[STARTUP] Firebase env vars missing — push notifications will be disabled. Set these before going live.",
    );
  }
  if (!process.env.CASHFREE_APP_ID || !process.env.CASHFREE_SECRET_KEY) {
    logger.warn(
      "[STARTUP] Cashfree credentials missing — payment collection will fail. Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY.",
    );
  }
  if (!process.env.CLIENT_URL && process.env.NODE_ENV === "production") {
    logger.warn(
      "[STARTUP] CLIENT_URL not set in production — CORS will reject all browser requests.",
    );
  }
}

async function start() {
  warnMissingEnv();
  await connectMongo();
  await reconcileWorkers();
  await ensureAdminSeeded();
  await seedPlans();
  await seedEventCategories();

  const app = buildApp();
  const server = http.createServer(app);
  initSockets(server);

  /* Workers
     By default the API also runs the dispatch/notifications/stale/shield workers
     IN-PROCESS, so a single `npm start` works for dev and single-node prod.

     When you run dedicated worker processes (pm2 ecosystem / docker-compose), set
     RUN_INLINE_WORKERS=false on the API. Otherwise the stale-order sweep would run
     in BOTH the API and the standalone worker — double nudges, double re-dispatch,
     duplicate notifications. */
  const runInlineWorkers = process.env.RUN_INLINE_WORKERS !== 'false';
  if (runInlineWorkers) {
    startDispatchWorker();
    startNotificationsWorker();
    startStaleOrderWorker();
    startRepairSlaWorker();
    startPetScheduler();
    startShieldPayoutWorker();
    startMatchingWaves();
    startTimedMessages();
    // Backup for missed Cashfree webhooks; capture is exactly-once, so overlap is harmless.
    setInterval(() => {
      require('./modules/payment/payment.service').reconcilePendingIntents()
        .catch((err) => logger.warn({ err: err.message }, '[PAYMENT] reconcile sweep failed'));
    }, 3 * 60 * 1000);
    logger.info('[BOOT] Inline workers started (dispatch, notifications, stale, shield, payment reconcile). Set RUN_INLINE_WORKERS=false when using dedicated worker processes.');
  } else {
    logger.info('[BOOT] RUN_INLINE_WORKERS=false — API only. Dispatch/notifications/stale/shield must run as dedicated processes.');
  }
  startWorkerHeartbeatSweep();

  // Expire pending_payment event bookings older than 30 minutes every 5 min
  setInterval(
    async () => {
      try {
        const cutoff = new Date(Date.now() - 30 * 60 * 1000);
        const expired = await EventBooking.updateMany(
          { status: "pending_payment", createdAt: { $lt: cutoff } },
          {
            $set: {
              status: "cancelled",
              cancellationReason: "payment_timeout",
            },
            $push: {
              statusHistory: {
                status: "cancelled",
                meta: { reason: "payment_timeout" },
              },
            },
          },
        );
        if (expired.modifiedCount > 0) {
          logger.info(
            { count: expired.modifiedCount },
            "[EVENT] Expired pending_payment bookings cancelled",
          );
        }
      } catch (err) {
        logger.warn(
          { err: err.message },
          "[EVENT] Booking expiry sweep failed",
        );
      }
    },
    5 * 60 * 1000,
  );

  server.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, "API server listening");
  });

  const shutdown = (signal) => async () => {
    logger.info({ signal }, "Shutting down");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", shutdown("SIGTERM"));
  process.on("SIGINT", shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) =>
    logger.error({ reason }, "Unhandled rejection"),
  );
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception");
    process.exit(1);
  });
}

function startDispatchWorker() {
  try {
    const { Worker: BullWorker } = require("bullmq");
    const { createBullConnection } = require("./config/redis");
    const { QUEUES } = require("./jobs");
    const { processDispatchJob } = require("./jobs/dispatch.worker");

    const worker = new BullWorker(QUEUES.DISPATCH, processDispatchJob, {
      connection: createBullConnection(),
      prefix: require('./config/redis').bullPrefix,
      concurrency: 5, // was 10 — each concurrent job held a Redis sub-connection
      lockDuration: 300_000,
    });

    worker.on("completed", (job, result) =>
      logger.info({ jobId: job.id, result }, "[DISPATCH] Job completed"),
    );
    worker.on("failed", (job, err) =>
      logger.error(
        { jobId: job?.id, err: err.message },
        "[DISPATCH] Job failed",
      ),
    );
    worker.on("error", (err) =>
      logger.error({ err: err.message }, "[DISPATCH] Worker error"),
    );

    logger.info("[DISPATCH] Worker running in-process");
  } catch (err) {
    logger.error(
      { err: err.message },
      "[DISPATCH] Failed to start worker — dispatch will not work",
    );
  }
}

function startNotificationsWorker() {
  try {
    const { Worker: BullWorker } = require("bullmq");
    const { createBullConnection } = require("./config/redis");
    const { QUEUES } = require("./jobs");
    const { processJob } = require("./jobs/notifications.worker");

    const worker = new BullWorker(QUEUES.NOTIFICATIONS, processJob, {
      connection: createBullConnection(),
      prefix: require('./config/redis').bullPrefix,
      concurrency: 5,
    });
    worker.on("failed", (job, err) =>
      logger.error(
        { jobId: job?.id, err: err.message },
        "[NOTIFICATIONS] Job failed",
      ),
    );
    worker.on("error", (err) =>
      logger.error({ err: err.message }, "[NOTIFICATIONS] Worker error"),
    );
    logger.info("[NOTIFICATIONS] Worker running in-process");
  } catch (err) {
    logger.error(
      { err: err.message },
      "[NOTIFICATIONS] Failed to start worker",
    );
  }
}

/**
 * Pet care on a timer: offers a chosen provider never answered go back to the
 * pool (every minute), and recurring schedules create their next bookings
 * (hourly; idempotent per occurrence, so an overlap never double-books).
 */
function startPetScheduler() {
  try {
    const pet = require("./modules/pet/services/booking.service");
    const release = () => pet.releaseStaleAssignments()
      .catch((err) => logger.error({ err: err.message }, "[pet] Releasing unanswered offers failed"));
    const recur = () => pet.generateAllDue()
      .catch((err) => logger.error({ err: err.message }, "[pet] Recurring generation failed"));
    release();
    recur();
    setInterval(release, 60 * 1000);
    setInterval(recur, 60 * 60 * 1000);
    logger.info("[pet] Scheduler running in-process");
  } catch (err) {
    logger.error({ err: err.message }, "[pet] Failed to start scheduler");
  }
}

function startRepairSlaWorker() {
  try {
    const { sweep } = require("./jobs/repair-sla.worker");
    // A repair stage is measured in minutes, so the sweep runs every minute —
    // a job nobody answered must not sit unassigned while the customer waits.
    sweep().catch((err) =>
      logger.error({ err: err.message }, "[repair-sla] Initial sweep failed"),
    );
    setInterval(
      () =>
        sweep().catch((err) =>
          logger.error({ err: err.message }, "[repair-sla] Sweep failed"),
        ),
      60 * 1000,
    );
    logger.info("[repair-sla] Repair SLA watchdog running in-process (sweeps every minute)");
  } catch (err) {
    logger.error({ err: err.message }, "[repair-sla] Failed to start watchdog");
  }
}

function startStaleOrderWorker() {
  try {
    const { sweep } = require("./jobs/stale-order.worker");
    // Run sweep immediately on start, then every 2 minutes
    sweep().catch((err) =>
      logger.error({ err: err.message }, "[STALE] Initial sweep failed"),
    );
    setInterval(
      () =>
        sweep().catch((err) =>
          logger.error({ err: err.message }, "[STALE] Sweep failed"),
        ),
      2 * 60 * 1000,
    );
    logger.info(
      "[STALE] Stale-order watchdog running in-process (sweeps every 2 minutes)",
    );
  } catch (err) {
    logger.error({ err: err.message }, "[STALE] Failed to start watchdog");
  }
}

function startWorkerHeartbeatSweep() {
  /*
   * Presence (worker/presence): a worker silent past the presence window is
   * set offline and their app is told. Every minute, so a closed phone stops
   * being offered jobs within minutes instead of half an hour.
   */
  const presence = require("./modules/worker/presence");
  const run = () => presence.sweep().catch((err) => logger.warn({ err: err.message }, "[PRESENCE] sweep failed"));
  run();
  setInterval(run, 60 * 1000);
  logger.info("[PRESENCE] Silent-worker sweep running (every minute)");
}

function startTimedMessages() {
  // Rate reminders, Monday summaries for providers, the 8 am summary for ops (messaging/lifecycle).
  const lifecycle = require("./modules/messaging/lifecycle");
  setInterval(() => {
    lifecycle.sweep().catch((err) => logger.warn({ err: err.message }, "[MESSAGES] timed sweep failed"));
  }, 5 * 60 * 1000);
  logger.info("[MESSAGES] Timed messages running (every 5 minutes)");
}

function startMatchingWaves() {
  // Jobs nobody has taken: re-offer repairs, ask offline providers nearby to come online, tell the customer (jobs/waves).
  const waves = require("./modules/jobs/waves");
  setInterval(() => {
    waves.sweep().catch((err) => logger.warn({ err: err.message }, "[WAVES] sweep failed"));
    // Arrival promises past due with nobody there: customer told, provider nudged (jobs/promise).
    require("./modules/jobs/promise").sweep().catch((err) => logger.warn({ err: err.message }, "[PROMISE] sweep failed"));
    // Automatic surge: every active zone, every minute (jobs/surge).
    require("./modules/jobs/surge").tick().catch((err) => logger.warn({ err: err.message }, "[SURGE] tick failed"));
  }, 60 * 1000);
  // Weather where people are booking, for the rain line (jobs/weather), every 10 minutes.
  setInterval(() => {
    require("./modules/jobs/surge").pollWeather().catch((err) => logger.warn({ err: err.message }, "[WEATHER] poll failed"));
  }, 10 * 60 * 1000);
  logger.info("[WAVES] Finding-someone waves running (every minute)");
}

function startShieldPayoutWorker() {
  try {
    require("./jobs/shield-payout.worker");
    logger.info("[SHIELD] Shield payout worker running in-process");
  } catch (err) {
    logger.error(
      { err: err.message },
      "[SHIELD] Failed to start shield payout worker",
    );
  }
}

start().catch((err) => {
  logger.error({ err }, "Startup failure");
  process.exit(1);
});
