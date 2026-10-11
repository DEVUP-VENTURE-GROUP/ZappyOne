const express = require('express');
const svc = require('./app-release.service');

/** Public: the oldest and newest version of a phone app, checked on launch. */
const router = express.Router();

router.get('/:app', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=60');
    const { minVersion, latestVersion, message } = await svc.forApp(req.params.app);
    res.json({ minVersion, latestVersion, message });
  } catch (err) { next(err); }
});

module.exports = router;
