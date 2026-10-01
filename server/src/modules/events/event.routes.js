const express = require('express');
const Joi = require('joi');
const { validate } = require('../../middlewares/validate');
const { authenticate, requireRole } = require('../../middlewares/auth');
const c = require('./event.controller');
const a = require('./event-admin.controller');
const p  = require('./event-partner-api.controller');
const ep = require('./event-payment.controller');
const notifCtrl = require('../notification/notification.controller');

// User-facing routes (/api/events)
const router = express.Router();

router.get('/config',        c.getConfig);
router.get('/categories',    c.getCategories);
router.get('/themes',        c.getThemes);
router.get('/themes/:id',    c.getTheme);

// Auth-required user routes
router.post('/themes/:id/save', authenticate, c.toggleSave);
router.get('/saved',             authenticate, c.getSaved);
router.post('/bookings',         authenticate, requireRole('user'), c.createBooking);
router.get('/bookings',          authenticate, requireRole('user'), c.getBookings);
router.get('/bookings/:id',      authenticate, requireRole('user'), c.getBooking);
router.post('/bookings/:id/cancel',              authenticate, requireRole('user'), c.cancelBooking);
router.post('/bookings/:id/review',              authenticate, requireRole('user'), c.submitReview);
// Payment routes
router.post('/bookings/:id/pay/advance',         authenticate, requireRole('user'), ep.createAdvanceOrder);
router.post('/bookings/:id/pay/advance/verify',  authenticate, requireRole('user'), ep.verifyAdvancePayment);
router.post('/bookings/:id/pay/remaining',       authenticate, requireRole('user'), ep.createRemainingOrder);
router.post('/bookings/:id/pay/remaining/verify',authenticate, requireRole('user'), ep.verifyRemainingPayment);

// Partner routes (/api/events/partner)
const partnerRouter = express.Router();
partnerRouter.use(authenticate, requireRole('event_partner'));

partnerRouter.get('/overview',                p.getOverview);
partnerRouter.get('/me',                      p.getMe);
partnerRouter.patch('/me',                    p.updateMe);
partnerRouter.get('/categories',              p.getCategories);
partnerRouter.get('/themes',                  p.getMyThemes);
partnerRouter.post('/themes',                 p.createTheme);
partnerRouter.patch('/themes/:id',            p.updateTheme);
partnerRouter.delete('/themes/:id',           p.deleteTheme);
partnerRouter.get('/bookings',                p.getMyBookings);
partnerRouter.patch('/bookings/:id/status',
  require('../../middlewares/rateLimit').makeLimiter({ windowMs: 5 * 60_000, max: 10, prefix: 'evtcode' }),
  validate(Joi.object({ status: Joi.string().required(), code: Joi.string().pattern(/^[0-9]{4,6}$/).allow('', null), })),
  p.updateBookingStatus);
partnerRouter.post('/bookings/:id/decline',   p.declineBooking);
partnerRouter.get('/calendar',                p.getCalendar);
partnerRouter.post('/calendar/block',         p.blockDate);
partnerRouter.delete('/calendar/block/:date', p.unblockDate);
partnerRouter.get('/earnings',                p.getEarnings);
// Static sub-path must come before param route (:idx would match "field")
partnerRouter.get('/kyc/stream/field/:fieldName', p.streamMyKycField);
partnerRouter.get('/kyc/stream/:idx',             p.streamMyKycDoc);
// Notifications
partnerRouter.get('/notifications',               notifCtrl.list);
partnerRouter.post('/notifications/read-all',     notifCtrl.markAllRead);
partnerRouter.post('/notifications/:id/read',     notifCtrl.markRead);

// Admin routes (/api/{slug}/events)
const adminRouter = express.Router();
adminRouter.use(authenticate, requireRole('admin'));

adminRouter.get('/themes',           a.listThemes);
adminRouter.patch('/themes/:id',     a.updateThemeStatus);
adminRouter.get('/bookings',              a.listBookings);
adminRouter.post('/bookings/:id/cancel', a.cancelBooking);
adminRouter.get('/partners',                      a.listPartners);
adminRouter.post('/partners',                     a.createPartner);
adminRouter.get('/partners/:id',                  a.getPartner);
adminRouter.patch('/partners/:id',                a.updatePartner);
adminRouter.post('/partners/:id/kyc/approve',     a.approvePartnerKyc);
adminRouter.post('/partners/:id/kyc/reject',      a.rejectPartnerKyc);
adminRouter.get('/partners/:id/kyc/field/:fieldName',   a.streamPartnerKycField);
adminRouter.get('/partners/:id/kyc/stream/:idx',        a.streamPartnerKycDoc);
adminRouter.post('/partners/:id/block',           a.blockPartner);
adminRouter.get('/config',           a.getConfig);
adminRouter.put('/config',
  validate(Joi.object({
    advancePaymentPct:      Joi.number().min(1).max(100),
    platformCommissionPct:  Joi.number().min(0).max(50),
    travelFeePerKmPaise:    Joi.number().integer().min(0),
    minAdvanceBookingHours: Joi.number().min(1).max(72),
    maxAdvanceBookingDays:  Joi.number().min(1).max(730),
    bookingEnabled:         Joi.boolean(),
    sameDayBookingEnabled:  Joi.boolean(),
    videoEnabled:           Joi.boolean(),
    cancellationPolicy:     Joi.array().items(Joi.object({
      daysBeforeEvent: Joi.number().integer().min(0).required(),
      refundPct:       Joi.number().min(0).max(100).required(),
    })),
  }).min(1)),
  a.updateConfig);
adminRouter.get('/analytics',        a.getAnalytics);
adminRouter.get('/categories',       a.listCategories);
adminRouter.post('/categories',      a.upsertCategory);

module.exports = { router, adminRouter, partnerRouter };
