'use strict';

const partnerService = require('../services/partner-intel.service');

async function getPartnerIntel(req, res) {
  try {
    const { cityId, minScore, page = 1, limit = 20 } = req.query;
    const data = await partnerService.getAllPartnerIntel({
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

async function getPartnerDetail(req, res) {
  try {
    const ZIPartnerIntel = require('../models/ZIPartnerIntel');
    const doc = await ZIPartnerIntel.findOne({ partnerId: req.params.partnerId });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getPartnerInsights(req, res) {
  try {
    const data = await partnerService.getPartnerInsights(req.params.partnerId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function triggerRecompute(req, res) {
  try {
    const data = await partnerService.computePartnerScores(req.params.partnerId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getPartnerIntel, getPartnerDetail, getPartnerInsights, triggerRecompute };
