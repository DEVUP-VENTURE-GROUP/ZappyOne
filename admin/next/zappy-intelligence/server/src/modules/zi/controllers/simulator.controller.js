'use strict';

const simulatorService = require('../services/simulator.service');

async function runSimulation(req, res) {
  try {
    const data = await simulatorService.runSimulation(req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function runScenarios(req, res) {
  try {
    const data = await simulatorService.runScenarios(req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function listSimulations(req, res) {
  try {
    const data = await simulatorService.getSavedSimulations(req.ziUser._id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function saveSimulation(req, res) {
  try {
    const { simulationResult, name } = req.body;
    if (!simulationResult || !name) {
      return res.status(400).json({ success: false, message: 'simulationResult and name required' });
    }
    const data = await simulatorService.saveSimulation(simulationResult, name, req.ziUser._id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function compareSimulations(req, res) {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length < 2) {
      return res.status(400).json({ success: false, message: 'Provide at least 2 simulation ids' });
    }
    const data = await simulatorService.compareSimulations(ids);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { runSimulation, runScenarios, listSimulations, saveSimulation, compareSimulations };
