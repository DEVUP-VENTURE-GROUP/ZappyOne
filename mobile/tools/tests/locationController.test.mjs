// ServicePro background-location controller: the start/stop state machine, driven by fake native calls.
// Run from mobile/: node --experimental-strip-types --test tools/tests/locationController.test.mjs (Node's own test runner; it strips the TypeScript types).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocationController } from '../../apps/servicepro/src/captain/locationController.ts';

/** A fake expo-location: one native task, permissions, app state, and optional manual control of start/stop timing. */
function fakePlatform({ foreground = true, background = true, canAskBackground = true, active = true, startedAtLaunch = false } = {}) {
  const p = {
    native: { started: startedAtLaunch, pace: null },
    perm: { foreground, background, canAskBackground },
    active,
    calls: { start: 0, stop: 0, ask: 0 },
    inFlight: 0,
    holdStart: null, // a { promise, release } pair to keep a start pending
    failStart: false,
    grantOnAsk: false,
    onAsk: null,
  };
  const guard = async (fn) => {
    p.inFlight += 1;
    assert.equal(p.inFlight, 1, 'two native location calls overlapped');
    try { return await fn(); } finally { p.inFlight -= 1; }
  };
  p.platform = {
    hasStarted: async () => p.native.started,
    start: (trip) => guard(async () => {
      p.calls.start += 1;
      if (p.holdStart) await p.holdStart.promise;
      if (p.failStart) throw new Error('start failed');
      p.native.started = true;
      p.native.pace = trip;
    }),
    stop: () => guard(async () => { p.calls.stop += 1; p.native.started = false; p.native.pace = null; }),
    permissions: async () => ({ ...p.perm }),
    askBackground: async () => {
      p.calls.ask += 1;
      if (p.onAsk) await p.onAsk();
      if (p.grantOnAsk) p.perm.background = true;
    },
    canStartNow: () => p.active,
  };
  return p;
}

function hold() {
  let release;
  const promise = new Promise((r) => { release = r; });
  return { promise, release };
}

function setup(opts) {
  const p = fakePlatform(opts);
  const denied = [];
  const c = createLocationController(p.platform, { onDenied: (r) => denied.push(r) });
  return { p, c, denied };
}

test('offline -> online starts one task at the normal pace', async () => {
  const { p, c } = setup();
  await c.update({ known: true, online: true });
  assert.equal(p.native.started, true);
  assert.equal(p.native.pace, false);
  assert.equal(p.calls.start, 1);
  assert.equal(c.running, true);
});

test('online -> offline stops the task', async () => {
  const { p, c } = setup();
  await c.update({ known: true, online: true });
  await c.update({ known: true, online: false });
  assert.equal(p.native.started, false);
  assert.equal(c.running, false);
});

test('online -> offline while the start is still pending: offline wins, nothing is left running', async () => {
  const { p, c } = setup();
  p.holdStart = hold();
  const going = c.update({ known: true, online: true });
  await new Promise((r) => setImmediate(r)); // the start is now in flight
  assert.equal(p.calls.start, 1);
  const leaving = c.update({ known: true, online: false });
  p.holdStart.release();
  await Promise.all([going, leaving]);
  assert.equal(p.native.started, false, 'a start that finished after going offline must be stopped');
  assert.equal(c.running, false);
});

test('offline -> online -> logout stops the task', async () => {
  const { p, c } = setup();
  await c.update({ known: true, online: true });
  await c.update({ known: true, online: false }); // signed out is reported as known and offline (CaptainMode)
  assert.equal(p.native.started, false);
});

test('location denied: nothing starts and the pro is told once', async () => {
  const { p, c, denied } = setup({ foreground: false });
  await c.update({ known: true, online: true });
  await c.revalidate();
  await c.revalidate();
  assert.equal(p.native.started, false);
  assert.deepEqual(denied, ['foreground']);
});

test('background denied: asked once per run, then told once; never started', async () => {
  const { p, c, denied } = setup({ background: false });
  await c.update({ known: true, online: true });
  await c.revalidate();
  assert.equal(p.calls.ask, 1);
  assert.equal(p.native.started, false);
  assert.deepEqual(denied, ['background']);
});

test('background allowed at the question: starts', async () => {
  const { p, c, denied } = setup({ background: false });
  p.grantOnAsk = true;
  await c.update({ known: true, online: true });
  assert.equal(p.native.started, true);
  assert.deepEqual(denied, []);
});

test('background can no longer be asked (only Settings): no prompt, told once', async () => {
  const { p, c, denied } = setup({ background: false, canAskBackground: false });
  await c.update({ known: true, online: true });
  assert.equal(p.calls.ask, 0);
  assert.deepEqual(denied, ['background']);
});

test('went offline while the background question was on screen: no start', async () => {
  const { p, c } = setup({ background: false });
  p.grantOnAsk = true;
  p.onAsk = async () => { void c.update({ known: true, online: false }); };
  await c.update({ known: true, online: true });
  await c.settled();
  assert.equal(p.native.started, false);
});

test('permission revoked in Settings while online: stopped on return to the app, told once', async () => {
  const { p, c, denied } = setup();
  await c.update({ known: true, online: true });
  p.perm.background = false;
  p.perm.canAskBackground = false;
  await c.revalidate();
  await c.revalidate();
  assert.equal(p.native.started, false);
  assert.deepEqual(denied, ['background']);
});

test('app backgrounded or screen locked while online: the task keeps running', async () => {
  const { p, c } = setup();
  await c.update({ known: true, online: true });
  p.active = false;
  await c.revalidate();
  assert.equal(p.native.started, true);
  assert.equal(p.calls.stop, 0);
});

test('killed and relaunched: a surviving task is left alone until the server answers', async () => {
  const { p, c } = setup({ startedAtLaunch: true });
  await c.update({ known: false, online: false }); // profile still loading
  assert.equal(p.native.started, true);
  assert.equal(p.calls.stop, 0);
});

test('relaunched and the server says offline: the surviving (Android) task is stopped', async () => {
  const { p, c } = setup({ startedAtLaunch: true });
  await c.update({ known: true, online: false });
  assert.equal(p.native.started, false);
});

test('relaunched and still online: the surviving task is restarted once with this launch\'s settings', async () => {
  const { p, c } = setup({ startedAtLaunch: true });
  await c.update({ known: true, online: true });
  await c.revalidate();
  assert.equal(p.calls.stop, 1);
  assert.equal(p.calls.start, 1);
  assert.equal(p.native.started, true);
});

test('relaunched in the background (Android task, no UI): no restart until the app is open', async () => {
  const { p, c } = setup({ startedAtLaunch: true, active: false });
  await c.update({ known: true, online: true });
  assert.equal(p.calls.start, 0);
  assert.equal(p.calls.stop, 0);
  p.active = true;
  await c.revalidate();
  assert.equal(p.calls.start, 1);
});

test('the background heartbeat finds the account offline: stopped even though the UI still thinks online', async () => {
  const { p, c } = setup();
  await c.update({ known: true, online: true });
  await c.serverOffline();
  assert.equal(p.native.started, false);
  await c.revalidate(); // a stale "online" re-render does not happen until the refreshed profile arrives
  assert.equal(p.native.started, false);
});

test('rapid online/offline taps: never overlapping native calls; ends in the last state', async () => {
  for (const last of [false, true]) {
    const { p, c } = setup();
    const steps = [];
    for (let i = 0; i < 9; i += 1) steps.push(c.update({ known: true, online: i % 2 === 0 }));
    steps.push(c.update({ known: true, online: last }));
    await Promise.all(steps);
    assert.equal(p.native.started, last);
    assert.equal(c.running, last);
  }
});

test('rapid taps with slow starts still end offline when the last tap is offline', async () => {
  const { p, c } = setup();
  p.holdStart = hold();
  const steps = [c.update({ known: true, online: true })];
  await new Promise((r) => setImmediate(r));
  for (let i = 0; i < 5; i += 1) steps.push(c.update({ known: true, online: i % 2 === 0 }));
  steps.push(c.update({ known: true, online: false }));
  p.holdStart.release();
  await Promise.all(steps);
  assert.equal(p.native.started, false);
});

test('network failure on the status change: the server state did not change, so neither does the task', async () => {
  const { p, c } = setup();
  await c.update({ known: true, online: true });
  // Going offline failed: the profile still says online (known), or the refetch errored (known stays from the last answer).
  await c.update({ known: true, online: true });
  assert.equal(p.native.started, true);
  assert.equal(p.calls.start, 1, 'no needless restart');
});

test('a failed native start leaves nothing running and is retried on the next revalidate', async () => {
  const { p, c } = setup();
  p.failStart = true;
  await c.update({ known: true, online: true });
  assert.equal(p.native.started, false);
  assert.equal(c.running, false);
  p.failStart = false;
  await c.revalidate();
  assert.equal(p.native.started, true);
});

test('trip pace: restarts with the trip pace in the app; waits while in the background', async () => {
  const { p, c } = setup();
  await c.update({ known: true, online: true });
  p.active = false;
  await c.setTrip(true);
  assert.equal(p.native.pace, false, 'no restart from the background');
  p.active = true;
  await c.revalidate();
  assert.equal(p.native.pace, true);
  await c.setTrip(false);
  assert.equal(p.native.pace, false);
});
