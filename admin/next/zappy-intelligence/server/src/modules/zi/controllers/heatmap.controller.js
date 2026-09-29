'use strict';

const heatmapService = require('../services/heatmap.service');

async function getDemandHeatmap(req, res) {
  try {
    const { cityId, startDate, endDate } = req.query;
    if (!cityId) return res.status(400).json({ success: false, message: 'cityId required' });
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    const data = await heatmapService.getDemandHeatmap(cityId, start, end);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getRevenueHeatmap(req, res) {
  try {
    const { cityId, period = '7d' } = req.query;
    if (!cityId) return res.status(400).json({ success: false, message: 'cityId required' });
    const data = await heatmapService.getRevenueHeatmap(cityId, period);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getWorkerHeatmap(req, res) {
  try {
    const { cityId } = req.query;
    if (!cityId) return res.status(400).json({ success: false, message: 'cityId required' });
    const data = await heatmapService.getWorkerHeatmap(cityId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getSupplyDemandGap(req, res) {
  try {
    const { cityId } = req.query;
    if (!cityId) return res.status(400).json({ success: false, message: 'cityId required' });
    const data = await heatmapService.getSupplyDemandGap(cityId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getComplaintHeatmap(req, res) {
  try {
    const { cityId, days = '30' } = req.query;
    if (!cityId) return res.status(400).json({ success: false, message: 'cityId required' });
    const data = await heatmapService.getComplaintHeatmap(cityId, parseInt(days));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getDemandHeatmap, getRevenueHeatmap, getWorkerHeatmap, getSupplyDemandGap, getComplaintHeatmap };
