const express = require('express');
const ctrl = require('./onboarding-admin.controller');

/**
 * Admin onboarding routes.
 *
 * Mounted under the admin router, which already applies `authenticate` +
 * `requireRole('admin')` for the whole tree, so nothing here re-declares it.
 */

const router = express.Router();

function mountCrud(path, handlers) {
  router.get(`/onboarding/${path}`, handlers.list);
  router.post(`/onboarding/${path}`, handlers.create);
  router.patch(`/onboarding/${path}/:id`, handlers.update);
  router.delete(`/onboarding/${path}/:id`, handlers.archive);
}

mountCrud('domains', ctrl.domains);
mountCrud('lines', ctrl.lines);
mountCrud('requirements', ctrl.requirements);

/* Verification queue */
router.get('/onboarding/enrolments', ctrl.enrolments.list);
router.post('/onboarding/enrolments/:id/decide', ctrl.enrolments.decide);

/* Provider-proposed services */
router.get('/onboarding/line-requests', ctrl.lineRequests.list);
router.post('/onboarding/line-requests/:id/approve', ctrl.lineRequests.approve);
router.post('/onboarding/line-requests/:id/reject', ctrl.lineRequests.reject);

module.exports = router;
