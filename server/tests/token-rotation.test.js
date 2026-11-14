require('./env');
const { startMongo, stopMongo } = require('./helpers');
const { redis } = require('../src/config/redis');
const tokenService = require('../src/modules/auth/token.service');

beforeAll(async () => { await startMongo(); });
afterAll(async () => { await stopMongo(); });
beforeEach(async () => { await redis.flushall(); });

describe('refresh-token rotation + reuse detection', () => {
  const payload = { sub: 'user123', role: 'user', phone: '9999999999' };

  test('fresh login issues an access+refresh pair', async () => {
    const { accessToken, refreshToken } = await tokenService.issueTokenPair(payload);
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
    // Verify the family is stored
    const keys = await redis.keys('rt:user123:*');
    expect(keys).toHaveLength(1);
  });

  const later = (ms) => { const now = Date.now(); jest.spyOn(Date, 'now').mockReturnValue(now + ms); };
  afterEach(() => jest.restoreAllMocks());

  test('a reply lost on a weak network: the old token works again within 2 minutes', async () => {
    const first = await tokenService.issueTokenPair(payload);
    const second = await tokenService.rotateTokenPair(first.refreshToken);
    later(90 * 1000);
    const again = await tokenService.rotateTokenPair(first.refreshToken);
    expect(again.accessToken).toBeTruthy();
    expect(second.refreshToken).not.toBe(first.refreshToken);
  });

  test('an old token replayed after 2 minutes is reuse: the whole family is revoked', async () => {
    const first = await tokenService.issueTokenPair(payload);
    const second = await tokenService.rotateTokenPair(first.refreshToken);
    later(3 * 60 * 1000);
    await expect(tokenService.rotateTokenPair(first.refreshToken)).rejects.toMatchObject({ code: 'RT_REUSE' });
    await expect(tokenService.rotateTokenPair(second.refreshToken)).rejects.toMatchObject({ code: 'RT_REVOKED' });
  });

  test('signed out after 7 days unused; every use renews the 7 days', async () => {
    const first = await tokenService.issueTokenPair(payload);
    const [key] = await redis.keys('rt:user123:*');
    expect(await redis.ttl(key)).toBeLessThanOrEqual(7 * 24 * 3600);
    expect(await redis.ttl(key)).toBeGreaterThan(7 * 24 * 3600 - 60);
    await redis.expire(key, 3600);
    await tokenService.rotateTokenPair(first.refreshToken);
    expect(await redis.ttl(key)).toBeGreaterThan(7 * 24 * 3600 - 60);
  });

  test('revokeRefreshToken hard-kills the family', async () => {
    const { refreshToken } = await tokenService.issueTokenPair(payload);
    await tokenService.revokeRefreshToken(refreshToken);
    await expect(tokenService.rotateTokenPair(refreshToken)).rejects.toMatchObject({
      code: 'RT_REVOKED',
    });
  });
});
