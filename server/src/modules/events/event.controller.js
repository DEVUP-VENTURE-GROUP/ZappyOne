const svc = require('./event.service');

async function getCategories(req, res, next) {
  try { res.json({ categories: await svc.listCategories() }); } catch (e) { next(e); }
}

async function getThemes(req, res, next) {
  try {
    const { category, city, budgetMax, guestCount, page, sort, search } = req.query;
    const result = await svc.listThemes({
      categorySlug: category, city,
      budgetMaxPaise: budgetMax ? Number(budgetMax) * 100 : undefined,
      guestCount: guestCount ? Number(guestCount) : undefined,
      page: Number(page) || 1, sort, search,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function getThemeAvailability(req, res, next) {
  try { res.json(await svc.getThemeAvailability(req.params.id, req.query.days)); } catch (e) { next(e); }
}

async function getTheme(req, res, next) {
  try { res.json({ theme: await svc.getTheme(req.params.id, req.auth?.sub) }); } catch (e) { next(e); }
}

async function toggleSave(req, res, next) {
  try { res.json(await svc.toggleSave(req.auth.sub, req.params.id)); } catch (e) { next(e); }
}

async function getSaved(req, res, next) {
  try { res.json({ themes: await svc.getSavedThemes(req.auth.sub) }); } catch (e) { next(e); }
}

async function createBooking(req, res, next) {
  try {
    const result = await svc.createBooking({ userId: req.auth.sub, ...req.body });
    res.status(201).json(result);
  } catch (e) { next(e); }
}

async function getBookings(req, res, next) {
  try { res.json(await svc.getUserBookings(req.auth.sub, Number(req.query.page) || 1)); } catch (e) { next(e); }
}

async function getBooking(req, res, next) {
  try { res.json({ booking: await svc.getBooking(req.params.id, req.auth.sub) }); } catch (e) { next(e); }
}

async function cancelBooking(req, res, next) {
  try { res.json(await svc.cancelBooking(req.params.id, req.auth.sub, req.body.reason)); } catch (e) { next(e); }
}

async function submitReview(req, res, next) {
  try { res.json(await svc.submitReview(req.params.id, req.auth.sub, req.body)); } catch (e) { next(e); }
}

async function getConfig(req, res, next) {
  try {
    const [cfg, live] = await Promise.all([svc.getActiveConfig(), require('../feature-flags/feature-flag.service').isEnabled('events')]);
    res.json({ ...(cfg?.toObject ? cfg.toObject() : cfg), live });
  } catch (e) { next(e); }
}

module.exports = { getCategories, getThemes, getTheme, getThemeAvailability, toggleSave, getSaved, createBooking, getBookings, getBooking, cancelBooking, submitReview, getConfig };
