'use strict';

const mongoose = require('mongoose');
const Order = require('../../order/order.model');

function toObjectId(id) {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
}

const GRID = 0.01;
function bucketCoord(val) { return Math.floor(val / GRID) * GRID; }

async function getPricingHeatmap(cityId) {
  const cityOid = toObjectId(cityId);
  const since = new Date(Date.now() - 30 * 86400 * 1000);

  const orders = await Order.find({
    status: 'completed',
    createdAt: { $gte: since },
    'pricing.totalPaise': { $exists: true },
    'pricing.surgeMultiplier': { $exists: true },
    'pickupLocation.coordinates': { $exists: true },
    ...(cityOid ? { cityId: cityOid } : {}),
  }).select('pickupLocation.coordinates pricing.totalPaise pricing.surgeMultiplier service').lean();

  const grid = {};
  for (const o of orders) {
    const [lng, lat] = o.pickupLocation.coordinates;
    const key = `${bucketCoord(lat).toFixed(2)},${bucketCoord(lng).toFixed(2)}`;
    if (!grid[key]) grid[key] = { lat: bucketCoord(lat), lng: bucketCoord(lng), totalPaise: 0, surgeSum: 0, count: 0 };
    grid[key].totalPaise += o.pricing.totalPaise || 0;
    grid[key].surgeSum += o.pricing.surgeMultiplier || 1;
    grid[key].count++;
  }

  const cells = Object.values(grid).sort((a, b) => b.totalPaise - a.totalPaise);
  const maxPaise = cells[0]?.totalPaise || 1;

  return {
    cells: cells.map(c => ({
      lat: c.lat, lng: c.lng,
      avgOrderRupees: +(c.totalPaise / (c.count * 100)).toFixed(2),
      avgSurge: +(c.surgeSum / c.count).toFixed(2),
      orderCount: c.count,
      intensity: c.totalPaise / maxPaise,
    })),
    period: '30d',
  };
}

async function getPricingHistory(service, cityId, days = 30) {
  const cityOid = toObjectId(cityId);
  const since = new Date(Date.now() - days * 86400 * 1000);

  const orders = await Order.find({
    service,
    status: 'completed',
    createdAt: { $gte: since },
    'pricing.totalPaise': { $exists: true },
    ...(cityOid ? { cityId: cityOid } : {}),
  }).select('pricing.totalPaise pricing.surgeMultiplier pricing.tierMultiplier createdAt').lean();

  // Group by day
  const dayMap = {};
  for (const o of orders) {
    const day = o.createdAt.toISOString().slice(0, 10);
    if (!dayMap[day]) dayMap[day] = { date: day, totalPaise: 0, surgeSum: 0, count: 0 };
    dayMap[day].totalPaise += o.pricing.totalPaise || 0;
    dayMap[day].surgeSum += o.pricing.surgeMultiplier || 1;
    dayMap[day].count++;
  }

  const history = Object.values(dayMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      date: d.date,
      avgPriceRupees: +(d.totalPaise / (d.count * 100)).toFixed(2),
      avgSurge: +(d.surgeSum / d.count).toFixed(2),
      orders: d.count,
    }));

  return { service, history, days };
}

async function getPricingRecommendations(cityId) {
  const cityOid = toObjectId(cityId);
  const since = new Date(Date.now() - 14 * 86400 * 1000);

  // Get avg price, surge, and order volume per service
  const agg = await Order.aggregate([
    {
      $match: {
        status: 'completed',
        createdAt: { $gte: since },
        'pricing.totalPaise': { $exists: true },
        ...(cityOid ? { cityId: cityOid } : {}),
      },
    },
    {
      $group: {
        _id: '$service',
        avgPaise: { $avg: '$pricing.totalPaise' },
        avgSurge: { $avg: '$pricing.surgeMultiplier' },
        orderCount: { $sum: 1 },
        maxSurge: { $max: '$pricing.surgeMultiplier' },
      },
    },
    { $sort: { orderCount: -1 } },
  ]);

  const recommendations = agg.map(s => {
    const avgSurge = s.avgSurge || 1;
    let action = 'maintain';
    let reason = 'Price and demand are balanced';
    let suggestedMultiplier = 1.0;

    if (avgSurge > 1.5 && s.orderCount > 20) {
      action = 'increase_base';
      reason = 'High sustained surge — absorb into base price to improve UX';
      suggestedMultiplier = 1.1;
    } else if (s.orderCount < 5 && avgSurge < 1.1) {
      action = 'discount';
      reason = 'Low demand — a promotional discount may stimulate orders';
      suggestedMultiplier = 0.9;
    } else if (avgSurge > 2.0) {
      action = 'add_workers';
      reason = 'Surge consistently above 2x — supply-side fix needed';
      suggestedMultiplier = 1.0;
    }

    return {
      service: s._id,
      avgPriceRupees: +(s.avgPaise / 100).toFixed(2),
      avgSurge: +avgSurge.toFixed(2),
      maxSurge: +(s.maxSurge || 1).toFixed(2),
      orderCount: s.orderCount,
      action,
      reason,
      suggestedMultiplier,
    };
  });

  return { recommendations, generatedAt: new Date() };
}

async function getRevenueImpactSimulation(service, newPricePaise, cityId) {
  const cityOid = toObjectId(cityId);
  const since = new Date(Date.now() - 30 * 86400 * 1000);

  const agg = await Order.aggregate([
    {
      $match: {
        service,
        status: 'completed',
        createdAt: { $gte: since },
        'pricing.totalPaise': { $exists: true },
        ...(cityOid ? { cityId: cityOid } : {}),
      },
    },
    {
      $group: {
        _id: null,
        currentAvgPaise: { $avg: '$pricing.totalPaise' },
        totalOrders: { $sum: 1 },
        totalRevenuePaise: { $sum: '$pricing.totalPaise' },
      },
    },
  ]);

  const base = agg[0] || { currentAvgPaise: 0, totalOrders: 0, totalRevenuePaise: 0 };
  const priceChangePct = base.currentAvgPaise > 0 ? (newPricePaise - base.currentAvgPaise) / base.currentAvgPaise : 0;

  // Price elasticity estimate: -0.5 (10% price increase → 5% demand drop)
  const ELASTICITY = -0.5;
  const demandChangePct = priceChangePct * ELASTICITY;
  const projectedOrders = Math.round(base.totalOrders * (1 + demandChangePct));
  const projectedRevenuePaise = projectedOrders * newPricePaise;

  return {
    service,
    currentAvgPriceRupees: +(base.currentAvgPaise / 100).toFixed(2),
    newPriceRupees: +(newPricePaise / 100).toFixed(2),
    historicalOrders: base.totalOrders,
    historicalRevenueRupees: +(base.totalRevenuePaise / 100).toFixed(2),
    priceChangePct: +(priceChangePct * 100).toFixed(1),
    projectedDemandChangePct: +(demandChangePct * 100).toFixed(1),
    projectedOrders,
    projectedRevenueRupees: +(projectedRevenuePaise / 100).toFixed(2),
    revenueImpactRupees: +((projectedRevenuePaise - base.totalRevenuePaise) / 100).toFixed(2),
    elasticityUsed: ELASTICITY,
    period: '30d',
  };
}

module.exports = { getPricingHeatmap, getPricingHistory, getPricingRecommendations, getRevenueImpactSimulation };
