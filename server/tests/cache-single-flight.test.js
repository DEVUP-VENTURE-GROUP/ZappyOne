// Many requests missing the cache at once share one computation; a later one is served from the cache.
const cached = require('../src/modules/admin/lib/cached-analytics');

test('fifty simultaneous misses compute once, then the cache answers', async () => {
  let runs = 0;
  const compute = async () => { runs += 1; await new Promise((r) => setTimeout(r, 50)); return { items: [1, 2, 3] }; };
  const key = `test:sf:${Date.now()}`;
  const answers = await Promise.all(Array.from({ length: 50 }, () => cached(key, 30, compute)));
  expect(runs).toBe(1);
  expect(answers.every((a) => a.items.length === 3)).toBe(true);
  await cached(key, 30, compute);
  expect(runs).toBeLessThanOrEqual(2);
});

test('a failed computation is not kept: the next request tries again', async () => {
  const key = `test:fail:${Date.now()}`;
  await expect(cached(key, 30, async () => { throw new Error('db down'); })).rejects.toThrow('db down');
  expect(await cached(key, 30, async () => ({ ok: true }))).toEqual({ ok: true });
});
