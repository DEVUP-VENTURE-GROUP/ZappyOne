'use strict';

/**
 * ZI AI Executive Suite Service.
 * Provides COO, CFO, CRO, and Strategy agents backed by OpenRouter,
 * plus daily insight generation and structured report generation.
 */

const { routeToModel } = require('./openrouter.service');
const { redis }        = require('../../../config/redis');
const logger           = require('../../../utils/logger');

// Lazy-load models to avoid circular deps at startup
function getOrder()  { return require('../../order/order.model'); }
function getUser()   { return require('../../user/user.model'); }
function getWorker() { return require('../../worker/worker.model'); }

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch a snapshot of current operational metrics from MongoDB.
 * Returns a compact object suitable for injection into AI prompts.
 */
async function fetchOperationalSnapshot() {
  const Order  = getOrder();
  const User   = getUser();
  const Worker = getWorker();

  const now        = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDays  = new Date(Date.now() - 7 * 86400 * 1000);
  const thirtyDays = new Date(Date.now() - 30 * 86400 * 1000);

  const [
    ordersToday,
    ordersLast7d,
    completedToday,
    cancelledToday,
    revenueAgg,
    revenueMonth,
    onlineWorkers,
    totalWorkers,
    totalUsers,
    avgRatingAgg,
    cancellationRateAgg,
  ] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: startOfDay } }),
    Order.countDocuments({ createdAt: { $gte: sevenDays } }),
    Order.countDocuments({ status: 'completed', completedAt: { $gte: startOfDay } }),
    Order.countDocuments({ status: 'cancelled', cancelledAt: { $gte: startOfDay } }),
    Order.aggregate([
      { $match: { status: 'completed', completedAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.totalPaise', { $multiply: ['$pricing.total', 100] }] } } } },
    ]),
    Order.aggregate([
      { $match: { status: 'completed', completedAt: { $gte: thirtyDays } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.totalPaise', { $multiply: ['$pricing.total', 100] }] } } } },
    ]),
    Worker.countDocuments({ isOnline: true }),
    Worker.countDocuments(),
    User.countDocuments(),
    Order.aggregate([
      { $match: { status: 'completed', completedAt: { $gte: sevenDays }, userRating: { $exists: true } } },
      { $group: { _id: null, avg: { $avg: '$userRating' } } },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: sevenDays } } },
      { $group: { _id: null, total: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } },
    ]),
  ]);

  const gmvTodayPaise     = revenueAgg[0]?.total     || 0;
  const gmvMonthPaise     = revenueMonth[0]?.total   || 0;
  const avgRating         = avgRatingAgg[0]?.avg     || 0;
  const cancellationData  = cancellationRateAgg[0]   || { total: 1, cancelled: 0 };
  const cancellationRate  = cancellationData.total > 0
    ? ((cancellationData.cancelled / cancellationData.total) * 100).toFixed(1)
    : 0;

  return {
    date:             now.toISOString().split('T')[0],
    ordersToday,
    ordersLast7d,
    completedToday,
    cancelledToday,
    gmvTodayRupees:   Math.round(gmvTodayPaise / 100),
    gmvMonthRupees:   Math.round(gmvMonthPaise / 100),
    onlineWorkers,
    totalWorkers,
    totalUsers,
    avgRating:        Math.round(avgRating * 100) / 100,
    cancellationRate: parseFloat(cancellationRate),
    workerUtilisation: totalWorkers > 0 ? Math.round((onlineWorkers / totalWorkers) * 100) : 0,
    completionRateToday: (completedToday + cancelledToday) > 0
      ? Math.round((completedToday / (completedToday + cancelledToday)) * 100)
      : 0,
  };
}

/**
 * Classify user question intent for COO agent routing.
 */
function classifyIntent(question) {
  const q = question.toLowerCase();
  if (q.includes('cancel')) return 'cancellation_spike';
  if (q.includes('revenue') || q.includes('money') || q.includes('earning')) return 'revenue_drop';
  if (q.includes('city') || q.includes('hyderabad') || q.includes('mumbai') || q.includes('bangalore')) return 'city_performance';
  if (q.includes('worker') || q.includes('partner') || q.includes('supply')) return 'worker_issues';
  if (q.includes('grow') || q.includes('expand') || q.includes('opportunit')) return 'growth_opportunity';
  return 'general_ops';
}

/**
 * Parse JSON from AI response safely; fall back to raw string in wrapper.
 */
function safeParseJson(text) {
  try {
    // Extract JSON from markdown code fence if present
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) return JSON.parse(match[1]);
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// ─── COO Agent ────────────────────────────────────────────────────────────────

async function askCOO(question, context = {}) {
  const snapshot = await fetchOperationalSnapshot();
  const intent   = classifyIntent(question);

  const systemPrompt = `You are the Chief Operating Officer AI for Zappy, India's fastest on-demand home services platform.
You have deep expertise in operations management, supply-demand balancing, SLA management, and field operations.
You make data-driven decisions based on real-time metrics. Be concise, direct, and action-oriented.
Always quantify recommendations with expected impact. Format your response as JSON with keys:
answer (string), confidence (0-1), sources (array of strings), followUpQuestions (array of 3 strings).`;

  const userMessage = `Current operational metrics:
${JSON.stringify(snapshot, null, 2)}

${context.additionalData ? `Additional context: ${JSON.stringify(context.additionalData)}` : ''}

Question (intent: ${intent}): ${question}

Respond with actionable insights based on the data above.`;

  const { content, model, usage } = await routeToModel('ops_question', [
    { role: 'user', content: userMessage },
  ], { systemPrompt });

  let parsed = safeParseJson(content);
  if (parsed.raw) {
    parsed = {
      answer:             parsed.raw,
      confidence:         0.75,
      sources:            ['real-time MongoDB metrics'],
      followUpQuestions:  [],
    };
  }

  return {
    intent,
    answer:            parsed.answer || content,
    confidence:        parsed.confidence || 0.75,
    sources:           parsed.sources || ['operational metrics'],
    followUpQuestions: parsed.followUpQuestions || [],
    model,
    tokensUsed:        usage.totalTokens,
    snapshotDate:      snapshot.date,
  };
}

// ─── CFO Agent ────────────────────────────────────────────────────────────────

async function askCFO(question, context = {}) {
  const Order  = getOrder();
  const User   = getUser();

  const thirtyDays = new Date(Date.now() - 30 * 86400 * 1000);
  const ninetyDays = new Date(Date.now() - 90 * 86400 * 1000);

  const [revenueAgg, userStats, cohortData] = await Promise.all([
    Order.aggregate([
      { $match: { status: 'completed', completedAt: { $gte: thirtyDays } } },
      { $group: {
          _id: null,
          totalPaise:    { $sum: { $ifNull: ['$pricing.totalPaise', { $multiply: ['$pricing.total', 100] }] } },
          platformPaise: { $sum: { $ifNull: ['$earnings.platformPaise', 0] } },
          count:         { $sum: 1 },
          avgFarePaise:  { $avg: { $ifNull: ['$pricing.totalPaise', { $multiply: ['$pricing.total', 100] }] } },
        },
      },
    ]),
    User.aggregate([
      { $match: { createdAt: { $gte: thirtyDays } } },
      { $count: 'newUsers' },
    ]),
    Order.aggregate([
      { $match: { status: 'completed', completedAt: { $gte: ninetyDays } } },
      { $group: { _id: '$userId', orderCount: { $sum: 1 }, totalSpentPaise: { $sum: { $ifNull: ['$pricing.totalPaise', { $multiply: ['$pricing.total', 100] }] } } } },
      { $group: {
          _id: null,
          avgOrdersPerUser: { $avg: '$orderCount' },
          avgLtvPaise:      { $avg: '$totalSpentPaise' },
          totalUsers:       { $sum: 1 },
        },
      },
    ]),
  ]);

  const rev           = revenueAgg[0] || { totalPaise: 0, platformPaise: 0, count: 0, avgFarePaise: 0 };
  const newUsers      = userStats[0]?.newUsers || 0;
  const cohort        = cohortData[0] || { avgOrdersPerUser: 1, avgLtvPaise: 0, totalUsers: 0 };

  // Unit economics calculations
  const avgFareRupees       = Math.round(rev.avgFarePaise / 100);
  const grossMargin         = rev.totalPaise > 0 ? rev.platformPaise / rev.totalPaise : 0.22;
  // Approximate CAC: assume ₹150 marketing spend per new user
  const estimatedMarketingSpend = newUsers * 15000; // ₹150 in paise
  const cac                 = newUsers > 0 ? Math.round(estimatedMarketingSpend / newUsers / 100) : 150;
  const avgLifespanMonths   = 12; // industry benchmark for home services
  const ltv                 = Math.round((cohort.avgLtvPaise / 100) * (avgLifespanMonths / 3)); // extrapolate 90d to 1yr
  const ltvCacRatio         = cac > 0 ? (ltv / cac).toFixed(2) : null;
  const mrr                 = Math.round(rev.platformPaise / 100 / 1); // 30d platform revenue
  const arr                 = mrr * 12;

  const financialContext = {
    period: '30 days',
    gmvRupees:        Math.round(rev.totalPaise / 100),
    platformRevRupees: Math.round(rev.platformPaise / 100),
    ordersCompleted:  rev.count,
    avgFareRupees,
    grossMarginPct:   Math.round(grossMargin * 100),
    cac,
    ltv,
    ltvCacRatio,
    mrr,
    arr,
    newUsers,
    avgOrdersPerUser: Math.round(cohort.avgOrdersPerUser * 10) / 10,
  };

  const systemPrompt = `You are the Chief Financial Officer AI for Zappy, India's on-demand home services platform.
You specialise in unit economics, revenue analysis, cost structure, and financial forecasting.
You think in terms of LTV:CAC ratios, gross margins, MRR/ARR, payback periods, and burn rates.
Format your response as JSON with: answer (string with specific numbers), insights (array),
keyMetrics (object), risks (array), recommendations (array).`;

  const { content, model, usage } = await routeToModel('financial_report', [
    { role: 'user', content: `Financial metrics:\n${JSON.stringify(financialContext, null, 2)}\n\nQuestion: ${question}` },
  ], { systemPrompt });

  let parsed = safeParseJson(content);
  if (parsed.raw) {
    parsed = { answer: parsed.raw, insights: [], keyMetrics: financialContext, risks: [], recommendations: [] };
  }

  return {
    answer:          parsed.answer || content,
    insights:        parsed.insights || [],
    keyMetrics:      { ...financialContext, ...parsed.keyMetrics },
    risks:           parsed.risks || [],
    recommendations: parsed.recommendations || [],
    model,
    tokensUsed:      usage.totalTokens,
  };
}

// ─── CRO Agent ────────────────────────────────────────────────────────────────

async function askCRO(question, context = {}) {
  const Order = getOrder();
  const User  = getUser();

  const thirtyDays = new Date(Date.now() - 30 * 86400 * 1000);
  const sixtyDays  = new Date(Date.now() - 60 * 86400 * 1000);

  const [retentionData, churnSignals, servicePopularity] = await Promise.all([
    // Users who ordered in 30-60d window but NOT in last 30d = potential churned
    Order.aggregate([
      { $match: { status: 'completed', completedAt: { $gte: sixtyDays } } },
      { $group: { _id: '$userId', lastOrder: { $max: '$completedAt' }, orderCount: { $sum: 1 } } },
      { $group: {
          _id: null,
          activeRecent:  { $sum: { $cond: [{ $gte: ['$lastOrder', thirtyDays] }, 1, 0] } },
          churnRisk:     { $sum: { $cond: [{ $lt:  ['$lastOrder', thirtyDays] }, 1, 0] } },
          totalUsers:    { $sum: 1 },
          avgOrderCount: { $avg: '$orderCount' },
        },
      },
    ]),
    // Users with only 1 order ever (highest churn risk)
    Order.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $group: { _id: '$count', users: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $limit: 5 },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: thirtyDays } } },
      { $group: { _id: '$service', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const retention = retentionData[0] || { activeRecent: 0, churnRisk: 0, totalUsers: 0, avgOrderCount: 1 };
  const retentionRate = retention.totalUsers > 0
    ? Math.round((retention.activeRecent / retention.totalUsers) * 100)
    : 0;

  const growthContext = {
    period: '30 days',
    activeUsers:      retention.activeRecent,
    churnRiskUsers:   retention.churnRisk,
    retentionRate:    `${retentionRate}%`,
    avgOrdersPerUser: Math.round(retention.avgOrderCount * 10) / 10,
    ordersByLifetime: churnSignals,
    topServices:      servicePopularity.map(s => ({ service: s._id, orders: s.count })),
    campaigns:        context.campaigns || [],
  };

  const systemPrompt = `You are the Chief Revenue Officer AI for Zappy, India's on-demand home services platform.
You specialise in growth strategy, customer retention, cohort analysis, and campaign ROI.
Think in terms of activation rates, retention curves, NPS improvements, and payback periods.
Format response as JSON: answer (string), cohortInsights (array), churnRisks (array),
recommendedCampaigns (array with {name, targeting, expectedROI, budget}), expansionOpportunities (array).`;

  const { content, model, usage } = await routeToModel('ops_question', [
    { role: 'user', content: `Growth & retention metrics:\n${JSON.stringify(growthContext, null, 2)}\n\nQuestion: ${question}` },
  ], { systemPrompt });

  let parsed = safeParseJson(content);
  if (parsed.raw) {
    parsed = { answer: parsed.raw, cohortInsights: [], churnRisks: [], recommendedCampaigns: [], expansionOpportunities: [] };
  }

  return {
    answer:                  parsed.answer || content,
    cohortInsights:          parsed.cohortInsights || [],
    churnRisks:              parsed.churnRisks || [],
    recommendedCampaigns:    parsed.recommendedCampaigns || [],
    expansionOpportunities:  parsed.expansionOpportunities || [],
    model,
    tokensUsed:              usage.totalTokens,
  };
}

// ─── Strategy Agent ───────────────────────────────────────────────────────────

async function askStrategy(question, context = {}) {
  const snapshot = await fetchOperationalSnapshot();

  const systemPrompt = `You are the Chief Strategy Officer AI for Zappy, India's on-demand home services platform.
You think 12-36 months ahead, identify market opportunities, competitive threats, and build execution roadmaps.
Use frameworks like OKRs, SWOT, Porter's Five Forces, and Jobs-to-be-Done.
Format response as JSON with: answer (string), strategicTheme (string), phases (array of {phase, timeline, actions, resources}),
kpis (array of {metric, currentBaseline, targetValue, timeframe}), risks (array), executiveSummary (string).`;

  const userMessage = `Company context:
${JSON.stringify(snapshot, null, 2)}
${context.additionalContext ? `\nAdditional context: ${JSON.stringify(context.additionalContext)}` : ''}

Strategic question: ${question}

Provide a comprehensive, actionable strategic plan with specific milestones and KPIs.`;

  const { content, model, usage } = await routeToModel('strategy', [
    { role: 'user', content: userMessage },
  ], { systemPrompt, maxTokens: 6000 });

  let parsed = safeParseJson(content);
  if (parsed.raw) {
    parsed = {
      answer:           parsed.raw,
      strategicTheme:   'Strategic Growth',
      phases:           [],
      kpis:             [],
      risks:            [],
      executiveSummary: parsed.raw,
    };
  }

  return {
    answer:           parsed.answer || content,
    strategicTheme:   parsed.strategicTheme || '',
    phases:           parsed.phases || [],
    kpis:             parsed.kpis || [],
    risks:            parsed.risks || [],
    executiveSummary: parsed.executiveSummary || '',
    model,
    tokensUsed:       usage.totalTokens,
  };
}

// ─── Daily Insights ───────────────────────────────────────────────────────────

async function generateDailyInsights() {
  const REDIS_KEY = 'zi:daily_insights';
  const snapshot  = await fetchOperationalSnapshot();

  const systemPrompt = `You are the Zappy Intelligence Platform's automated insight engine.
Analyse the provided metrics and generate 5-10 actionable business insights.
Each insight must have: insight (string), severity (info|warning|critical), action (string),
affectedEntity (string), confidence (0-1).
Return ONLY a JSON array of insight objects, no other text.`;

  const userMessage = `Today's operational snapshot (${snapshot.date}):
${JSON.stringify(snapshot, null, 2)}

Generate 5-10 business insights that operations, finance, or growth teams should act on today.
Flag anomalies, risks, and opportunities. Return JSON array only.`;

  const { content, model } = await routeToModel('anomaly_summary', [
    { role: 'user', content: userMessage },
  ], { systemPrompt, maxTokens: 3000 });

  let insights = [];
  try {
    const match = content.match(/\[[\s\S]*\]/);
    insights    = JSON.parse(match ? match[0] : content);
  } catch {
    // Fallback: generate rule-based insights if AI parsing fails
    insights = generateRuleBasedInsights(snapshot);
  }

  // Validate and sanitise each insight
  insights = insights.slice(0, 10).map(i => ({
    insight:        String(i.insight || ''),
    severity:       ['info', 'warning', 'critical'].includes(i.severity) ? i.severity : 'info',
    action:         String(i.action || 'Monitor and review'),
    affectedEntity: String(i.affectedEntity || 'Platform'),
    confidence:     Math.min(1, Math.max(0, Number(i.confidence) || 0.7)),
  }));

  const payload = { generatedAt: new Date().toISOString(), model, insights };
  await redis.set(REDIS_KEY, JSON.stringify(payload), 'EX', 86400).catch(() => {});

  logger.info({ count: insights.length }, 'Daily insights generated');
  return insights;
}

/**
 * Rule-based fallback insight generation when AI is unavailable.
 */
function generateRuleBasedInsights(snapshot) {
  const insights = [];

  if (snapshot.cancellationRate > 20) {
    insights.push({
      insight:        `High cancellation rate of ${snapshot.cancellationRate}% detected today. Industry benchmark is <15%.`,
      severity:       'critical',
      action:         'Investigate top cancellation reasons, check worker availability in high-demand areas.',
      affectedEntity: 'Operations',
      confidence:     0.9,
    });
  }

  if (snapshot.workerUtilisation < 40) {
    insights.push({
      insight:        `Worker utilisation is low at ${snapshot.workerUtilisation}%. ${snapshot.onlineWorkers} of ${snapshot.totalWorkers} workers online.`,
      severity:       'warning',
      action:         'Run worker activation campaign, send push notifications to offline workers.',
      affectedEntity: 'Supply',
      confidence:     0.85,
    });
  }

  if (snapshot.avgRating < 4.0 && snapshot.avgRating > 0) {
    insights.push({
      insight:        `Average service rating has dropped to ${snapshot.avgRating}. Immediate quality intervention required.`,
      severity:       'warning',
      action:         'Review lowest-rated workers this week. Trigger training module for workers below 3.5.',
      affectedEntity: 'Quality',
      confidence:     0.88,
    });
  }

  if (snapshot.ordersToday < 10 && snapshot.totalWorkers > 20) {
    insights.push({
      insight:        `Demand appears low with only ${snapshot.ordersToday} orders today.`,
      severity:       'info',
      action:         'Check if there are city-specific issues or send demand generation push notifications.',
      affectedEntity: 'Demand',
      confidence:     0.7,
    });
  }

  insights.push({
    insight:        `Platform GMV today: ₹${snapshot.gmvTodayRupees.toLocaleString('en-IN')}`,
    severity:       'info',
    action:         'Track against daily revenue target.',
    affectedEntity: 'Finance',
    confidence:     1.0,
  });

  return insights;
}

// ─── Report Generator ─────────────────────────────────────────────────────────

async function generateReport(type, scope = {}) {
  const snapshot = await fetchOperationalSnapshot();

  const reportConfigs = {
    weekly_ops: {
      task:  'ops_question',
      title: 'Weekly Operations Report',
      focus: 'operational efficiency, SLA compliance, worker performance, and demand trends for the past 7 days',
    },
    monthly_investor: {
      task:  'financial_report',
      title: 'Monthly Investor Report',
      focus: 'unit economics, revenue growth, market penetration, and strategic milestones for the past month',
    },
    city_health: {
      task:  'city_analysis',
      title: `City Health Report${scope.cityId ? ` — ${scope.cityId}` : ''}`,
      focus: 'city-level performance, supply-demand gaps, local worker issues, and city-specific growth opportunities',
    },
  };

  const config = reportConfigs[type] || reportConfigs.weekly_ops;

  const systemPrompt = `You are the Zappy Intelligence Platform report generator.
Create a professional, data-driven ${config.title}.
Focus on: ${config.focus}.
Return JSON with: title (string), executiveSummary (string), sections (array of {title, content, metrics}),
insights (array of strings), risks (array of strings), recommendations (array of strings), generatedAt (string).`;

  const userMessage = `Current platform metrics:
${JSON.stringify(snapshot, null, 2)}
Scope: ${JSON.stringify(scope)}

Generate a comprehensive ${config.title}. Use specific numbers from the metrics provided.
Include trend analysis, benchmarks, and prioritised action items.`;

  const { content, model, usage } = await routeToModel(config.task, [
    { role: 'user', content: userMessage },
  ], { systemPrompt, maxTokens: 8000 });

  let parsed = safeParseJson(content);
  if (parsed.raw) {
    parsed = {
      title:            config.title,
      executiveSummary: parsed.raw,
      sections:         [{ title: 'Overview', content: parsed.raw, metrics: {} }],
      insights:         [],
      risks:            [],
      recommendations:  [],
    };
  }

  return {
    title:            parsed.title || config.title,
    type,
    scope,
    executiveSummary: parsed.executiveSummary || '',
    sections:         parsed.sections || [],
    insights:         parsed.insights || [],
    risks:            parsed.risks || [],
    recommendations:  parsed.recommendations || [],
    generatedAt:      new Date().toISOString(),
    model,
    tokensUsed:       usage.totalTokens,
  };
}

module.exports = {
  askCOO,
  askCFO,
  askCRO,
  askStrategy,
  generateDailyInsights,
  generateReport,
  fetchOperationalSnapshot,
};
