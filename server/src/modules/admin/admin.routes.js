const express = require('express');
const { authenticate, requireRole } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.use('/', require('./routes/metrics.routes'));
router.use('/', require('./routes/orders.routes'));
router.use('/', require('./routes/workers.routes'));
router.use('/', require('./routes/shops.routes'));
router.use('/', require('../repair/repair-admin.routes'));
router.use('/', require('../onboarding/onboarding-admin.routes'));
router.use('/', require('./routes/users.routes'));
router.use('/', require('./routes/pricing.routes'));
router.use('/', require('./routes/financial.routes'));
router.use('/', require('./routes/incentives.routes'));
router.use('/', require('./routes/plans.routes'));
router.use('/', require('./routes/geo.routes'));
router.use('/', require('./routes/system.routes'));
router.use('/', require('./routes/support.routes'));
router.use('/', require('./routes/business.routes'));
router.use('/', require('./routes/intelligence.routes'));
router.use('/', require('./routes/audit.routes'));
router.use('/', require('./routes/shield.routes'));
router.use('/', require('../fraud/fraud.routes'));
router.use('/', require('../zone/zone.routes'));
router.use('/', require('./routes/cities.routes'));
router.use('/', require('./routes/content.routes'));
router.use('/', require('./routes/rewards-config.routes'));
router.use('/', require('./routes/worker-ops.routes'));
router.use('/', require('./routes/search-analytics.routes'));
router.use('/worker/appeals',  require('../worker/appeal.routes').adminRouter);
router.use('/worker/training', require('../worker/training.routes').adminRouter);

module.exports = router;
