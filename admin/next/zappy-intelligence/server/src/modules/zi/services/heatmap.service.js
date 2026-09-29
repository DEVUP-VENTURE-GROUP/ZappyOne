'use strict';

const mongoose = require('mongoose');
const Order = require('../../order/order.model');

// 0.01-degree grid ≈ 1 km cells — no h3-js dependency
const GRID = 0.01;

function bucketCoord(val) {
  return Math.floor(val / GRID) * GRID;
}

function dateRange(period) {
  const now = new Date();
  const map = { '1d': 1, '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
  const days = map[period] || 7;
  return new Date(now - days * 86400 * 1000);
}

function toObjectId(id) {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
}

async function getDemandHeatmap(cityId, startDate, endDate) {
  const cityOid = toObjectId(cityId);
  const match = {
    status: { $in: ['completed', 'assigned', 'in_progress', 'on_the_way'] },
    createdAt: { $gte: startDate, $lte: endDate },
    'pickupLocation.coordinates': { $exists: true },
    ...(cityOid ? { cityId: cityOid } : {}),
  };

  const orders = await Order.find(match)
    .select('pickupLocation.coordinates service')
    .lean();

  const grid = {};
  for (const o of orders) {
    const [lng, lat] = o.pickupLocation.coordinates;
    const key = `${bucketCoord(lat).toFixed(2)},${bucketCoord(lng).toFixed(2)}`;
    if (!grid[key]) grid[key] = { lat: bucketCoord(lat), lng: bucketCoord(lng), count: 0, services: {} };
    grid[key].count++;
    const svc = o.service || 'unknown';
    grid[key].services[svc] = (grid[key].services[svc] || 0) + 1;
  }

  const cells = Object.values(grid).sort((a, b) => b.count - a.count);
  const maxCount = cells[0]?.count || 1;

  return {
    cells: cells.map(c => ({ ...c, intensity: c.count / maxCount })),
    totalOrders: orders.length,
    period: { start: startDate, end: endDate },
  };
}

async function getRevenueHeatmap(cityId, period = '7d') {
  const cityOid = toObjectId(cityId);
  const since = dateRange(period);
  const match = {
    status: 'completed',
    createdAt: { $gte: since },
    'pricing.totalPaise': { $exists: true },
    'pickupLocation.coordinates': { $exists: true },
    ...(cityOid ? { cityId: cityOid } : {}),
  };

  const orders = await Order.find(match)
    .select('pickupLocation.coordinates pricing.totalPaise')
    .lean();

  const grid = {};
  for (const o of orders) {
    const [lng, lat] = o.pickupLocation.coordinates;
    const key = `${bucketCoord(lat).toFixed(2)},${bucketCoord(lng).toFixed(2)}`;
    if (!grid[key]) grid[key] = { lat: bucketCoord(lat), lng: bucketCoord(lng), revenuePaise: 0, orders: 0 };
    grid[key].revenuePaise += o.pricing?.totalPaise || 0;
    grid[key].orders++;
  }

  const cells = Object.values(grid).sort((a, b) => b.revenuePaise - a.revenuePaise);
  const maxRev = cells[0]?.revenuePaise || 1;

  return {
    cells: cells.map(c => ({
      ...c,
      revenueRupees: +(c.revenuePaise / 100).toFixed(2),
      avgOrderRupees: +(c.revenuePaise / (c.orders * 100)).toFixed(2),
      intensity: c.revenuePaise / maxRev,
    })),
    totalRevenueRupees: +(orders.reduce((s, o) => s + (o.pricing?.totalPaise || 0), 0) / 100).toFixed(2),
    period,
  };
}

async function getWorkerHeatmap(cityId) {
  const Worker = require('../../worker/worker.model');
  const cityOid = toObjectId(cityId);

  const workers = await Worker.find({
    isActive: true,
    isAvailable: true,
    ...(cityOid ? { cityId: cityOid } : {}),
    'location.coordinates': { $exists: true },
  }).select('location.coordinates service').lean();

  const grid = {};
  for (const w of workers) {
    if (!w.location?.coordinates) continue;
    const [lng, lat] = w.location.coordinates;
    const key = `${bucketCoord(lat).toFixed(2)},${bucketCoord(lng).toFixed(2)}`;
    if (!grid[key]) grid[key] = { lat: bucketCoord(lat), lng: bucketCoord(lng), workers: 0, services: {} };
    grid[key].workers++;
    const svc = w.service || 'unknown';
    grid[key].services[svc] = (grid[key].services[svc] || 0) + 1;
  }

  const cells = Object.values(grid).sort((a, b) => b.workers - a.workers);
  const maxWorkers = cells[0]?.workers || 1;

  return {
    cells: cells.map(c => ({ ...c, intensity: c.workers / maxWorkers })),
    totalOnlineWorkers: workers.length,
  };
}

async function getSupplyDemandGap(cityId) {
  const [demandData, workerData] = await Promise.all([
    getDemandHeatmap(cityId, new Date(Date.now() - 7 * 86400 * 1000), new Date()),
    getWorkerHeatmap(cityId),
  ]);

  const demandMap = {};
  for (const c of demandData.cells) {
    demandMap[`${c.lat.toFixed(2)},${c.lng.toFixed(2)}`] = c;
  }

  const workerMap = {};
  for (const c of workerData.cells) {
    workerMap[`${c.lat.toFixed(2)},${c.lng.toFixed(2)}`] = c;
  }

  const allKeys = new Set([...Object.keys(demandMap), ...Object.keys(workerMap)]);
  const gaps = [];

  for (const key of allKeys) {
    const demand = demandMap[key]?.count || 0;
    const supply = workerMap[key]?.workers || 0;
    const [lat, lng] = key.split(',').map(Number);
    const ratio = supply === 0 ? (demand > 0 ? 99 : 0) : demand / supply;
    gaps.push({ lat, lng, demand, supply, ratio: +ratio.toFixed(2), gapLevel: ratio > 5 ? 'critical' : ratio > 2 ? 'high' : ratio > 1 ? 'medium' : 'healthy' });
  }

  gaps.sort((a, b) => b.ratio - a.ratio);
  return { cells: gaps, summary: { critical: gaps.filter(g => g.gapLevel === 'critical').length, high: gaps.filter(g => g.gapLevel === 'high').length } };
}

async function getComplaintHeatmap(cityId, days = 30) {
  const cityOid = toObjectId(cityId);
  const since = new Date(Date.now() - days * 86400 * 1000);

  const orders = await Order.find({
    status: 'completed',
    createdAt: { $gte: since },
    rating: { $lte: 2 },
    'pickupLocation.coordinates': { $exists: true },
    ...(cityOid ? { cityId: cityOid } : {}),
  }).select('pickupLocation.coordinates rating service').lean();

  const grid = {};
  for (const o of orders) {
    const [lng, lat] = o.pickupLocation.coordinates;
    const key = `${bucketCoord(lat).toFixed(2)},${bucketCoord(lng).toFixed(2)}`;
    if (!grid[key]) grid[key] = { lat: bucketCoord(lat), lng: bucketCoord(lng), complaints: 0, ratingSum: 0 };
    grid[key].complaints++;
    grid[key].ratingSum += o.rating || 0;
  }

  const cells = Object.values(grid).sort((a, b) => b.complaints - a.complaints);
  const maxComplaints = cells[0]?.complaints || 1;

  return {
    cells: cells.map(c => ({
      ...c,
      avgRating: +(c.ratingSum / c.complaints).toFixed(2),
      intensity: c.complaints / maxComplaints,
    })),
    totalComplaints: orders.length,
    days,
  };
}

module.exports = { getDemandHeatmap, getRevenueHeatmap, getWorkerHeatmap, getSupplyDemandGap, getComplaintHeatmap };
