// Outside services fail fast once they keep failing, then get one test call after a rest.
const breaker = require('../src/core/resilience/breaker');

const boom = () => Promise.reject(Object.assign(new Error('down'), { status: 502 }));

afterEach(() => { breaker.reset('svc'); jest.useRealTimers(); });

test('five failures in a row rest the service; calls then fail at once without trying', async () => {
  for (let i = 0; i < 5; i += 1) await expect(breaker.call('svc', boom)).rejects.toThrow('down');
  const fn = jest.fn(() => Promise.resolve('ok'));
  await expect(breaker.call('svc', fn)).rejects.toMatchObject({ code: 'SERVICE_RESTING', status: 503 });
  expect(fn).not.toHaveBeenCalled();
});

test('after the rest one call is let through; success closes it, failure rests it again', async () => {
  jest.useFakeTimers();
  for (let i = 0; i < 5; i += 1) await expect(breaker.call('svc', boom, { coolMs: 1000 })).rejects.toThrow();
  jest.setSystemTime(Date.now() + 1500);
  await expect(breaker.call('svc', () => Promise.resolve('ok'), { coolMs: 1000 })).resolves.toBe('ok');
  expect(breaker.stateOf('svc')).toEqual({ fails: 0, openUntil: 0 });
  for (let i = 0; i < 5; i += 1) await expect(breaker.call('svc', boom, { coolMs: 1000 })).rejects.toThrow();
  jest.setSystemTime(Date.now() + 1500);
  await expect(breaker.call('svc', boom, { coolMs: 1000 })).rejects.toThrow('down');
  await expect(breaker.call('svc', () => Promise.resolve('ok'), { coolMs: 1000 })).rejects.toMatchObject({ code: 'SERVICE_RESTING' });
});

test('a request the service rejects (4xx) never counts as the service being down', async () => {
  const bad = () => Promise.reject(Object.assign(new Error('bad query'), { status: 400 }));
  for (let i = 0; i < 10; i += 1) await expect(breaker.call('svc', bad)).rejects.toThrow('bad query');
  await expect(breaker.call('svc', () => Promise.resolve('ok'))).resolves.toBe('ok');
});

test('one success in between resets the count', async () => {
  for (let i = 0; i < 4; i += 1) await expect(breaker.call('svc', boom)).rejects.toThrow();
  await breaker.call('svc', () => Promise.resolve('ok'));
  for (let i = 0; i < 4; i += 1) await expect(breaker.call('svc', boom)).rejects.toThrow();
  await expect(breaker.call('svc', () => Promise.resolve('ok'))).resolves.toBe('ok');
});
