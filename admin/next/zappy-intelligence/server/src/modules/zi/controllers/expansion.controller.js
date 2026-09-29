'use strict';

const expansionService = require('../services/expansion.service');

async function getRecommendations(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const data = await expansionService.getRecommendations(limit);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function analyzeCity(req, res) {
  try {
    const { city, state } = req.body;
    if (!city || !state) {
      return res.status(400).json({ success: false, message: 'city and state are required' });
    }
    const data = await expansionService.scoreCity(city, state);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getCategoryGaps(req, res) {
  try {
    const { cityId } = req.query;
    if (!cityId) return res.status(400).json({ success: false, message: 'cityId is required' });
    const data = await expansionService.getCategoryGaps(cityId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function listRecommendations(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const ZIExpansionRecommendation = require('../models/ZIExpansionRecommendation');
    const filter = status ? { status } : {};
    const docs = await ZIExpansionRecommendation.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('createdBy', 'email role')
      .populate('approvedBy', 'email role');
    const total = await ZIExpansionRecommendation.countDocuments(filter);
    res.json({ success: true, data: docs, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function approveRecommendation(req, res) {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const ZIExpansionRecommendation = require('../models/ZIExpansionRecommendation');
    const data = await ZIExpansionRecommendation.findByIdAndUpdate(
      id,
      { $set: { status: 'approved', approvedBy: req.ziUser._id, approvalNotes: notes || '' } },
      { new: true }
    );
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function rejectRecommendation(req, res) {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const ZIExpansionRecommendation = require('../models/ZIExpansionRecommendation');
    const data = await ZIExpansionRecommendation.findByIdAndUpdate(
      id,
      { $set: { status: 'rejected', approvedBy: req.ziUser._id, approvalNotes: notes || '' } },
      { new: true }
    );
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function saveRecommendation(req, res) {
  try {
    const data = await expansionService.saveRecommendation(req.body, req.ziUser._id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getRecommendations,
  analyzeCity,
  getCategoryGaps,
  listRecommendations,
  approveRecommendation,
  rejectRecommendation,
  saveRecommendation,
};
