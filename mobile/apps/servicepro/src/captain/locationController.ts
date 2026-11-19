// When background location may run, as one race-safe queue (offline always wins, nothing runs while online state is unknown); native calls come in as LocationPlatform so tests use fakes.

export type DenialReason = 'foreground' | 'background';

export interface LocationPermissions {
  foreground: boolean;
  background: boolean;
  /** False once the system will no longer show the background prompt (only Settings can change it). */
  canAskBackground: boolean;
}

export interface LocationPlatform {
  hasStarted(): Promise<boolean>;
  start(onTrip: boolean): Promise<void>;
  stop(): Promise<void>;
  permissions(): Promise<LocationPermissions>;
  /** The explanation, then the system's background question. Resolves when both are answered. */
  askBackground(): Promise<void>;
  /** Whether a task may be started now (the app is in the foreground). */
  canStartNow(): boolean;
}

export interface LocationEvents {
  /** Online but a permission is missing, so nothing runs in the background. Called once per denial. */
  onDenied?: (reason: DenialReason) => void;
  /** Whether the background task is running after the latest step. */
  onRunning?: (running: boolean) => void;
}

export interface LocationState {
  /** The server's online state has been read (false while the profile is loading). */
  known: boolean;
  /** Online (worker) or Live (shop) on the server, and signed in. */
  online: boolean;
}

export function createLocationController(platform: LocationPlatform, events: LocationEvents = {}) {
  let known = false;
  let online = false;
  let trip = false;
  // The pace the running task was started with this launch; null when this launch has not started it.
  let pace: boolean | null = null;
  let askedThisRun = false;
  let denied: DenialReason | null = null;
  let running = false;
  let queue: Promise<void> = Promise.resolve();

  const wanted = () => known && online;

  function report(next: boolean) {
    if (next === running) return;
    running = next;
    events.onRunning?.(next);
  }

  function deny(reason: DenialReason) {
    if (denied === reason) return;
    denied = reason;
    events.onDenied?.(reason);
  }

  async function ensureStopped() {
    try {
      if (await platform.hasStarted()) await platform.stop();
    } catch { /* already stopped */ }
    pace = null;
    report(false);
  }

  /** Whether both permissions are granted; asks for background once per run. Stops the task and reports when not. */
  async function permitted(): Promise<boolean> {
    let perm = await platform.permissions();
    if (perm.foreground && !perm.background && perm.canAskBackground && !askedThisRun && platform.canStartNow()) {
      askedThisRun = true;
      await platform.askBackground();
      perm = await platform.permissions();
    }
    // Went offline while the question was on screen: the caller stops.
    if (!wanted()) return false;
    const missing: DenialReason | null = !perm.foreground ? 'foreground' : !perm.background ? 'background' : null;
    if (!missing) {
      denied = null;
      return true;
    }
    await ensureStopped();
    deny(missing);
    return false;
  }

  async function step() {
    if (!known) return;
    if (!online) {
      denied = null;
      await ensureStopped();
      return;
    }
    if (!(await permitted())) {
      if (!wanted()) await ensureStopped();
      return;
    }

    const started = await platform.hasStarted();
    if (started && pace === trip) return report(true);
    // Not started, or started by an earlier launch or at another pace: (re)start, only in the foreground.
    if (!platform.canStartNow()) {
      if (started) report(true);
      return;
    }
    if (started) await platform.stop();
    if (!wanted()) return ensureStopped();
    const startedWith = trip;
    await platform.start(startedWith);
    pace = startedWith;
    // Offline won while the start was in flight.
    if (!wanted()) return ensureStopped();
    report(true);
  }

  function run(): Promise<void> {
    queue = queue.then(step).catch(() => {
      // A failed native call leaves the task as it was; the next change or revalidate tries again.
    });
    return queue;
  }

  return {
    /** The server's view (from the worker or shop profile, or sign-out). */
    update(next: LocationState): Promise<void> {
      known = next.known;
      online = next.known && next.online;
      return run();
    },
    /** On a trip the customer is watching: a faster, more precise pace. */
    setTrip(onTrip: boolean): Promise<void> {
      trip = onTrip;
      return run();
    },
    /** The server answered that this account is offline (the background heartbeat): stop now. */
    serverOffline(): Promise<void> {
      known = true;
      online = false;
      return run();
    },
    /** Re-check permissions and the native task, e.g. when the app comes back to the foreground. */
    revalidate(): Promise<void> {
      // The explanation stays once per app run; a still-missing permission is reported once per denial (onDenied).
      return run();
    },
    /** Resolves when every queued step has finished (tests). */
    settled(): Promise<void> {
      return queue;
    },
    get running() {
      return running;
    },
  };
}

export type LocationController = ReturnType<typeof createLocationController>;
