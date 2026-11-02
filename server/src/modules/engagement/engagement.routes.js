const express = require('express');
const Joi = require('joi');
const ctrl = require('./engagement.controller');
const Feedback = require('../order/feedback.model');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');
const recommendationsService = require('./recommendations.service');
const gamificationService = require('./user-gamification.service');

const router = express.Router();

router.get('/orders/suggestions', authenticate, requireRole('user'), ctrl.getSuggestions);

router.post(
  '/orders/:orderId/chat',
  authenticate,
  validate(Joi.object({ text: Joi.string().min(1).max(1000).required(), cannedCode: Joi.string().max(50).optional() })),
  ctrl.sendChat
);

router.get(
  '/orders/:orderId/chat',
  authenticate,
  validate(Joi.object({ before: Joi.string().optional(), limit: Joi.number().integer().min(1).max(100).default(50) }), 'query'),
  ctrl.listChat
);

router.post('/orders/:orderId/call', authenticate, ctrl.startCall);
router.post('/calls/provider-webhook', ctrl.callProviderWebhook);
router.get('/workers/:id/public-profile', authenticate, ctrl.getWorkerPublicProfile);

router.post(
  '/orders/:orderId/feedback',
  authenticate,
  validate(Joi.object({
    sentiment: Joi.string().valid('positive', 'neutral', 'negative').required(),
    tags: Joi.array().items(Joi.string().valid(...Feedback.TAGS)).max(5).default([]),
    comment: Joi.string().max(1000).allow(''),
  })),
  ctrl.submitFeedback
);

router.post(
  '/support',
  authenticate,
  validate(Joi.object({
    category: Joi.string().valid('payment', 'account', 'order', 'kyc', 'app_bug', 'feature_request', 'complaint', 'other').required(),
    subject: Joi.string().min(3).max(200).required(),
    description: Joi.string().min(10).max(2000).required(),
    orderId: Joi.string().hex().length(24).optional(),
    attachments: Joi.array().items(Joi.string()).max(5).default([]),
    priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
  })),
  ctrl.createTicket
);

router.get('/support/mine', authenticate, ctrl.listMyTickets);
router.get('/support/:id', authenticate, ctrl.getTicket);

// Smart recommendations
router.get('/recommendations', authenticate, async (req, res, next) => {
  try {
    if (req.auth.role === 'worker') {
      const data = await recommendationsService.getWorkerRecommendations(req.auth.sub);
      return res.json(data);
    }
    const services = await recommendationsService.getUserRecommendations(req.auth.sub);
    const trending = await recommendationsService.getTrending();
    res.json({ services, trending });
  } catch (err) { next(err); }
});

// User gamification profile
router.get('/gamification', authenticate, requireRole('user'), async (req, res, next) => {
  try {
    const profile = await gamificationService.getGamificationProfile(req.auth.sub);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json({ gamification: profile });
  } catch (err) { next(err); }
});

router.post(
  '/support/:id/messages',
  authenticate,
  validate(Joi.object({ text: Joi.string().min(1).max(2000).required() })),
  ctrl.addTicketMessage
);

const adminRouter = express.Router();
adminRouter.use(authenticate, requireRole('admin'));
adminRouter.get('/', ctrl.adminListTickets);
adminRouter.post(
  '/:id/reply',
  validate(Joi.object({
    text:   Joi.string().min(1).max(2000).required(),
    status: Joi.string().valid('open', 'in_progress', 'waiting_user', 'resolved', 'closed').optional(),
  })),
  ctrl.adminReplyTicket
);
adminRouter.patch(
  '/:id/status',
  validate(Joi.object({
    status: Joi.string().valid('open', 'in_progress', 'waiting_user', 'resolved', 'closed').required(),
    note:   Joi.string().max(1000).optional(),
  })),
  ctrl.adminUpdateTicketStatus
);

module.exports = router;
module.exports.adminRouter = adminRouter;
