/**
 * Live Hourly Job Timer
 * For construction/mason jobs billed hourly.
 * Worker starts timer → customer sees live elapsed time + running cost.
 * Worker can pause for breaks. Customer approves final time at completion.
 *
 * No Indian home service app has a live in-app timer for hourly jobs.
 * Urban Company hourly pricing is fixed upfront, not tracked live.
 */
const { redis } = require('../../config/redis');
const logger    = require('../../core/logger');

const TIMER_KEY    = (orderId) => `job_timer:${orderId}`;
const TIMER_TTL    = 86400 * 2; // 2 days

/**
 * Start the timer. Uses SET NX for an atomic check-and-set to prevent TOCTOU races.
 */
async function startTimer({ orderId, workerId, perHourPaise }) {
  const now = Date.now();
  const state = {
    orderId:       String(orderId),
    workerId:      String(workerId),
    perHourPaise,
    startedAt:     now,
    totalPausedMs: 0,
    pauses:        [],
    status:        'running',
  };

  /* SET NX: only succeeds if the key doesn't exist — atomic, no TOCTOU */
  const created = await redis.set(TIMER_KEY(orderId), JSON.stringify(state), 'EX', TIMER_TTL, 'NX');
  if (!created) {
    /* Key already exists — check if it's already running */
    const existing = await redis.get(TIMER_KEY(orderId));
    if (existing) {
      const prev = JSON.parse(existing);
      if (prev.status === 'running') throw Object.assign(new Error('Timer already running'), { status: 409 });
      if (prev.status === 'stopped') throw Object.assign(new Error('Timer already stopped'), { status: 409 });
    }
    throw Object.assign(new Error('Timer already exists'), { status: 409 });
  }

  await broadcastTimerUpdate(orderId, state);
  logger.info({ orderId, perHourPaise }, '[JobTimer] Started');
  return getTimerStatus(state);
}

async function pauseTimer({ orderId, workerId }) {
  const raw = await redis.get(TIMER_KEY(orderId));
  if (!raw) throw Object.assign(new Error('Timer not found'), { status: 404 });
  const state = JSON.parse(raw);
  if (state.status !== 'running') throw Object.assign(new Error('Timer not running'), { status: 409 });
  if (String(state.workerId) !== String(workerId)) throw Object.assign(new Error('Not your timer'), { status: 403 });

  const now = Date.now();
  state.pauses.push({ pausedAt: now });
  state.status = 'paused';
  await redis.setex(TIMER_KEY(orderId), TIMER_TTL, JSON.stringify(state));
  await broadcastTimerUpdate(orderId, state);
  return getTimerStatus(state);
}

async function resumeTimer({ orderId, workerId }) {
  const raw = await redis.get(TIMER_KEY(orderId));
  if (!raw) throw Object.assign(new Error('Timer not found'), { status: 404 });
  const state = JSON.parse(raw);
  if (state.status !== 'paused') throw Object.assign(new Error('Timer not paused'), { status: 409 });
  if (String(state.workerId) !== String(workerId)) throw Object.assign(new Error('Not your timer'), { status: 403 });

  const now = Date.now();
  const lastPause = state.pauses[state.pauses.length - 1];
  if (lastPause && !lastPause.resumedAt) {
    lastPause.resumedAt   = now;
    state.totalPausedMs  += now - lastPause.pausedAt;
  }
  state.status = 'running';
  await redis.setex(TIMER_KEY(orderId), TIMER_TTL, JSON.stringify(state));
  await broadcastTimerUpdate(orderId, state);
  return getTimerStatus(state);
}

async function stopTimer({ orderId, workerId }) {
  const raw = await redis.get(TIMER_KEY(orderId));
  if (!raw) throw Object.assign(new Error('Timer not found'), { status: 404 });
  const state = JSON.parse(raw);
  if (String(state.workerId) !== String(workerId)) throw Object.assign(new Error('Not your timer'), { status: 403 });
  if (state.status === 'stopped') throw Object.assign(new Error('Timer already stopped'), { status: 409 });

  const now = Date.now();

  /* Close any open pause */
  const lastPause = state.pauses[state.pauses.length - 1];
  if (lastPause && !lastPause.resumedAt && state.status === 'paused') {
    lastPause.resumedAt  = now;
    state.totalPausedMs += now - lastPause.pausedAt;
  }

  const wallMs     = now - state.startedAt;
  /* Guard against clock skew making billableMs negative */
  const billableMs = Math.max(0, wallMs - state.totalPausedMs);
  const billableHours = billableMs / 3600000;
  const totalPaise    = Math.round(billableHours * state.perHourPaise);

  state.status       = 'stopped';
  state.stoppedAt    = now;
  state.billableMs   = billableMs;
  state.totalPaise   = totalPaise;

  await redis.setex(TIMER_KEY(orderId), TIMER_TTL, JSON.stringify(state));
  await broadcastTimerUpdate(orderId, state);
  logger.info({ orderId, billableHours: billableHours.toFixed(2), totalPaise }, '[JobTimer] Stopped');
  return getTimerStatus(state);
}

async function getTimer(orderId) {
  const raw = await redis.get(TIMER_KEY(orderId));
  if (!raw) return null;
  return getTimerStatus(JSON.parse(raw));
}

function getTimerStatus(state) {
  const now = Date.now();
  let elapsedMs = 0;

  if (state.status === 'running') {
    elapsedMs = Math.max(0, (now - state.startedAt) - state.totalPausedMs);
  } else if (state.status === 'stopped') {
    elapsedMs = state.billableMs ?? 0;
  } else {
    /* paused — elapsed up to last pause */
    const lastPause = state.pauses[state.pauses.length - 1];
    const pausedAt  = lastPause?.pausedAt || now;
    elapsedMs = Math.max(0, (pausedAt - state.startedAt) - state.totalPausedMs);
  }

  const elapsedMin     = elapsedMs / 60000;
  const elapsedHours   = elapsedMs / 3600000;
  const runningCostPaise = Math.round(elapsedHours * state.perHourPaise);

  return {
    orderId:     state.orderId,
    status:      state.status,
    elapsedMs,
    elapsedMin:  Math.round(elapsedMin),
    elapsedHoursLabel: `${Math.floor(elapsedHours)}h ${Math.round((elapsedHours % 1) * 60)}m`,
    runningCostPaise,
    runningCostRupees: Math.round(runningCostPaise / 100),
    perHourPaise: state.perHourPaise,
    perHourRupees: Math.round(state.perHourPaise / 100),
    pauseCount:  state.pauses.length,
    totalPaiseFinal: state.totalPaise || null,
  };
}

async function broadcastTimerUpdate(orderId, state) {
  const { redis: r } = require('../../config/redis');
  await r.publish('order:event', JSON.stringify({
    orderId: String(orderId),
    event:   'timer.update',
    payload: getTimerStatus(state),
  }));
}

module.exports = { startTimer, pauseTimer, resumeTimer, stopTimer, getTimer };
