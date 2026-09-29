'use strict';

const adsService = require('../services/ads.service');

async function createCampaign(req, res) {
  try {
    const data = await adsService.createCampaign(req.body, req.ziUser._id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function listCampaigns(req, res) {
  try {
    const ZIAdsCampaign = require('../models/ZIAdsCampaign');
    const { status, advertiserType, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (advertiserType) filter.advertiserType = advertiserType;
    const docs = await ZIAdsCampaign.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await ZIAdsCampaign.countDocuments(filter);
    res.json({ success: true, data: docs, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getCampaign(req, res) {
  try {
    const ZIAdsCampaign = require('../models/ZIAdsCampaign');
    const doc = await ZIAdsCampaign.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function updateCampaign(req, res) {
  try {
    const ZIAdsCampaign = require('../models/ZIAdsCampaign');
    const doc = await ZIAdsCampaign.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function activateCampaign(req, res) {
  try {
    const data = await adsService.activateCampaign(req.params.id, req.ziUser._id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function pauseCampaign(req, res) {
  try {
    const ZIAdsCampaign = require('../models/ZIAdsCampaign');
    const doc = await ZIAdsCampaign.findByIdAndUpdate(req.params.id, { status: 'paused' }, { new: true });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getCampaignAnalytics(req, res) {
  try {
    const data = await adsService.getCampaignAnalytics(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getAdsRevenue(req, res) {
  try {
    const { period = 'mtd' } = req.query;
    const data = await adsService.getAdsRevenue(period);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function recordImpression(req, res) {
  try {
    const { campaignId, userId, placement } = req.body;
    if (!campaignId) return res.status(400).json({ success: false, message: 'campaignId required' });
    await adsService.recordImpression(campaignId, userId, placement);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function recordClick(req, res) {
  try {
    const { campaignId, userId } = req.body;
    if (!campaignId) return res.status(400).json({ success: false, message: 'campaignId required' });
    await adsService.recordClick(campaignId, userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  createCampaign, listCampaigns, getCampaign, updateCampaign,
  activateCampaign, pauseCampaign, getCampaignAnalytics,
  getAdsRevenue, recordImpression, recordClick,
};
