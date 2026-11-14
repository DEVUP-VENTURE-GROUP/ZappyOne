// One breaker per outside service (maps, push, SMS, AI): after `failures` failures in a row it stops calling for `coolMs`, then lets one call through to test it, so a dead service fails fast instead of holding every request open for its whole timeout.
const logger = require('../logger');

const states = new Map();
const state = (name) => {
  if (!states.has(name)) states.set(name, { fails: 0, openUntil: 0 });
  return states.get(name);
};

async function call(name, fn, { failures = 5, coolMs = 30000 } = {}) {
  const s = state(name);
  const now = Date.now();
  if (s.openUntil > now) {
    throw Object.assign(new Error(`${name} is not answering right now; trying again shortly`), { status: 503, code: 'SERVICE_RESTING', service: name });
  }
  try {
    const out = await fn();
    if (s.fails >= failures) logger.info({ service: name }, '[breaker] service answering again');
    s.fails = 0;
    s.openUntil = 0;
    return out;
  } catch (err) {
    // A request the service rejected (4xx) is ours to fix, not the service being down.
    if (!(err?.status >= 400 && err.status < 500)) {
      s.fails += 1;
      if (s.fails >= failures) {
        s.openUntil = now + coolMs;
        logger.warn({ service: name, fails: s.fails, coolMs }, '[breaker] resting a failing service');
      }
    }
    throw err;
  }
}

// fetch through the breaker, with a timeout: a network failure or a 5xx counts against the service; any other answer is returned as is.
function fetchVia(name, url, init = {}, { timeoutMs = 8000, ...opts } = {}) {
  return call(name, async () => {
    const res = await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(timeoutMs) });
    if (res.status >= 500) throw Object.assign(new Error(`${name} answered ${res.status}`), { status: 502, upstream: res.status });
    return res;
  }, opts);
}

const stateOf = (name) => ({ ...state(name) });
const reset = (name) => { states.delete(name); };

module.exports = { call, fetchVia, stateOf, reset };
