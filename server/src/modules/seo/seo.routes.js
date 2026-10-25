// Programmatic SEO pages, mounted at the root (not /api) and served on www.zappyone.com/in/* through the client's Vercel rewrite.
const express = require('express');
const { CITIES, CATEGORIES, CATEGORY_MAP, STATE_LIST, slugify } = require('./seo-data');
const { indexPage, statePage, cityPage, categoryPage, areaPage, BASE } = require('./template');
const { generateSitemap } = require('./sitemap');
const City = require('./city.model');

const router = express.Router();
const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400';

// The built-in list, overlaid by admin's City rows: a row can add a city, switch it live, hide it or add areas.
async function catalog() {
  let rows = [];
  try { rows = await City.find({}).lean(); } catch { /* the built-in list stands alone */ }
  const bySlug = new Map(CITIES.map((c) => [c.slug, { ...c }]));
  for (const r of rows) {
    const base = bySlug.get(r.slug) || { slug: r.slug, areas: [] };
    const state = r.state || base.state;
    bySlug.set(r.slug, {
      ...base, name: r.name || base.name, state, stateSlug: slugify(state || ''), lat: r.lat ?? base.lat, lng: r.lng ?? base.lng,
      live: Boolean(r.live) || Boolean(base.live), hidden: r.isActive === false,
      areas: r.areas?.length ? r.areas : base.areas,
    });
  }
  const cities = [...bySlug.values()].filter((c) => !c.hidden && c.state);
  const states = [...STATE_LIST];
  for (const c of cities) if (!states.some((s) => s.slug === c.stateSlug)) states.push({ name: c.state, slug: c.stateSlug });
  return { cities, states, cityMap: new Map(cities.map((c) => [c.slug, c])) };
}

const html = (res, body) => res.set('Cache-Control', CACHE).type('text/html').send(body);

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /in\nDisallow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
});

router.get('/sitemap.xml', async (req, res) => {
  try {
    const { cities, states } = await catalog();
    const { redis } = require('../../config/redis');
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(await generateSitemap(redis, { cities, states, categories: CATEGORIES }));
  } catch {
    res.status(500).send('Sitemap generation failed');
  }
});

router.get('/in', async (req, res, next) => {
  try { const { cities, states } = await catalog(); html(res, indexPage(cities, states)); } catch (err) { next(err); }
});

router.get('/in/state/:state', async (req, res, next) => {
  try {
    const { cities, states } = await catalog();
    const state = states.find((s) => s.slug === req.params.state);
    if (!state) return res.redirect(301, `${BASE}/in`);
    html(res, statePage(state, cities));
  } catch (err) { next(err); }
});

router.get('/in/:city', async (req, res, next) => {
  try {
    const { cities, cityMap } = await catalog();
    const city = cityMap.get(req.params.city);
    if (!city) return res.redirect(301, `${BASE}/in`);
    html(res, cityPage(city, CATEGORIES, cities));
  } catch (err) { next(err); }
});

// Service pages exist only where ZappyOne is live; elsewhere they would be thin copies, so they lead to the city page.
router.get('/in/:city/:slug', async (req, res, next) => {
  try {
    const { cityMap } = await catalog();
    const city = cityMap.get(req.params.city);
    if (!city) return res.redirect(301, `${BASE}/in`);
    const category = CATEGORY_MAP[req.params.slug];
    if (city.live && category) return html(res, categoryPage(city, category, CATEGORIES));
    const area = city.live && city.areas.find((a) => a.slug === req.params.slug);
    if (area) return res.redirect(301, `${BASE}/in/${city.slug}/${area.slug}/${CATEGORIES[0].slug}`);
    res.redirect(301, `${BASE}/in/${city.slug}`);
  } catch (err) { next(err); }
});

router.get('/in/:city/:area/:category', async (req, res, next) => {
  try {
    const { cityMap } = await catalog();
    const city = cityMap.get(req.params.city);
    if (!city) return res.redirect(301, `${BASE}/in`);
    const area = city.live && city.areas.find((a) => a.slug === req.params.area);
    const category = CATEGORY_MAP[req.params.category];
    if (!area || !category) return res.redirect(301, `${BASE}/in/${city.slug}`);
    html(res, areaPage(city, area, category, CATEGORIES));
  } catch (err) { next(err); }
});

module.exports = router;
