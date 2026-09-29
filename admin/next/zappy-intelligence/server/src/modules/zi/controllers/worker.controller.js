'use strict';

const workerService = require('../services/worker-intel.service');

async function getWorkerIntel(req, res) {
  try {
    const { cityId, minScore, page = 1, limit = 20 } = req.query;
    const data = await workerService.getAllWorkerIntel({
      cityId,
      minScore: minScore ? parseInt(minScore) : undefined,
      page: parseInt(page),
      limit: parseInt(limit),
    });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getWorkerDetail(req, res) {
  try {
    const ZIWorkerIntel = require('../models/ZIWorkerIntel');
    const doc = await ZIWorkerIntel.findOne({ workerId: req.params.workerId }).populate('workerId', 'name phone skills rating');
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getWorkerInsights(req, res) {
  try {
    const data = await workerService.getWorkerInsights(req.params.workerId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getWorkerLeaderboard(req, res) {
  try {
    const { cityId, metric = 'earnings', limit = 20 } = req.query;
    const data = await workerService.getWorkerLeaderboard(cityId, metric, parseInt(limit));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function triggerRecompute(req, res) {
  try {
    const data = await workerService.computeWorkerScores(req.params.workerId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getWorkerIntel, getWorkerDetail, getWorkerInsights, getWorkerLeaderboard, triggerRecompute };
