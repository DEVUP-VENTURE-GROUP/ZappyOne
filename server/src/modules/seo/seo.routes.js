/**
 * SEO Routes — served at root level (not under /api).
 *
 * GET /sitemap.xml          — dynamic sitemap
 * GET /robots.txt           — robots directives
 * GET /in/:city             — city landing page
 * GET /in/:city/:category   — category + city page
 * GET /in/:city/:area/:cat  — area + category + city page
 *
 * City data: reads from MongoDB (admin-editable). Falls back to the static
 * seo-data.js if the DB collection is empty (first deploy / no cities seeded).
 */
const express = require('express');
const { CITY_MAP: STATIC_CITY_MAP, CATEGORY_MAP, CITIES: STATIC_CITIES, CATEGORIES } = require('./seo-data');
const { cityPage, categoryPage, areaPage } = require('./template');
const { generateSitemap } = require('./sitemap');
const City = require('./city.model');

const router = express.Router();

// Build runtime city map from DB rows (or fall back to static).
async function getCityMap() {
  try {
    const dbCities = await City.find({ isActive: true }).lean();
    if (dbCities.length === 0) return { cityMap: STATIC_CITY_MAP, cities: STATIC_CITIES };
    const cityMap = Object.fromEntries(dbCities.map(c => [c.slug, c]));
    return { cityMap, cities: dbCities };
  } catch {
    return { cityMap: STATIC_CITY_MAP, cities: STATIC_CITIES };
  }
}

// robots.txt
router.get('/robots.txt', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  const base = process.env.PUBLIC_URL || host;
  res.type('text/plain').send(
    `User-agent: *\n` +
    `Allow: /\n` +
    `Disallow: /api/\n` +
    `Disallow: /${process.env.ADMIN_LOGIN_SLUG}/\n` +
    `Disallow: /worker/\n\n` +
    `Sitemap: ${base}/sitemap.xml\n`
  );
});

// sitemap.xml
router.get('/sitemap.xml', async (req, res) => {
  try {
    const { redis } = require('../../config/redis');
    const xml = await generateSitemap(redis);
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(xml);
  } catch (err) {
    res.status(500).send('Sitemap generation failed');
  }
});

// City page (/in/:city)
router.get('/in/:city', async (req, res) => {
  const { cityMap, cities } = await getCityMap();
  const city = cityMap[req.params.city];
  if (!city) return res.status(404).send('City not found');
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600')
     .type('text/html')
     .send(cityPage(city, CATEGORIES, cities));
});

// Category + City page (/in/:city/:slug)
router.get('/in/:city/:slug', async (req, res) => {
  const { cityMap, cities } = await getCityMap();
  const city = cityMap[req.params.city];
  if (!city) return res.status(404).send('City not found');

  const category = CATEGORY_MAP[req.params.slug];
  if (category) {
    return res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600')
              .type('text/html')
              .send(categoryPage(city, category, CATEGORIES, cities));
  }

  const area = city.areas.find(a => a.slug === req.params.slug);
  if (area) {
    return res.redirect(301, `/in/${city.slug}/${area.slug}/mobile-repair`);
  }

  res.status(404).send('Page not found');
});

// Area + Category + City (/in/:city/:area/:category)
router.get('/in/:city/:area/:category', async (req, res) => {
  const { cityMap } = await getCityMap();
  const city = cityMap[req.params.city];
  if (!city) return res.status(404).send('City not found');

  const area = city.areas.find(a => a.slug === req.params.area);
  if (!area) return res.status(404).send('Area not found');

  const category = CATEGORY_MAP[req.params.category];
  if (!category) return res.status(404).send('Category not found');

  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600')
     .type('text/html')
     .send(areaPage(city, area, category, CATEGORIES, [city]));
});

module.exports = router;
