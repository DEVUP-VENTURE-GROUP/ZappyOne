'use strict';

const commandService = require('../services/command.service');

async function getLiveMetrics(req, res) {
  try {
    const data = await commandService.getLiveMetrics();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getCityHealth(req, res) {
  try {
    const data = await commandService.getCityHealthScores();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getRevenueBreakdown(req, res) {
  try {
    const period = req.query.period || 'today';
    if (!['today', 'mtd', 'ytd'].includes(period)) {
      return res.status(400).json({ success: false, message: 'Invalid period' });
    }
    const data = await commandService.getRevenueBreakdown(period);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getAlerts(req, res) {
  try {
    const data = await commandService.getAlerts();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getTopWorkers(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const data = await commandService.getTopWorkers(limit);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getTopServices(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const data = await commandService.getTopServices(limit);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getServiceHealth(req, res) {
  try {
    const data = await commandService.getServiceHealth();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getLiveMetrics,
  getCityHealth,
  getRevenueBreakdown,
  getAlerts,
  getTopWorkers,
  getTopServices,
  getServiceHealth,
};
