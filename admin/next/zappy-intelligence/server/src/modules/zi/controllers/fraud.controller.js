'use strict';

const fraudService = require('../services/fraud.service');

async function getFraudQueue(req, res) {
  try {
    const { status, riskLevel, limit = 50, page = 1 } = req.query;
    const data = await fraudService.getFraudQueue({ status, riskLevel, limit: parseInt(limit), page: parseInt(page) });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function reviewFraudEvent(req, res) {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;
    if (!action) return res.status(400).json({ success: false, message: 'action required' });
    const data = await fraudService.reviewFraudEvent(id, action, notes, req.ziUser._id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getFraudStats(req, res) {
  try {
    const data = await fraudService.getFraudStats();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function manualAssess(req, res) {
  try {
    const { entityType, entityId } = req.body;
    if (!entityType || !entityId) {
      return res.status(400).json({ success: false, message: 'entityType and entityId required' });
    }
    const data = await fraudService.assessRisk(entityType, entityId, {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function blockEntity(req, res) {
  try {
    const { entityType, entityId, reason } = req.body;
    if (!entityType || !entityId) {
      return res.status(400).json({ success: false, message: 'entityType and entityId required' });
    }
    const data = await fraudService.blockEntity(entityType, entityId, reason || 'Blocked by ZI admin');
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getFraudQueue, reviewFraudEvent, getFraudStats, manualAssess, blockEntity };
