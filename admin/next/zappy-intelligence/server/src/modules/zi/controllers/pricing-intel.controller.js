'use strict';

const pricingService = require('../services/pricing-intel.service');

async function getPricingHeatmap(req, res) {
  try {
    const { cityId } = req.query;
    if (!cityId) return res.status(400).json({ success: false, message: 'cityId required' });
    const data = await pricingService.getPricingHeatmap(cityId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getPricingHistory(req, res) {
  try {
    const { service, cityId, days = '30' } = req.query;
    if (!service || !cityId) return res.status(400).json({ success: false, message: 'service and cityId required' });
    const data = await pricingService.getPricingHistory(service, cityId, parseInt(days));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getPricingRecommendations(req, res) {
  try {
    const { cityId } = req.query;
    if (!cityId) return res.status(400).json({ success: false, message: 'cityId required' });
    const data = await pricingService.getPricingRecommendations(cityId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function simulateRevenue(req, res) {
  try {
    const { service, newPricePaise, cityId } = req.body;
    if (!service || !newPricePaise || !cityId) {
      return res.status(400).json({ success: false, message: 'service, newPricePaise, cityId required' });
    }
    const data = await pricingService.getRevenueImpactSimulation(service, newPricePaise, cityId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getPricingHeatmap, getPricingHistory, getPricingRecommendations, simulateRevenue };
