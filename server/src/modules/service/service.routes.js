const express = require('express');
const ctrl = require('./service.controller');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { verifyToken } = require('../auth/auth.service');

const router = express.Router();

const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try { req.auth = verifyToken(token); } catch {}
  }
  next();
};

// Public Catalog & Dynamic Engine APIs
router.get('/services', ctrl.listServices);
router.get('/services/brands', ctrl.listBrands);
router.get('/services/models', ctrl.listModels);
router.get('/services/variants', ctrl.listVariants);
router.get('/services/diagnostics/:code', ctrl.getDiagnosticFlow);
router.get('/services/:code', ctrl.getService);

// Demand Analytics
router.post('/services/demand-event', optionalAuth, ctrl.recordDemandEvent);

// Invoices & Heatmaps
router.get('/invoices/:orderId', authenticate, ctrl.getInvoice);
router.get('/heatmap/worker', authenticate, requireRole('worker'), ctrl.getWorkerHeatmap);

// Admin Catalog Management
router.get('/admin/services', authenticate, requireRole('admin'), ctrl.adminListServices);
router.post('/admin/services', authenticate, requireRole('admin'), ctrl.adminCreateService);
router.put('/admin/services/:code', authenticate, requireRole('admin'), ctrl.adminUpdateService);
router.delete('/admin/services/:code', authenticate, requireRole('admin'), ctrl.adminDeleteService);
router.get('/admin/services/:code/active-orders', authenticate, requireRole('admin'), ctrl.adminServiceActiveOrderCount);

// Admin Brands, Models & Bulk Import APIs
router.get('/admin/brands', authenticate, requireRole('admin'), ctrl.adminListBrands);
router.post('/admin/brands', authenticate, requireRole('admin'), ctrl.adminCreateBrand);
router.get('/admin/models', authenticate, requireRole('admin'), ctrl.adminListModels);
router.post('/admin/models', authenticate, requireRole('admin'), ctrl.adminCreateModel);
router.post('/admin/models/import', authenticate, requireRole('admin'), ctrl.adminImportModelsBulk);
router.get('/admin/variants', authenticate, requireRole('admin'), ctrl.adminListVariants);
router.post('/admin/variants', authenticate, requireRole('admin'), ctrl.adminCreateVariant);
router.get('/admin/demand-events', authenticate, requireRole('admin'), ctrl.adminGetDemandEvents);

module.exports = router;
