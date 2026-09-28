const express = require('express');
const ctrl = require('./repair-admin.controller');

/**
 * Admin repair routes.
 *
 * Mounted under the admin router, which already applies `authenticate` +
 * `requireRole('admin')` for the whole tree — so no route here re-declares it.
 *
 * Catalog resources all follow the same shape (list / create / update /
 * archive) and are registered through one helper, because five hand-written
 * copies of the same four routes is exactly where drift starts.
 */

const router = express.Router();

/** Register the standard CRUD quartet for a catalog resource. */
function mountCrud(path, handlers) {
  router.get(`/repair/${path}`, handlers.list);
  router.post(`/repair/${path}`, handlers.create);
  router.patch(`/repair/${path}/:id`, handlers.update);
  router.delete(`/repair/${path}/:id`, handlers.archive);
}

mountCrud('brands', ctrl.brands);
mountCrud('models', ctrl.models);
mountCrud('problem-categories', ctrl.problemCategories);
mountCrud('problems', ctrl.problems);
mountCrud('repairs', ctrl.repairs);
mountCrud('parts', ctrl.parts);
mountCrud('part-qualities', ctrl.partQualities);
mountCrud('suppliers', ctrl.suppliers);
mountCrud('skill-levels', ctrl.skillLevels);
mountCrud('qa-checklists', ctrl.qaChecklists);
// Deep catalog — the layers laptops need between brand and model.
mountCrud('product-types', ctrl.productTypes);
mountCrud('product-families', ctrl.productFamilies);
mountCrud('product-series', ctrl.productSeries);
mountCrud('configurations', ctrl.configurations);

/* Pricing */
// Literal paths before `/:id` so "history"/"pending" are not read as ids.
router.get('/repair/reference-pricing/history', ctrl.referencePricing.history);
router.get('/repair/reference-pricing', ctrl.referencePricing.list);
router.post('/repair/reference-pricing', ctrl.referencePricing.create);
router.patch('/repair/reference-pricing/:id', ctrl.referencePricing.update);

router.get('/repair/provider-pricing/pending', ctrl.providerPricing.pending);
router.get('/repair/provider-pricing', ctrl.providerPricing.list);
router.post('/repair/provider-pricing/:id/decide', ctrl.providerPricing.decide);

/* Configuration */
router.get('/repair/config', ctrl.config.get);
router.put('/repair/config', ctrl.config.update);

/* Approvals + customer requests */
router.get('/repair/approvals', ctrl.approvals.list);
router.post('/repair/approvals/:id/decide', ctrl.approvals.decide);

router.get('/repair/catalog-requests', ctrl.catalogRequests.list);
router.post('/repair/catalog-requests/:id/approve', ctrl.catalogRequests.approve);
router.post('/repair/catalog-requests/:id/reject', ctrl.catalogRequests.reject);
router.get('/repair/provider-requests', ctrl.providerRequests.list);
router.post('/repair/provider-requests/:id/approve', ctrl.providerRequests.approve);
router.post('/repair/provider-requests/:id/reject', ctrl.providerRequests.reject);

router.get('/repair/identification-requests', ctrl.identificationRequests.list);
router.post('/repair/identification-requests/:id/resolve', ctrl.identificationRequests.resolve);

/* Operations */
router.get('/repair/dashboard', ctrl.operations.dashboard);
router.get('/repair/bookings', ctrl.operations.bookings);
router.get('/repair/quotes', ctrl.operations.quotes);
router.get('/repair/warranty-claims', ctrl.operations.warrantyClaims);
router.get('/repair/capabilities', ctrl.operations.capabilities);

module.exports = router;
