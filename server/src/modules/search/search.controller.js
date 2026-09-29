const searchService = require('./search.service');
const { startAutoRefresh } = require('./search.corpus');

// Keep the corpus warm from boot (safe if Mongo not ready yet — retries every 60s).
startAutoRefresh();

function coord(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }

async function search(req, res, next) {
  try {
    const out = await searchService.search({
      q:      (req.query.q || '').slice(0, 100),
      lat:    coord(req.query.lat),
      lng:    coord(req.query.lng),
      userId: req.auth?.sub || null,
      limit:  Math.min(parseInt(req.query.limit, 10) || 8, 20),
    });
    res.set('Cache-Control', 'private, max-age=15');
    res.json(out);
  } catch (err) { next(err); }
}

async function suggest(req, res, next) {
  try {
    const out = await searchService.suggest({
      q: (req.query.q || '').slice(0, 100), lat: coord(req.query.lat), lng: coord(req.query.lng), limit: 6,
    });
    // Results depend on what's live at the caller's location.
    res.set('Cache-Control', 'private, max-age=30');
    res.json({ suggestions: out });
  } catch (err) { next(err); }
}

async function trending(req, res, next) {
  try {
    res.set('Cache-Control', 'private, max-age=60');
    res.json({ trending: await searchService.trending({ lat: coord(req.query.lat), lng: coord(req.query.lng) }) });
  } catch (err) { next(err); }
}

module.exports = { search, suggest, trending };
