/**
 * Dynamic sitemap generator.
 * Generates sitemap.xml covering static pages, city pages,
 * category+city pages, area+category+city pages, and DB-driven event themes.
 *
 * Cached in Redis for 1 hour to avoid regenerating on every crawler hit.
 */
const { CITIES, CATEGORIES } = require('./seo-data');
const { BASE_URL } = require('./schema');

const SITEMAP_CACHE_KEY = 'seo:sitemap';
const SITEMAP_TTL = 3600; // 1 hour

function urlEntry(loc, changefreq = 'weekly', priority = '0.7', lastmod = null) {
  const lm = lastmod || new Date().toISOString().split('T')[0];
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lm}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

async function generateSitemap(redis) {
  // Check cache first
  if (redis) {
    const cached = await redis.get(SITEMAP_CACHE_KEY).catch(() => null);
    if (cached) return cached;
  }

  const today = new Date().toISOString().split('T')[0];
  const urls = [];

  // Static / brand pages
  urls.push(urlEntry(`${BASE_URL}/`,          'daily',  '1.0', today));
  urls.push(urlEntry(`${BASE_URL}/services`,  'weekly', '0.8', today));
  urls.push(urlEntry(`${BASE_URL}/events`,    'weekly', '0.8', today));
  urls.push(urlEntry(`${BASE_URL}/about`,     'monthly','0.5', today));

  // City pages (/in/:city)
  for (const city of CITIES) {
    urls.push(urlEntry(`${BASE_URL}/in/${city.slug}`, 'weekly', '0.9', today));

    // Category + City pages (/in/:city/:category)
    for (const cat of CATEGORIES) {
      urls.push(urlEntry(`${BASE_URL}/in/${city.slug}/${cat.slug}`, 'weekly', '0.85', today));

      // Area + Category + City pages (/in/:city/:area/:category)
      for (const area of city.areas) {
        urls.push(urlEntry(`${BASE_URL}/in/${city.slug}/${area.slug}/${cat.slug}`, 'monthly', '0.75', today));
      }
    }
  }

  // Dynamic: event themes from MongoDB
  try {
    const EventTheme = require('../../modules/events/event-theme.model');
    const themes = await EventTheme.find({ status: { $in: ['approved', 'featured'] } })
      .select('_id updatedAt').lean();
    for (const t of themes) {
      const lm = (t.updatedAt || new Date()).toISOString().split('T')[0];
      urls.push(urlEntry(`${BASE_URL}/events/theme/${t._id}`, 'weekly', '0.7', lm));
    }
  } catch { /* non-fatal — event themes are bonus */ }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>`;

  if (redis) {
    redis.setex(SITEMAP_CACHE_KEY, SITEMAP_TTL, xml).catch(() => {});
  }
  return xml;
}

module.exports = { generateSitemap };
