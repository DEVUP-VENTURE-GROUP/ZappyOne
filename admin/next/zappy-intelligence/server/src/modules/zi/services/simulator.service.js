'use strict';

/**
 * ZI City Launch Financial Simulator
 * 12-month Monte Carlo projections with bear/base/bull scenarios.
 */

const mongoose = require('mongoose');
const ZISimulation = require('../models/ZISimulation');
const logger = require('../../../utils/logger');

// Orders per user per month ramp: starts at 0.3, grows to 1.5 by month 6, then tapers to 1.2
function _ordersPerUserRamp(month) {
  if (month <= 1) return 0.3;
  if (month >= 6) return 1.5;
  // Linear interpolation from 0.3 → 1.5 over months 1-6
  return 0.3 + ((month - 1) / 5) * 1.2;
}

/**
 * Run a 12-month city launch simulation.
 * Returns monthlyProjections array + summary statistics.
 */
function runSimulation(config) {
  const {
    city,
    state,
    population,
    assumptions = {},
  } = config;

  if (!city || !state || !population) {
    throw new Error('city, state, and population are required for simulation');
  }

  const {
    initialWorkers           = 50,
    initialMarketingSpend    = 2000000, // ₹20,000/month default
    avgOrderValuePaise       = 50000,   // ₹500
    targetPenetrationRate    = 0.02,    // 2%
    operationalCostPerOrderPaise = 5000, // ₹50
    workerAcquisitionCost    = 50000,   // ₹500 per worker
    userAcquisitionCost      = 20000,   // ₹200 per user (for initial ramp)
    commissionRate           = 0.18,
  } = assumptions;

  // Addressable market
  const targetUsers = Math.round(population * targetPenetrationRate);

  const monthlyProjections = [];
  let cumCashflow = 0;
  let breakEvenMonth = null;
  let prevUsers = 0;
  let prevWorkers = 0;

  for (let month = 1; month <= 12; month++) {
    // ── Users ───────────────────────────────────────────────────────────────
    let users;
    if (month === 1) {
      users = Math.round(targetUsers * 0.1); // 10% ramp in month 1
    } else {
      users = Math.round(prevUsers * 1.25); // 25% MoM growth
    }
    users = Math.min(users, targetUsers); // cap at target

    // ── Workers ─────────────────────────────────────────────────────────────
    let workers;
    if (month === 1) {
      workers = initialWorkers;
    } else {
      workers = Math.round(prevWorkers * 1.15); // 15% MoM growth
    }
    const newWorkers = Math.max(0, workers - prevWorkers);

    // ── Orders ──────────────────────────────────────────────────────────────
    const ordersPerUser = _ordersPerUserRamp(month);
    const orders = Math.round(users * ordersPerUser);

    // ── Revenue ──────────────────────────────────────────────────────────────
    const gmvPaise     = orders * avgOrderValuePaise;
    const revenuePaise = Math.round(gmvPaise * commissionRate);

    // ── Costs ────────────────────────────────────────────────────────────────
    const opsCost = orders * operationalCostPerOrderPaise;

    // Marketing spend: full for months 1-2, then decays 10%/month
    let marketingCost;
    if (month <= 2) {
      marketingCost = initialMarketingSpend;
    } else {
      marketingCost = Math.round(initialMarketingSpend * Math.pow(0.9, month - 2));
    }

    // Worker acquisition cost for new workers
    const workerAcqCost = newWorkers * workerAcquisitionCost;

    // User acquisition cost for new users (first month ramp only, then organic growth)
    const newUsers = Math.max(0, users - prevUsers);
    const userAcqCost = month <= 3 ? newUsers * userAcquisitionCost : 0;

    const totalCosts = opsCost + marketingCost + workerAcqCost + userAcqCost;

    // ── Cashflow ──────────────────────────────────────────────────────────────
    const cashflow = revenuePaise - totalCosts;
    cumCashflow += cashflow;

    if (!breakEvenMonth && cashflow > 0 && cumCashflow > -totalCosts) {
      breakEvenMonth = month;
    }

    monthlyProjections.push({
      month,
      workers,
      users,
      orders,
      gmvPaise,
      revenuePaise,
      costs: {
        ops:       opsCost,
        workers:   workerAcqCost,
        marketing: marketingCost,
        userAcq:   userAcqCost,
        total:     totalCosts,
      },
      cashflow,
      cumulativeCashflow: cumCashflow,
    });

    prevUsers   = users;
    prevWorkers = workers;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const yr1Revenue = monthlyProjections.reduce((s, m) => s + m.revenuePaise, 0);
  const yr1GMV     = monthlyProjections.reduce((s, m) => s + m.gmvPaise, 0);
  const totalCostYr1 = monthlyProjections.reduce((s, m) => s + m.costs.total, 0);
  const totalInvestmentNeeded = Math.abs(
    Math.min(0, Math.min(...monthlyProjections.map((m) => m.cumulativeCashflow)))
  );

  return {
    city,
    state,
    population,
    inputAssumptions: assumptions,
    monthlyProjections,
    breakEvenMonth,
    totalInvestmentNeeded,
    projectedYr1RevenuePaise: yr1Revenue,
    projectedYr1GMVPaise:     yr1GMV,
    totalCostYr1Paise:        totalCostYr1,
    finalCumulativeCashflow:  cumCashflow,
    confidence:               0.7,
  };
}

/**
 * Run bear, base, and bull scenarios for a given config.
 */
function runScenarios(config) {
  const baseAssumptions = config.assumptions || {};

  // Bear: lower penetration, lower marketing effectiveness (fewer users acquired per spend)
  const bearAssumptions = {
    ...baseAssumptions,
    targetPenetrationRate: (baseAssumptions.targetPenetrationRate || 0.02) * 0.6,
    initialMarketingSpend: Math.round((baseAssumptions.initialMarketingSpend || 2000000) * 0.7),
  };

  // Bull: higher penetration, better marketing ROI
  const bullAssumptions = {
    ...baseAssumptions,
    targetPenetrationRate: Math.min(
      0.15,
      (baseAssumptions.targetPenetrationRate || 0.02) * 1.5
    ),
    initialMarketingSpend: Math.round((baseAssumptions.initialMarketingSpend || 2000000) * 1.3),
  };

  const bear = runSimulation({ ...config, assumptions: bearAssumptions });
  const base = runSimulation({ ...config, assumptions: baseAssumptions });
  const bull = runSimulation({ ...config, assumptions: bullAssumptions });

  return {
    bear: { scenario: 'bear', label: 'Bear Case (60% Penetration, 70% Marketing)', ...bear },
    base: { scenario: 'base', label: 'Base Case',                                   ...base },
    bull: { scenario: 'bull', label: 'Bull Case (150% Penetration, 130% Marketing)',...bull },
  };
}

/**
 * Return all saved simulations for a user.
 */
async function getSavedSimulations(userId) {
  const userObjectId =
    typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

  return ZISimulation.find({ runBy: userObjectId })
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Save a simulation result to the database.
 */
async function saveSimulation(simulationResult, name, userId) {
  if (!name || !name.trim()) {
    throw new Error('Simulation name is required');
  }
  if (!userId) {
    throw new Error('userId is required to save simulation');
  }

  const userObjectId =
    typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

  const doc = await ZISimulation.create({
    name:                    name.trim(),
    city:                    simulationResult.city,
    state:                   simulationResult.state,
    population:              simulationResult.population,
    inputAssumptions:        simulationResult.inputAssumptions || {},
    monthlyProjections:      simulationResult.monthlyProjections || [],
    breakEvenMonth:          simulationResult.breakEvenMonth || null,
    totalInvestmentNeeded:   simulationResult.totalInvestmentNeeded || 0,
    projectedYr1RevenuePaise: simulationResult.projectedYr1RevenuePaise || 0,
    projectedYr1GMVPaise:    simulationResult.projectedYr1GMVPaise || 0,
    confidence:              simulationResult.confidence || 0.7,
    runBy:                   userObjectId,
  });

  logger.info({ simId: doc._id, city: doc.city, userId }, 'simulator: simulation saved');
  return doc;
}

/**
 * Return side-by-side comparison of multiple simulations by ID.
 */
async function compareSimulations(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('ids must be a non-empty array of simulation IDs');
  }
  if (ids.length > 10) {
    throw new Error('Cannot compare more than 10 simulations at once');
  }

  const objectIds = ids.map((id) =>
    typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
  );

  const sims = await ZISimulation.find({ _id: { $in: objectIds } })
    .populate('runBy', 'email role')
    .lean();

  if (sims.length === 0) {
    throw new Error('No simulations found for the given IDs');
  }

  // Build comparison matrix
  const comparison = sims.map((sim) => {
    const yr1Revenue = sim.projectedYr1RevenuePaise;
    const yr1GMV    = sim.projectedYr1GMVPaise;
    const finalMonth = sim.monthlyProjections[sim.monthlyProjections.length - 1] || {};

    return {
      id:                  sim._id,
      name:                sim.name,
      city:                sim.city,
      state:               sim.state,
      population:          sim.population,
      breakEvenMonth:      sim.breakEvenMonth,
      totalInvestment:     sim.totalInvestmentNeeded,
      yr1RevenuePaise:     yr1Revenue,
      yr1GMVPaise:         yr1GMV,
      finalMonthCashflow:  finalMonth.cashflow || 0,
      finalCumulativeCashflow: finalMonth.cumulativeCashflow || 0,
      assumptions:         sim.inputAssumptions,
      confidence:          sim.confidence,
      createdAt:           sim.createdAt,
      createdBy:           sim.runBy?.email,
    };
  });

  // Sort by yr1 revenue desc
  comparison.sort((a, b) => b.yr1RevenuePaise - a.yr1RevenuePaise);

  return {
    count:      comparison.length,
    comparison,
    winner:     comparison[0] || null,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  runSimulation,
  runScenarios,
  getSavedSimulations,
  saveSimulation,
  compareSimulations,
};
