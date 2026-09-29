const express = require('express');
const featureFlags = require('./feature-flag.service');

/** Public: which features are on, so apps hide what the server would refuse anyway. */
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const flags = await featureFlags.list();
    res.set('Cache-Control', 'public, max-age=15');
    res.json({ features: Object.fromEntries(flags.map((f) => [f.key, f.enabled])) });
  } catch (err) { next(err); }
});

module.exports = router;
