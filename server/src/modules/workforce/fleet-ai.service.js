// Fleet AI: a briefing and answers about the fleet, written by a language model from the fleet's own figures only (first names, no phones).
const { redis } = require('../../config/redis');
const ai = require('../ai/chat.service');

const R = (p) => Math.round((p || 0) / 100);
const first = (name) => String(name || 'Staff').split(' ')[0];

// The month's figures, in rupees, small enough for a prompt.
async function context(month) {
  const ins = await require('./insights.service').insights(month);
  const next = await require('../admin-portal/expansion.service').nextLaunch({ days: 30, sites: 3 }).catch(() => null);
  const cfg = await require('../pricing/services/config.service').workforceSettings();
  const person = (p) => ({ name: first(p.name), jobs: p.jobs, target: p.targetJobs, attendancePct: p.attendancePct, late: p.lateShifts, handedBack: p.givenBack, incentiveRs: R(p.incentivePaise) });
  return {
    month,
    rules: { jobTargetPerMonth: cfg.monthlyJobTarget, incentivePerExtraJobRs: R(cfg.incentivePerJobPaise), workingDays: cfg.workingDays, arrivalPromiseMin: ins.promise.minutes },
    total: { revenueRs: R(ins.total.revenuePaise), profitRs: R(ins.total.profitPaise), jobs: ins.total.jobs, staff: ins.total.staff, costPerJobRs: R(ins.total.costPerJobPaise) },
    hubs: ins.hubs.map((h) => ({ name: h.name, staff: h.staff, jobs: h.jobs, revenueRs: R(h.revenuePaise), salariesRs: R(h.salaryPaise), expensesRs: R(h.expensesPaise), profitRs: R(h.profitPaise), marginPct: h.marginPct, earnsPerJobRs: R(h.revenuePerJobPaise), costsPerJobRs: R(h.costPerJobPaise), attendancePct: h.attendancePct, incentivesRs: R(h.incentivePaise) })),
    topPeople: ins.people.slice(0, 5).map(person),
    bottomPeople: [...ins.people].sort((a, b) => (a.targetPct ?? 0) - (b.targetPct ?? 0)).slice(0, 5).map(person),
    signals: ins.signals.map((s) => `${s.level}: ${s.title}. ${s.detail}`),
    nextHubs: (next?.sites || []).map((s) => ({ area: s.area, jobsPerMonth: s.jobsPerMonth, staffNeeded: s.staffNeeded, unservedSearches: s.unserved, topServices: s.topServices.map((x) => x.name), partnersNearby: s.partnersNearby })),
    coverage: next?.coverage || null,
  };
}

const SYSTEM = 'You are the fleet analyst for ZappyOne, a home-services company in Hyderabad with its own salaried staff working from small hubs (dark stores). '
  + 'Use only the JSON figures you are given; never invent numbers, names or causes. Money is in Indian rupees (write ₹). '
  + 'Write plainly for a busy founder: short sentences, no jargon, no markdown headings or bold, no tables. '
  + 'If the figures cannot answer something, say exactly which figure is missing.';

async function briefing(month) {
  const key = `fleetai:brief:${month}`;
  const cached = await redis.get(key).catch(() => null);
  if (cached) return { ...JSON.parse(cached), cached: true };
  const data = await context(month);
  const out = await ai.chat([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Fleet figures for ${month}:\n${JSON.stringify(data)}\n\nGive the 3 most important things to do this week, most urgent first. One line each, starting with "1.", "2.", "3.": first the action (a verb: fix, move, talk to, cut, open), then the hub or person, then the number behind it. Then one line starting "Next hub:" on where to open next and why. At most 120 words.` },
  ]);
  if (!out) return null;
  const result = { text: out.text, model: out.model, at: new Date().toISOString() };
  await redis.set(key, JSON.stringify(result), 'EX', 3600).catch(() => {});
  return result;
}

async function ask(month, question) {
  const data = await context(month);
  const out = await ai.chat([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Fleet figures for ${month}:\n${JSON.stringify(data)}\n\nQuestion: ${question}\n\nAnswer in at most 100 words.` },
  ]);
  return out && { text: out.text, model: out.model };
}

module.exports = { briefing, ask, context, enabled: ai.enabled };
