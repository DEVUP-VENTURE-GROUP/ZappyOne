// Sitemap for the /in pages on www.zappyone.com: every state and city; service and area pages only where ZappyOne is live. Cached in Redis for an hour.
const { BASE } = require('./template');

const KEY = 'seo:sitemap:v2';
const TTL = 3600;

const entry = (path, freq, pri, day) => `  <url><loc>${BASE}${path}</loc><lastmod>${day}</lastmod><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;

async function generateSitemap(redis, { cities, states, categories }) {
  if (redis) {
    const hit = await redis.get(KEY).catch(() => null);
    if (hit) return hit;
  }
  const day = new Date().toISOString().slice(0, 10);
  const urls = [entry('/in', 'weekly', '0.8', day), ...states.map((s) => entry(`/in/state/${s.slug}`, 'weekly', '0.6', day))];
  for (const c of cities) {
    urls.push(entry(`/in/${c.slug}`, 'weekly', c.live ? '0.9' : '0.5', day));
    if (!c.live) continue;
    for (const cat of categories) {
      urls.push(entry(`/in/${c.slug}/${cat.slug}`, 'weekly', '0.8', day));
      for (const a of c.areas) urls.push(entry(`/in/${c.slug}/${a.slug}/${cat.slug}`, 'monthly', '0.6', day));
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  if (redis) redis.setex(KEY, TTL, xml).catch(() => {});
  return xml;
}

module.exports = { generateSitemap };
