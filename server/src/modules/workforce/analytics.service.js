/**
 * Admin → Fleet → Overview: the fleet run the way quick-commerce runs its
 * dark stores, over the last `days` (and the same span before it, for the
 * change): day by day and hub by hub.
 *
 *   revenue        staff jobs' money (payment/settlement tags it with the hub)
 *   salary cost    each worked shift-day at monthly salary ÷ working days
 *   expenses       recorded fleet expenses (stock purchases included)
 *   profit         revenue − salary cost − expenses
 *   attendance     shifts worked ÷ (worked + missed)
 *   utilisation    jobs per shift worked
 *   cost per job   (salary cost + expenses) ÷ jobs
 */
const Hub = require('./hub.model');
const Shift = require('./shift.model');
const Expense = require('./expense.model');
const Worker = require('../worker/worker.model');
const Transaction = require('../payment/transaction.model');

const DAY = 86400000;
const istDay = (d) => new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10);
const istStart = (day) => new Date(`${day}T00:00:00+05:30`);

async function series(from, to) {
  const [staff, cfg, hubs] = await Promise.all([
    Worker.find({ 'employment.type': 'staff' }).select('employment').lean(),
    require('../pricing/services/config.service').workforceSettings(),
    Hub.find().select('name city').lean(),
  ]);
  const daily = new Map(staff.map((w) => [String(w._id), (w.employment?.salaryPaise || 0) / Math.max(1, cfg.workingDays)]));
  const hubOf = new Map(staff.map((w) => [String(w._id), w.employment?.hubId ? String(w.employment.hubId) : null]));
  const [revenue, shifts, expenses] = await Promise.all([
    Transaction.aggregate([
      { $match: { reason: Transaction.REASONS.PLATFORM_COMMISSION, 'metadata.staff': true, createdAt: { $gte: istStart(from), $lt: new Date(istStart(to).getTime() + DAY) } } },
      { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, hub: '$metadata.hubId' }, paise: { $sum: '$amountPaise' }, jobs: { $sum: 1 } } },
    ]),
    Shift.find({ day: { $gte: from, $lte: to }, status: { $in: ['checked_in', 'done', 'missed'] } }).select('workerId hubId day status').lean(),
    Expense.aggregate([
      { $match: { day: { $gte: from, $lte: to } } },
      { $group: { _id: { day: '$day', hub: '$hubId', category: '$category' }, paise: { $sum: '$amountPaise' } } },
    ]),
  ]);
  return { staff, daily, hubOf, hubs, revenue, shifts, expenses };
}

function roll(from, to, s) {
  const days = [];
  for (let t = istStart(from).getTime(); t <= istStart(to).getTime(); t += DAY) days.push(istDay(t));
  const byDay = new Map(days.map((d) => [d, { day: d, revenuePaise: 0, jobs: 0, salaryPaise: 0, expensesPaise: 0, worked: 0, missed: 0 }]));
  const byHub = new Map(s.hubs.map((h) => [String(h._id), { key: String(h._id), label: h.name, city: h.city, revenuePaise: 0, jobs: 0, salaryPaise: 0, expensesPaise: 0, worked: 0, missed: 0, staff: 0 }]));
  const cats = {};
  s.revenue.forEach((r) => {
    const d = byDay.get(r._id.day); if (d) { d.revenuePaise += r.paise; d.jobs += r.jobs; }
    const h = byHub.get(String(r._id.hub)); if (h) { h.revenuePaise += r.paise; h.jobs += r.jobs; }
  });
  const workedOnce = new Set();
  s.shifts.forEach((x) => {
    const d = byDay.get(x.day); const h = byHub.get(String(x.hubId));
    if (x.status === 'missed') { if (d) d.missed += 1; if (h) h.missed += 1; return; }
    const key = `${x.workerId}:${x.day}`;
    if (d) d.worked += 1; if (h) h.worked += 1;
    if (workedOnce.has(key)) return; // salary is per day worked, not per shift
    workedOnce.add(key);
    const pay = s.daily.get(String(x.workerId)) || 0;
    if (d) d.salaryPaise += pay; if (h) h.salaryPaise += pay;
  });
  s.expenses.forEach((e) => {
    const d = byDay.get(e._id.day); if (d) d.expensesPaise += e.paise;
    const h = byHub.get(String(e._id.hub)); if (h) h.expensesPaise += e.paise;
    cats[e._id.category] = (cats[e._id.category] || 0) + e.paise;
  });
  s.staff.forEach((w) => { const h = byHub.get(s.hubOf.get(String(w._id))); if (h) h.staff += 1; });
  const fin = (x) => ({
    ...x, salaryPaise: Math.round(x.salaryPaise),
    profitPaise: Math.round(x.revenuePaise - x.salaryPaise - x.expensesPaise),
    attendancePct: x.worked + x.missed ? Math.round((x.worked / (x.worked + x.missed)) * 100) : null,
  });
  const dayRows = [...byDay.values()].map(fin);
  const hubRows = [...byHub.values()].map((h) => ({ ...fin(h), costPerJobPaise: h.jobs ? Math.round((h.salaryPaise + h.expensesPaise) / h.jobs) : null }))
    .sort((a, b) => b.revenuePaise - a.revenuePaise);
  const t = dayRows.reduce((a, d) => ({
    revenuePaise: a.revenuePaise + d.revenuePaise, jobs: a.jobs + d.jobs, salaryPaise: a.salaryPaise + d.salaryPaise,
    expensesPaise: a.expensesPaise + d.expensesPaise, worked: a.worked + d.worked, missed: a.missed + d.missed,
  }), { revenuePaise: 0, jobs: 0, salaryPaise: 0, expensesPaise: 0, worked: 0, missed: 0 });
  const totals = {
    ...fin(t),
    avgJobPaise: t.jobs ? Math.round(t.revenuePaise / t.jobs) : null,
    costPerJobPaise: t.jobs ? Math.round((t.salaryPaise + t.expensesPaise) / t.jobs) : null,
    jobsPerShift: t.worked ? Math.round((t.jobs / t.worked) * 10) / 10 : null,
  };
  return { days: dayRows, hubs: hubRows, totals, expenseByCategory: Object.entries(cats).map(([key, paise]) => ({ key, label: key.replace('_', ' '), paise })).sort((a, b) => b.paise - a.paise) };
}

const pct = (now, before) => (before ? Math.round(((now - before) / Math.abs(before)) * 100) : null);

async function overview({ days = 30 } = {}) {
  const span = Math.min(90, Math.max(7, Number(days) || 30));
  const to = istDay(Date.now()); const from = istDay(Date.now() - (span - 1) * DAY);
  const pTo = istDay(istStart(from).getTime() - DAY); const pFrom = istDay(istStart(from).getTime() - span * DAY);
  const [cur, prev] = await Promise.all([series(from, to), series(pFrom, pTo)]);
  const now = roll(from, to, cur); const before = roll(pFrom, pTo, prev);
  const [onDuty, stockItems, payroll] = await Promise.all([
    require('./staff').onDutyIds(),
    require('./stock.service').items(),
    require('./payroll.service').payroll(),
  ]);
  const k = now.totals; const b = before.totals;
  return {
    from, to, days: now.days, hubs: now.hubs, expenseByCategory: now.expenseByCategory,
    kpis: {
      revenuePaise: k.revenuePaise, revenueDelta: pct(k.revenuePaise, b.revenuePaise),
      profitPaise: k.profitPaise, profitDelta: pct(k.profitPaise, b.profitPaise),
      jobs: k.jobs, jobsDelta: pct(k.jobs, b.jobs),
      avgJobPaise: k.avgJobPaise, costPerJobPaise: k.costPerJobPaise, jobsPerShift: k.jobsPerShift,
      attendancePct: k.attendancePct, salaryPaise: k.salaryPaise, expensesPaise: k.expensesPaise,
      staff: cur.staff.length, onDutyNow: onDuty.size, hubs: cur.hubs.length,
      cashWithStaffPaise: payroll.rows.reduce((t, r) => t + r.cashToDepositPaise, 0),
      stockValuePaise: stockItems.reduce((t, i) => t + i.valuePaise, 0), lowStock: stockItems.filter((i) => i.low).length,
    },
  };
}

module.exports = { overview };
