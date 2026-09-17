const seoRoutes = require('../modules/seo/seo.routes');
const authRoutes = require('../modules/auth/auth.routes');
const verticalConfigRoutes = require('../modules/service/vertical-config.routes');
const userRoutes = require('../modules/user/user.routes');
const uploadRoutes = require('../modules/user/upload.routes');
const workerRoutes = require('../modules/worker/worker.routes');
const shopRoutes = require('../modules/shop/shop.routes');
const repairRoutes = require('../modules/repair/repair.routes');
const helpingRoutes = require('../modules/helping/helping.routes');
const petRoutes = require('../modules/pet/pet.routes');
const onboardingRoutes = require('../modules/onboarding/onboarding.routes');
const kycRoutes = require('../modules/worker/kyc.routes');
const orderRoutes = require('../modules/order/order.routes');
const featuresRoutes = require('../modules/order/features.routes');
const workerFeaturesRoutes = require('../modules/worker/worker-features.routes');
const serviceMemoryRoutes = require('../modules/service/service-memory.routes');
const { router: serviceFeaturesRouter, orderRouter: serviceOrderRouter } = require('../modules/service/service-features.routes');
const verticalFeaturesRouter = require('../modules/service/vertical-features.routes');
const adminRoutes = require('../modules/admin/admin.routes');
const pricingRoutes = require('../modules/pricing/pricing.routes');
const subscriptionRoutes = require('../modules/subscription/subscription.routes');
const walletRoutes = require('../modules/wallet/wallet.routes');
const paymentRoutes = require('../modules/payment/payment.routes');
const disputeRoutes = require('../modules/dispute/dispute.routes');
const referralRoutes = require('../modules/referral/referral.routes');
const notificationRoutes = require('../modules/notification/notification.routes');
const serviceRoutes = require('../modules/service/service.routes');
const payoutRoutes = require('../modules/payout/payout.routes');
const engagementRoutes = require('../modules/engagement/engagement.routes');
const adRoutes = require('../modules/ads/ad.routes');
const promoRoutes = require('../modules/promo/promo.routes');
const { router: eventRoutes, adminRouter: eventAdminRoutes, partnerRouter: eventPartnerRoutes } = require('../modules/events/event.routes');
const appealRoutes = require('../modules/worker/appeal.routes');
const trainingRoutes = require('../modules/worker/training.routes');
const mapsRoutes = require('../modules/maps/maps.routes');
const telemetryRoutes = require('../modules/telemetry/telemetry.routes');
const searchRoutes = require('../modules/search/search.routes');
const lensRoutes = require('../modules/lens/lens.routes');
const contentRoutes = require('../modules/content/content.routes');
const rewardsRoutes = require('../modules/rewards/rewards.routes');

function mountRoutes(app) {
  const slug = process.env.ADMIN_LOGIN_SLUG;
  if (!slug) throw new Error('ADMIN_LOGIN_SLUG env var is required');

  // SEO routes served at root — sitemap, robots, city/category landing pages
  app.use('/', seoRoutes);

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/uploads', uploadRoutes);
  app.use('/api/workers', workerRoutes);
  app.use('/api/shops', shopRoutes);
  // Repair verticals — catalog, diagnostics, providers, bookings, quotes.
  app.use('/api/repair', repairRoutes);
  app.use('/api/helping', helpingRoutes);
  app.use(`/api/${slug}/helping`, helpingRoutes.adminRouter);
  app.use('/api/pet', petRoutes);
  app.use(`/api/${slug}/pet`, petRoutes.adminRouter);
  // Provider onboarding — domain, service line, per-service verification.
  app.use('/api/provider/onboarding', onboardingRoutes);
  app.use('/api/workers/kyc', kycRoutes);
  // Engagement FIRST — /orders/suggestions, /orders/:id/chat etc. must match
  // before the generic /api/orders/:id route below intercepts them.
  app.use('/api', engagementRoutes);
  app.use(`/api/${slug}/support`, engagementRoutes.adminRouter);
  app.use('/api/orders', orderRoutes);
  app.use('/api/orders', featuresRoutes);              // Feature routes: /api/orders/:id/service-photos, /tip, etc.
  app.use('/api/orders', serviceOrderRouter);          // Service features: materials, checklist, spare-parts, inspection
  app.use('/api/workers', workerFeaturesRoutes);       // Worker features: /sos, /earned-wage, /emergency-fund, /area-notes
  app.use('/api/worker/appeals', appealRoutes);
  app.use('/api/worker/training', trainingRoutes);
  app.use(`/api/${slug}/worker/appeals`, appealRoutes.adminRouter);
  app.use(`/api/${slug}/worker/training`, trainingRoutes.adminRouter);
  app.use('/api/service-memory', serviceMemoryRoutes); // Appliance passport
  app.use('/api/service-features', serviceFeaturesRouter); // Diagnosis, warranty, maintenance plans, portfolio, time-estimate
  app.use('/api/vertical-features', verticalFeaturesRouter); // Phone catalog/health, vehicle profiles/health, construction timer/site-visit
  app.use(`/api/${slug}`, adminRoutes);
  app.use(`/api/${slug}/pricing`, pricingRoutes.adminRouter);
  app.use(`/api/${slug}/disputes`, disputeRoutes.adminRouter);
  app.use('/api/pricing', pricingRoutes);
  app.use('/api/subscriptions', subscriptionRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/disputes', disputeRoutes);
  app.use('/api/referrals', referralRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/catalog', serviceRoutes);
  app.use('/api/payouts', payoutRoutes);
  app.use(`/api/${slug}/payouts`, payoutRoutes.adminRouter);

  // Vertical service configs (admin-only)
  app.use(`/api/${slug}/verticals`, verticalConfigRoutes);

  // Ads + Promo
  app.use('/api/ads', adRoutes);
  app.use(`/api/${slug}/ads`, adRoutes.adminRouter);
  app.use('/api/promos', promoRoutes);
  app.use(`/api/${slug}/promos`, promoRoutes.adminRouter);

  // Event Commerce
  app.use('/api/events/partner', eventPartnerRoutes);  // MUST be before /api/events to avoid :id conflict
  app.use('/api/events', eventRoutes);
  app.use(`/api/${slug}/events`, eventAdminRoutes);

  // Google Maps proxy — keeps API key server-side, adds auth gate + caching
  app.use('/api/maps', mapsRoutes);

  // Public analytics ingest (visitor/page/search telemetry) — unauth, rate-limited
  app.use('/api/telemetry', telemetryRoutes);
  app.use('/api/search', searchRoutes);

  // ZappyLens — visual service search (auth, rate-limited)
  app.use('/api/lens', lensRoutes);

  // Admin-managed content — public FAQs + policy pages (read-only)
  app.use('/api/content', contentRoutes);

  // Rewards — points balance, redeem, scratch cards (auth)
  app.use('/api/rewards', rewardsRoutes);

  // Block anyone probing the old /api/admin path
  app.use('/api/admin', (req, res) => res.status(404).json({ error: 'Not found' }));
}

module.exports = mountRoutes;
