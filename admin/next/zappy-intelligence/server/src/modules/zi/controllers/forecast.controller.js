'use strict';

const forecastService = require('../services/forecast.service');

async function getDemandForecast(req, res) {
  try {
    const { cityId, category, horizon = '30' } = req.query;
    if (!cityId) return res.status(400).json({ success: false, message: 'cityId required' });
    const data = await forecastService.forecastDemand(cityId, category || 'all', parseInt(horizon));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getRevenueForecast(req, res) {
  try {
    const { cityId, horizon = '90' } = req.query;
    if (!cityId) return res.status(400).json({ success: false, message: 'cityId required' });
    const data = await forecastService.forecastRevenue(cityId, parseInt(horizon));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getWorkerDemand(req, res) {
  try {
    const { cityId, date } = req.query;
    if (!cityId) return res.status(400).json({ success: false, message: 'cityId required' });
    const targetDate = date ? new Date(date) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const data = await forecastService.forecastWorkerDemand(cityId, targetDate);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getAccuracyReport(req, res) {
  try {
    const { cityId } = req.query;
    if (!cityId) return res.status(400).json({ success: false, message: 'cityId required' });
    const data = await forecastService.getAccuracyReport(cityId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function triggerRetrain(req, res) {
  try {
    const { cityId } = req.body;
    if (!cityId) return res.status(400).json({ success: false, message: 'cityId required' });
    const data = await forecastService.retrainModels(cityId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getDemandForecast, getRevenueForecast, getWorkerDemand, getAccuracyReport, triggerRetrain };
