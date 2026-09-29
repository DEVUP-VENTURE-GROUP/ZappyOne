'use strict';

const investorService = require('../services/investor.service');

async function getSummary(req, res) {
  try {
    const { period = 'mtd' } = req.query;
    const data = await investorService.getSummaryMetrics(period);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getUnitEconomics(req, res) {
  try {
    const data = await investorService.getUnitEconomics();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getCohortAnalysis(req, res) {
  try {
    const { months = '12' } = req.query;
    const data = await investorService.getCohortAnalysis(parseInt(months));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getGrowthMetrics(req, res) {
  try {
    const data = await investorService.getGrowthMetrics();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function generateReport(req, res) {
  try {
    const { period = 'mtd' } = req.body;
    const data = await investorService.generateInvestorReport(period);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function exportReport(req, res) {
  try {
    const { format = 'json', period = 'mtd' } = req.body;
    const data = await investorService.exportReport(format, period);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getSummary, getUnitEconomics, getCohortAnalysis, getGrowthMetrics, generateReport, exportReport };
