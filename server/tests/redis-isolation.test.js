// A file that never loads tests/helpers still gets the in-process Redis, never the shared one named in .env.
test('every test file gets the in-process Redis', () => {
  const { redis } = require('../src/config/redis');
  const Mock = require('ioredis-mock');
  expect(redis).toBeInstanceOf(Mock);
});
