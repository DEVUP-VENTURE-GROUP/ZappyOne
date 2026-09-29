'use strict';

const router = require('express').Router();

const { ziAuth } = require('../middleware/zi-auth.middleware');
const ziAudit = require('../middleware/zi-audit.middleware');

const authCtrl = require('../controllers/auth.controller');
const commandCtrl = require('../controllers/command.controller');
const expansionCtrl = require('../controllers/expansion.controller');
const aiCtrl = require('../controllers/ai.controller');
const forecastCtrl = require('../controllers/forecast.controller');
const fraudCtrl = require('../controllers/fraud.controller');
const heatmapCtrl = require('../controllers/heatmap.controller');
const pricingCtrl = require('../controllers/pricing-intel.controller');
const partnerCtrl = require('../controllers/partner.controller');
const workerCtrl = require('../controllers/worker.controller');
const investorCtrl = require('../controllers/investor.controller');
const simulatorCtrl = require('../controllers/simulator.controller');
const adsCtrl = require('../controllers/ads.controller');

// ── Auth (public) ────────────────────────────────────────────────────────────
router.post('/auth/login', authCtrl.login);

// ── Apply audit logging to all authenticated routes ──────────────────────────
router.use(ziAudit);

// ── Auth (protected) ─────────────────────────────────────────────────────────
router.get('/auth/me', ziAuth('command:read'), authCtrl.me);
router.post('/auth/register', ziAuth('super_admin'), authCtrl.register);
router.get('/auth/users', ziAuth('super_admin'), authCtrl.listUsers);
router.post('/auth/users/:id/deactivate', ziAuth('super_admin'), authCtrl.deactivateUser);

// ── Command Center ────────────────────────────────────────────────────────────
router.get('/command/live', ziAuth('command:read'), commandCtrl.getLiveMetrics);
router.get('/command/cities', ziAuth('command:read'), commandCtrl.getCityHealth);
router.get('/command/revenue', ziAuth('command:read'), commandCtrl.getRevenueBreakdown);
router.get('/command/alerts', ziAuth('command:read'), commandCtrl.getAlerts);
router.get('/command/top-workers', ziAuth('command:read'), commandCtrl.getTopWorkers);
router.get('/command/top-services', ziAuth('command:read'), commandCtrl.getTopServices);
router.get('/command/service-health', ziAuth('command:read'), commandCtrl.getServiceHealth);

// ── Expansion Engine ──────────────────────────────────────────────────────────
router.get('/expansion/recommendations', ziAuth('expansion:read'), expansionCtrl.getRecommendations);
router.post('/expansion/analyze', ziAuth('expansion:read'), expansionCtrl.analyzeCity);
router.get('/expansion/category-gaps', ziAuth('expansion:read'), expansionCtrl.getCategoryGaps);
router.get('/expansion/list', ziAuth('expansion:read'), expansionCtrl.listRecommendations);
router.post('/expansion/save', ziAuth('expansion:write'), expansionCtrl.saveRecommendation);
router.post('/expansion/:id/approve', ziAuth('expansion:approve'), expansionCtrl.approveRecommendation);
router.post('/expansion/:id/reject', ziAuth('expansion:approve'), expansionCtrl.rejectRecommendation);

// ── AI Suite ──────────────────────────────────────────────────────────────────
router.post('/ai/ask', ziAuth('ai:read'), aiCtrl.askAI);
router.post('/ai/stream', ziAuth('ai:read'), aiCtrl.streamAI);
router.get('/ai/insights/daily', ziAuth('ai:read'), aiCtrl.getDailyInsights);
router.post('/ai/report', ziAuth('ai:read'), aiCtrl.generateReport);
router.post('/ai/strategy', ziAuth('ai:write'), aiCtrl.askStrategy);

// ── Forecasting ────────────────────────────────────────────────────────────────
router.get('/forecast/demand', ziAuth('forecast:read'), forecastCtrl.getDemandForecast);
router.get('/forecast/revenue', ziAuth('forecast:read'), forecastCtrl.getRevenueForecast);
router.get('/forecast/worker-demand', ziAuth('forecast:read'), forecastCtrl.getWorkerDemand);
router.get('/forecast/accuracy', ziAuth('forecast:read'), forecastCtrl.getAccuracyReport);
router.post('/forecast/retrain', ziAuth('forecast:write'), forecastCtrl.triggerRetrain);

// ── Fraud Center ───────────────────────────────────────────────────────────────
router.get('/fraud/queue', ziAuth('fraud:read'), fraudCtrl.getFraudQueue);
router.post('/fraud/review/:id', ziAuth('fraud:review'), fraudCtrl.reviewFraudEvent);
router.get('/fraud/stats', ziAuth('fraud:read'), fraudCtrl.getFraudStats);
router.post('/fraud/assess', ziAuth('fraud:write'), fraudCtrl.manualAssess);
router.post('/fraud/block', ziAuth('fraud:write'), fraudCtrl.blockEntity);

// ── Heatmaps ───────────────────────────────────────────────────────────────────
router.get('/heatmap/demand', ziAuth('heatmap:read'), heatmapCtrl.getDemandHeatmap);
router.get('/heatmap/revenue', ziAuth('heatmap:read'), heatmapCtrl.getRevenueHeatmap);
router.get('/heatmap/workers', ziAuth('heatmap:read'), heatmapCtrl.getWorkerHeatmap);
router.get('/heatmap/gap', ziAuth('heatmap:read'), heatmapCtrl.getSupplyDemandGap);
router.get('/heatmap/complaints', ziAuth('heatmap:read'), heatmapCtrl.getComplaintHeatmap);

// ── Pricing Intelligence ───────────────────────────────────────────────────────
router.get('/pricing/heatmap', ziAuth('pricing:read'), pricingCtrl.getPricingHeatmap);
router.get('/pricing/history', ziAuth('pricing:read'), pricingCtrl.getPricingHistory);
router.get('/pricing/recommendations', ziAuth('pricing:read'), pricingCtrl.getPricingRecommendations);
router.post('/pricing/simulate', ziAuth('pricing:read'), pricingCtrl.simulateRevenue);

// ── Partner Intelligence ───────────────────────────────────────────────────────
router.get('/partner/intel', ziAuth('partner:intel:read'), partnerCtrl.getPartnerIntel);
router.get('/partner/intel/:partnerId', ziAuth('partner:intel:read'), partnerCtrl.getPartnerDetail);
router.get('/partner/intel/:partnerId/insights', ziAuth('partner:intel:read'), partnerCtrl.getPartnerInsights);
router.post('/partner/intel/:partnerId/recompute', ziAuth('partner:intel:write'), partnerCtrl.triggerRecompute);

// ── Worker Intelligence ────────────────────────────────────────────────────────
router.get('/worker/intel', ziAuth('worker:intel:read'), workerCtrl.getWorkerIntel);
router.get('/worker/leaderboard', ziAuth('worker:intel:read'), workerCtrl.getWorkerLeaderboard);
router.get('/worker/intel/:workerId', ziAuth('worker:intel:read'), workerCtrl.getWorkerDetail);
router.get('/worker/intel/:workerId/insights', ziAuth('worker:intel:read'), workerCtrl.getWorkerInsights);
router.post('/worker/intel/:workerId/recompute', ziAuth('worker:intel:write'), workerCtrl.triggerRecompute);

// ── Investor Boardroom ─────────────────────────────────────────────────────────
router.get('/investor/summary', ziAuth('investor:read'), investorCtrl.getSummary);
router.get('/investor/unit-economics', ziAuth('investor:read'), investorCtrl.getUnitEconomics);
router.get('/investor/cohorts', ziAuth('investor:read'), investorCtrl.getCohortAnalysis);
router.get('/investor/growth', ziAuth('investor:read'), investorCtrl.getGrowthMetrics);
router.post('/investor/report', ziAuth('investor:read'), investorCtrl.generateReport);
router.post('/investor/export', ziAuth('investor:read'), investorCtrl.exportReport);

// ── City Simulator ─────────────────────────────────────────────────────────────
router.post('/simulator/run', ziAuth('simulator:read'), simulatorCtrl.runSimulation);
router.post('/simulator/scenarios', ziAuth('simulator:read'), simulatorCtrl.runScenarios);
router.get('/simulator/list', ziAuth('simulator:read'), simulatorCtrl.listSimulations);
router.post('/simulator/save', ziAuth('simulator:write'), simulatorCtrl.saveSimulation);
router.post('/simulator/compare', ziAuth('simulator:read'), simulatorCtrl.compareSimulations);

// ── Ads Platform ───────────────────────────────────────────────────────────────
router.post('/ads/campaigns', ziAuth('ads:write'), adsCtrl.createCampaign);
router.get('/ads/campaigns', ziAuth('ads:read'), adsCtrl.listCampaigns);
router.get('/ads/campaigns/:id', ziAuth('ads:read'), adsCtrl.getCampaign);
router.patch('/ads/campaigns/:id', ziAuth('ads:write'), adsCtrl.updateCampaign);
router.post('/ads/campaigns/:id/activate', ziAuth('ads:approve'), adsCtrl.activateCampaign);
router.post('/ads/campaigns/:id/pause', ziAuth('ads:write'), adsCtrl.pauseCampaign);
router.get('/ads/campaigns/:id/analytics', ziAuth('ads:read'), adsCtrl.getCampaignAnalytics);
router.get('/ads/revenue', ziAuth('ads:read'), adsCtrl.getAdsRevenue);
router.post('/ads/impression', adsCtrl.recordImpression);  // no auth — called by client SDKs
router.post('/ads/click', adsCtrl.recordClick);             // no auth — called by client SDKs

module.exports = router;
