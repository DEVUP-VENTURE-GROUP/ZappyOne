const express = require('express');
const ctrl = require('./content.controller');

// Public, read-only help content. No auth — FAQ/policies are public.
const router = express.Router();

router.get('/faqs', ctrl.getFaqs);            // ?audience=user|worker
router.get('/policies', ctrl.listPolicies);   // list slugs+titles
router.get('/policy/:slug', ctrl.getPolicy);  // single policy page
// The festive season on the customer home now, or { season: null } (content/season.service).
router.get('/season', async (req, res, next) => {
  try { res.set('Cache-Control', 'public, max-age=60'); res.json({ season: await require('./season.service').current() }); } catch (err) { next(err); }
});

module.exports = router;
