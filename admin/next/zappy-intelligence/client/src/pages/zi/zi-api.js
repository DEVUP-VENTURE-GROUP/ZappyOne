import { ZI_SLUG } from '../../config/zi';

const ZI_TOKEN_KEY = 'zi_token';
const BASE = `/api/zi/${ZI_SLUG}`;

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-zi-token': localStorage.getItem(ZI_TOKEN_KEY) || '',
  };
}

async function ziGet(path, params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null));
  const qs = Object.keys(clean).length
    ? '?' + new URLSearchParams(clean).toString()
    : '';
  const res = await fetch(`${BASE}${path}${qs}`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

async function ziPost(path, body = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

async function ziPatch(path, body = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export const ziAuth = {
  login: (email, password) => ziPost('/auth/login', { email, password }),
  me: () => ziGet('/auth/me'),
  register: (data) => ziPost('/auth/register', data),
  logout: () => localStorage.removeItem(ZI_TOKEN_KEY),
  listUsers: () => ziGet('/auth/users'),
  deactivate: (id) => ziPost(`/auth/users/${id}/deactivate`),
};

export const ziCommand = {
  getLiveMetrics: () => ziGet('/command/live'),
  getCityHealth: () => ziGet('/command/cities'),
  getRevenueBreakdown: (period = 'today') => ziGet('/command/revenue', { period }),
  getAlerts: () => ziGet('/command/alerts'),
  getTopWorkers: (limit = 10) => ziGet('/command/top-workers', { limit }),
  getTopServices: (limit = 10) => ziGet('/command/top-services', { limit }),
  getServiceHealth: () => ziGet('/command/service-health'),
};

export const ziExpansion = {
  getRecommendations: (limit = 10) => ziGet('/expansion/recommendations', { limit }),
  analyzeCity: (city, state) => ziPost('/expansion/analyze', { city, state }),
  getCategoryGaps: (cityId) => ziGet('/expansion/category-gaps', { cityId }),
  list: (params = {}) => ziGet('/expansion/list', params),
  save: (data) => ziPost('/expansion/save', data),
  approve: (id, notes) => ziPost(`/expansion/${id}/approve`, { notes }),
  reject: (id, notes) => ziPost(`/expansion/${id}/reject`, { notes }),
};

export const ziAI = {
  ask: (question, agent, context = {}) => ziPost('/ai/ask', { question, agent, context }),
  getDailyInsights: () => ziGet('/ai/insights/daily'),
  generateReport: (type, scope = {}) => ziPost('/ai/report', { type, scope }),
  askStrategy: (question, context = {}) => ziPost('/ai/strategy', { question, context }),
};

export const ziForecasting = {
  getDemand: (cityId, category, horizon = 30) => ziGet('/forecast/demand', { cityId, category, horizon }),
  getRevenue: (cityId, horizon = 90) => ziGet('/forecast/revenue', { cityId, horizon }),
  getWorkerDemand: (cityId, date) => ziGet('/forecast/worker-demand', { cityId, date }),
  getAccuracy: (cityId) => ziGet('/forecast/accuracy', { cityId }),
  triggerRetrain: (cityId) => ziPost('/forecast/retrain', { cityId }),
};

export const ziFraud = {
  getQueue: (params = {}) => ziGet('/fraud/queue', params),
  reviewEvent: (id, action, notes) => ziPost(`/fraud/review/${id}`, { action, notes }),
  getStats: () => ziGet('/fraud/stats'),
  manualAssess: (entityType, entityId) => ziPost('/fraud/assess', { entityType, entityId }),
  blockEntity: (entityType, entityId, reason) => ziPost('/fraud/block', { entityType, entityId, reason }),
};

export const ziPricing = {
  getHeatmap: (cityId) => ziGet('/pricing/heatmap', { cityId }),
  getHistory: (service, cityId, days = 30) => ziGet('/pricing/history', { service, cityId, days }),
  getRecommendations: (cityId) => ziGet('/pricing/recommendations', { cityId }),
  simulate: (service, newPricePaise, cityId) => ziPost('/pricing/simulate', { service, newPricePaise, cityId }),
};

export const ziPartner = {
  getAll: (params = {}) => ziGet('/partner/intel', params),
  getDetail: (partnerId) => ziGet(`/partner/intel/${partnerId}`),
  getInsights: (partnerId) => ziGet(`/partner/intel/${partnerId}/insights`),
  recompute: (partnerId) => ziPost(`/partner/intel/${partnerId}/recompute`),
};

export const ziWorker = {
  getAll: (params = {}) => ziGet('/worker/intel', params),
  getDetail: (workerId) => ziGet(`/worker/intel/${workerId}`),
  getInsights: (workerId) => ziGet(`/worker/intel/${workerId}/insights`),
  getLeaderboard: (cityId, metric = 'earnings', limit = 20) => ziGet('/worker/leaderboard', { cityId, metric, limit }),
  recompute: (workerId) => ziPost(`/worker/intel/${workerId}/recompute`),
};

export const ziInvestor = {
  getSummary: (period = 'mtd') => ziGet('/investor/summary', { period }),
  getUnitEconomics: () => ziGet('/investor/unit-economics'),
  getCohorts: (months = 12) => ziGet('/investor/cohorts', { months }),
  getGrowth: () => ziGet('/investor/growth'),
  generateReport: (period) => ziPost('/investor/report', { period }),
  exportReport: (format, period) => ziPost('/investor/export', { format, period }),
};

export const ziSimulator = {
  run: (config) => ziPost('/simulator/run', config),
  runScenarios: (config) => ziPost('/simulator/scenarios', config),
  list: () => ziGet('/simulator/list'),
  save: (simulationResult, name) => ziPost('/simulator/save', { simulationResult, name }),
  compare: (ids) => ziPost('/simulator/compare', { ids }),
};

export const ziAds = {
  list: (params = {}) => ziGet('/ads/campaigns', params),
  create: (data) => ziPost('/ads/campaigns', data),
  get: (id) => ziGet(`/ads/campaigns/${id}`),
  update: (id, data) => ziPatch(`/ads/campaigns/${id}`, data),
  activate: (id) => ziPost(`/ads/campaigns/${id}/activate`),
  pause: (id) => ziPost(`/ads/campaigns/${id}/pause`),
  getAnalytics: (id) => ziGet(`/ads/campaigns/${id}/analytics`),
  getRevenue: (period = 'mtd') => ziGet('/ads/revenue', { period }),
};

export const ziHeatmap = {
  getDemand: (cityId, startDate, endDate) => ziGet('/heatmap/demand', { cityId, startDate, endDate }),
  getRevenue: (cityId, period = '7d') => ziGet('/heatmap/revenue', { cityId, period }),
  getWorkers: (cityId) => ziGet('/heatmap/workers', { cityId }),
  getGap: (cityId) => ziGet('/heatmap/gap', { cityId }),
  getComplaints: (cityId, days = 30) => ziGet('/heatmap/complaints', { cityId, days }),
};
