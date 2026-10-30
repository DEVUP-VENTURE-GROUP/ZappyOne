// Every test file gets an in-process Redis, so no test ever reaches the shared Redis named in .env.
jest.mock('../src/config/redis', () => {
  // `jest.mock` is hoisted above every import, so its factory must NOT close
  // over out-of-scope variables (the top-level `IORedisMock` const). Require it
  // inside the factory instead — otherwise Jest throws and no test can run.
  const Redis = require('ioredis-mock');
  const base = new Redis();
  // rate-limit-redis (and a few call sites) use the raw `redis.call('GET', ...)`
  // form, which ioredis-mock doesn't expose. Shim it onto the command methods so
  // the full app can construct under the mock.
  const withCall = (client) => {
    client.call = (cmd, ...args) => {
      const name = String(cmd).toLowerCase();
      // ioredis-mock has no Lua support; rate-limit-redis loads a script at
      // construction. Hand back a dummy sha so the store can build, and let the
      // limiter fail-open at request time (it already skips when Redis isn't
      // 'ready' / on store errors). Other unsupported commands degrade to null
      // rather than throwing, so building the full app never blows up in tests.
      if (name === 'script') return Promise.resolve('mock-sha');
      const fn = client[name];
      if (typeof fn !== 'function') return Promise.resolve(null);
      try { return Promise.resolve(fn.call(client, ...args)); }
      catch { return Promise.resolve(null); }
    };
    return client;
  };
  withCall(base);
  return {
    redis: base,
    createBullConnection: () => new Redis(),
    createPubSubPair: () => ({ pubClient: new Redis(), subClient: new Redis() }),
    // No namespace under test: same names as production.
    scoped: (client) => client, bullPrefix: 'bull', socketKey: 'socket.io',
  };
});
