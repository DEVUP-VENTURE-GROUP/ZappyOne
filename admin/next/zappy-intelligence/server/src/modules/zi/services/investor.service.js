'use strict';

/**
 * ZI Investor Service
 * Boardroom-grade metrics, unit economics, cohort analysis, and report generation.
 */

const Order = require('../../order/order.model');
const User  = require('../../user/user.model');
const Worker = require('../../worker/worker.model');
const logger = require('../../../utils/logger');

// ── Date range helpers ────────────────────────────────────────────────────────

function _getDateRange(period) {
  const now = new Date();
  let start;
  let label = period;

  switch (period) {
    case 'mtd': {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      label = `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`;
      break;
    }
    case 'qtd': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), qMonth, 1);
      label = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
      break;
    }
    case 'ytd': {
      start = new Date(now.getFullYear(), 0, 1);
      label = `YTD ${now.getFullYear()}`;
      break;
    }
    case 'last30d': {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      label = 'Last 30 Days';
      break;
    }
    case 'last90d': {
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      label = 'Last 90 Days';
      break;
    }
    default: {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      label = 'Last 30 Days';
    }
  }

  return { start, end: now, label };
}

// ── getSummaryMetrics ─────────────────────────────────────────────────────────

async function getSummaryMetrics(period = 'mtd') {
  const { start, end, label } = _getDateRange(period);

  const [ordersAgg, usersInPeriod, allUsersInPeriod] = await Promise.all([
    // Order aggregation for the period
    Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          totalOrders:       { $sum: 1 },
          completedOrders:   { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          gmvPaise:          { $sum: { $ifNull: ['$pricing.totalPaise', 0] } },
          activeUserIds:     { $addToSet: '$userId' },
          cities:            { $addToSet: '$pickupLocation.address' },
          services:          { $addToSet: '$service' },
        },
      },
    ]),
    // New users created in the period
    User.countDocuments({ createdAt: { $gte: start, $lte: end } }),
    // All user IDs who placed orders in period (for retention calc)
    Order.distinct('userId', { createdAt: { $gte: start, $lte: end } }),
  ]);

  const agg = ordersAgg[0] || {
    totalOrders: 0,
    completedOrders: 0,
    gmvPaise: 0,
    activeUserIds: [],
    cities: [],
    services: [],
  };

  const gmvPaise        = agg.gmvPaise;
  const revenuePaise    = Math.round(gmvPaise * 0.18);
  const orders          = agg.totalOrders;
  const completedOrders = agg.completedOrders;
  const activeUsers     = agg.activeUserIds.length;
  const avgOrderValuePaise = orders > 0 ? Math.round(gmvPaise / orders) : 0;

  // Returning users: placed ≥2 orders in the period
  let returningUsers = 0;
  if (allUsersInPeriod.length > 0) {
    const returningAgg = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          userId: { $in: allUsersInPeriod },
        },
      },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $match: { count: { $gte: 2 } } },
      { $count: 'total' },
    ]);
    returningUsers = returningAgg.length > 0 ? returningAgg[0].total : 0;
  }

  const retention = activeUsers > 0 ? (returningUsers / activeUsers) * 100 : 0;
  const netRevenueAfterWorkerPayouts = Math.round(revenuePaise * 0.22);

  return {
    period: label,
    gmvPaise,
    revenuePaise,
    orders,
    completedOrders,
    completionRate: orders > 0 ? _round((completedOrders / orders) * 100) : 0,
    activeUsers,
    newUsers:       usersInPeriod,
    returningUsers,
    retention:      _round(retention),
    avgOrderValuePaise,
    cities:         agg.cities.filter(Boolean).length,
    categories:     agg.services.filter(Boolean).length,
    grossMargin:    65,
    netRevenueAfterWorkerPayouts,
    generatedAt:    new Date().toISOString(),
  };
}

// ── getUnitEconomics ──────────────────────────────────────────────────────────

async function getUnitEconomics() {
  const CAC_PAISE = 12000; // ₹120 per user acquisition
  const AVG_LIFESPAN_MONTHS = 18;

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [orderAgg, distinctUsers] = await Promise.all([
    Order.aggregate([
      { $match: { createdAt: { $gte: ninetyDaysAgo } } },
      {
        $group: {
          _id: null,
          totalGMV:      { $sum: { $ifNull: ['$pricing.totalPaise', 0] } },
          totalOrders:   { $sum: 1 },
          activeUserIds: { $addToSet: '$userId' },
        },
      },
    ]),
    Order.distinct('userId', { createdAt: { $gte: ninetyDaysAgo } }),
  ]);

  const agg = orderAgg[0] || { totalGMV: 0, totalOrders: 0, activeUserIds: [] };
  const activeUsers = distinctUsers.length || 1;
  const totalOrders = agg.totalOrders || 0;
  const totalGMV    = agg.totalGMV    || 0;

  const avgOrderValuePaise       = totalOrders > 0 ? totalGMV / totalOrders : 0;
  const ordersPerUserPer3Months  = activeUsers > 0 ? totalOrders / activeUsers : 0;
  const ordersPerUserPerMonth    = ordersPerUserPer3Months / 3;

  // LTV = avgOrderValue * ordersPerMonth * avgLifespan * grossMargin
  const ltv = avgOrderValuePaise * ordersPerUserPerMonth * AVG_LIFESPAN_MONTHS * 0.65;

  const ltvCacRatio    = CAC_PAISE > 0 ? _round(ltv / CAC_PAISE, 2) : 0;
  // payback months: time for LTV per month to recover CAC
  const ltvPerMonth    = ltv / AVG_LIFESPAN_MONTHS;
  const paybackMonths  = ltvPerMonth > 0 ? _round(CAC_PAISE / ltvPerMonth, 1) : null;

  return {
    cacPaise:              CAC_PAISE,
    cacRs:                 CAC_PAISE / 100,
    avgOrderValuePaise:    Math.round(avgOrderValuePaise),
    avgOrderValueRs:       _round(avgOrderValuePaise / 100),
    ordersPerUserPerMonth: _round(ordersPerUserPerMonth, 2),
    avgLifespanMonths:     AVG_LIFESPAN_MONTHS,
    grossMarginPct:        65,
    ltvPaise:              Math.round(ltv),
    ltvRs:                 _round(ltv / 100),
    ltvCacRatio,
    paybackMonths,
    basedOnDays:           90,
    basedOnUsers:          activeUsers,
    basedOnOrders:         totalOrders,
    generatedAt:           new Date().toISOString(),
  };
}

// ── getCohortAnalysis ─────────────────────────────────────────────────────────

async function getCohortAnalysis(months = 12) {
  const monthsN  = Math.min(24, Math.max(1, Number(months)));
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - monthsN);

  // Users registered in each cohort month
  const cohortUsers = await User.aggregate([
    { $match: { createdAt: { $gte: cutoffDate } } },
    {
      $group: {
        _id: {
          year:  { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        userIds: { $push: '$_id' },
        count:   { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  const cohorts = [];

  for (const cohort of cohortUsers) {
    const { year, month } = cohort._id;
    const cohortLabel = `${year}-${String(month).padStart(2, '0')}`;
    const cohortStart = new Date(year, month - 1, 1);
    const totalUsers  = cohort.count;
    const userIds     = cohort.userIds;

    // For each subsequent month (0..N), check how many placed an order
    const retentionByMonth = [];

    for (let mOffset = 0; mOffset < monthsN; mOffset++) {
      const monthStart = new Date(cohortStart);
      monthStart.setMonth(monthStart.getMonth() + mOffset);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      if (monthStart > new Date()) {
        // Future month — no data
        break;
      }

      const activeCount = await Order.distinct('userId', {
        userId:    { $in: userIds },
        createdAt: { $gte: monthStart, $lt: monthEnd },
      }).then((ids) => ids.length);

      const retentionPct = totalUsers > 0 ? _round((activeCount / totalUsers) * 100) : 0;
      retentionByMonth.push(retentionPct);
    }

    cohorts.push({
      cohortMonth:      cohortLabel,
      totalUsers,
      retentionByMonth,
    });
  }

  return cohorts;
}

// ── getGrowthMetrics ──────────────────────────────────────────────────────────

async function getGrowthMetrics() {
  const now = new Date();

  const thisWeekStart  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  const lastWeekStart  = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  async function periodMetrics(start, end) {
    const [orderAgg, newUsers, newWorkers] = await Promise.all([
      Order.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:       null,
            orders:    { $sum: 1 },
            gmvPaise:  { $sum: { $ifNull: ['$pricing.totalPaise', 0] } },
          },
        },
      ]),
      User.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      Worker.countDocuments({ createdAt: { $gte: start, $lte: end } }),
    ]);

    const agg = orderAgg[0] || { orders: 0, gmvPaise: 0 };
    return {
      orders:    agg.orders,
      revenue:   Math.round(agg.gmvPaise * 0.18),
      users:     newUsers,
      workers:   newWorkers,
    };
  }

  const [thisWeek, lastWeek, thisMonth, lastMonth] = await Promise.all([
    periodMetrics(thisWeekStart, now),
    periodMetrics(lastWeekStart, thisWeekStart),
    periodMetrics(thisMonthStart, now),
    periodMetrics(lastMonthStart, lastMonthEnd),
  ]);

  function growth(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return _round(((current - previous) / previous) * 100);
  }

  return {
    orders:  { wow: growth(thisWeek.orders,  lastWeek.orders),  mom: growth(thisMonth.orders,  lastMonth.orders)  },
    revenue: { wow: growth(thisWeek.revenue, lastWeek.revenue), mom: growth(thisMonth.revenue, lastMonth.revenue) },
    users:   { wow: growth(thisWeek.users,   lastWeek.users),   mom: growth(thisMonth.users,   lastMonth.users)   },
    workers: { wow: growth(thisWeek.workers, lastWeek.workers), mom: growth(thisMonth.workers, lastMonth.workers) },
    thisWeek,
    lastWeek,
    thisMonth,
    lastMonth,
    generatedAt: new Date().toISOString(),
  };
}

// ── generateInvestorReport ────────────────────────────────────────────────────

async function generateInvestorReport(period = 'mtd') {
  const [summary, unitEconomics, growth, cohorts] = await Promise.all([
    getSummaryMetrics(period),
    getUnitEconomics(),
    getGrowthMetrics(),
    getCohortAnalysis(6),
  ]);

  // Template-based executive summary
  const gmvCr = _round(summary.gmvPaise / 10000000, 2); // paise → crore rupees
  const revLakhs = _round(summary.revenuePaise / 100000, 1); // paise → lakh rupees
  const userGrowth = growth.users.mom;
  const orderGrowth = growth.orders.mom;

  const executiveSummary =
    `Zappy processed ${summary.orders.toLocaleString('en-IN')} orders in ${summary.period}, ` +
    `generating ₹${gmvCr}Cr in GMV and ₹${revLakhs}L in platform revenue. ` +
    `Active users: ${summary.activeUsers.toLocaleString('en-IN')} ` +
    `(${userGrowth >= 0 ? '+' : ''}${userGrowth}% MoM). ` +
    `Orders grew ${orderGrowth >= 0 ? '+' : ''}${orderGrowth}% MoM. ` +
    `Completion rate: ${summary.completionRate}%. ` +
    `LTV/CAC ratio: ${unitEconomics.ltvCacRatio}x. ` +
    `Payback period: ${unitEconomics.paybackMonths} months.`;

  return {
    period,
    executiveSummary,
    summary,
    unitEconomics,
    growth,
    cohortAnalysis: cohorts,
    generatedAt: new Date().toISOString(),
  };
}

// ── exportReport ──────────────────────────────────────────────────────────────

async function exportReport(format = 'json', period = 'mtd') {
  const reportData = await generateInvestorReport(period);

  return {
    format,
    period,
    reportData,
    metadata: {
      version:      '1.0',
      generatedAt:  new Date().toISOString(),
      generatedBy:  'Zappy Intelligence Platform',
      instructions: format === 'pdf'
        ? 'Pass reportData to the frontend PDF renderer (e.g. react-pdf or jsPDF).'
        : 'JSON export ready for downstream consumption.',
    },
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function _round(val, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round((val || 0) * factor) / factor;
}

module.exports = {
  getSummaryMetrics,
  getUnitEconomics,
  getCohortAnalysis,
  getGrowthMetrics,
  generateInvestorReport,
  exportReport,
};
