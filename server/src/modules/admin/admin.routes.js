const express = require('express');
const { authenticate, requireRole } = require('../../middlewares/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.use('/', require('./routes/team.routes'));
router.use('/', require('./routes/metrics.routes'));
router.use('/', require('./routes/orders.routes'));
router.use('/', require('../admin-portal/admin-portal.routes'));
// Admin → Messages: automatic emails and pushes (messaging/).
router.use('/', require('../messaging/admin.routes'));
router.use('/', require('./routes/workers.routes'));
router.use('/', require('./routes/shops.routes'));
router.use('/', require('../repair/repair-admin.routes'));
router.use('/', require('../onboarding/onboarding-admin.routes'));
router.use('/', require('./routes/users.routes'));
router.use('/', require('./routes/pricing.routes'));
router.use('/', require('./routes/financial.routes'));
router.use('/', require('./routes/payments.routes'));
router.use('/', require('./routes/incentives.routes'));
router.use('/', require('./routes/plans.routes'));
router.use('/', require('./routes/system.routes'));
// Admin → Live errors: what real people are hitting, in every app (telemetry/errors).
router.use('/', require('../telemetry/errors-admin.routes'));
router.use('/', require('./routes/support.routes'));
router.use('/', require('./routes/audit.routes'));
router.use('/', require('./routes/shield.routes'));
router.use('/', require('../fraud/fraud.routes'));
router.use('/', require('../zone/zone.routes'));
router.use('/', require('./routes/cities.routes'));
router.use('/', require('./routes/content.routes'));
router.use('/', require('./routes/rewards-config.routes'));
router.use('/', require('./routes/worker-ops.routes'));
router.use('/worker/appeals',  require('../worker/appeal.routes').adminRouter);
router.use('/worker/training', require('../worker/training.routes').adminRouter);

module.exports = router;
