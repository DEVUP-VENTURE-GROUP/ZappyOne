/**
 * The fleet's own money, apart from the marketplace's (Admin → Fleet →
 * Finance), hub by hub, the way a dark-store business runs each store:
 *
 *   revenue     what that hub's staff jobs brought in (payment/settlement
 *               tags staff revenue with the hub)
 *   salaries    the month's payroll for its staff (workforce/payroll)
 *   expenses    rent, electricity, fuel, tools… recorded with receipts
 *   profit      revenue − salaries − expenses
 *   cash        collected in cash and deposited this month; still with staff now
 *
 * Expenses with no hub are the fleet's (bought centrally); they count in the
 * total, not against one hub.
 */
const mongoose = require('mongoose');
const Hub = require('./hub.model');
const Expense = require('./expense.model');
const Transaction = require('../payment/transaction.model');
const Worker = require('../worker/worker.model');
const payrollService = require('./payroll.service');

function bounds(month) {
  const start = new Date(`${month}-01T00:00:00+05:30`);
  const [y, m] = month.split('-').map(Number);
  const end = new Date(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01T00:00:00+05:30`);
  return { start, end };
}

async function hubFinance(month = payrollService.monthOf()) {
  const { start, end } = bounds(month);
  const [hubs, revenue, expenses, payroll, staff] = await Promise.all([
    Hub.find().select('name city').lean(),
    Transaction.aggregate([
      { $match: { reason: Transaction.REASONS.PLATFORM_COMMISSION, 'metadata.staff': true, createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: '$metadata.hubId', paise: { $sum: '$amountPaise' }, jobs: { $sum: 1 }, cashJobs: { $sum: { $cond: ['$metadata.cash', 1, 0] } } } },
    ]),
    Expense.aggregate([
      { $match: { day: { $gte: `${month}-01`, $lte: `${month}-31` } } },
      { $group: { _id: { hub: '$hubId', category: '$category' }, paise: { $sum: '$amountPaise' } } },
    ]),
    payrollService.payroll(month),
    Worker.find({ 'employment.type': 'staff' }).select('employment.hubId').lean(),
  ]);
  const staffIds = staff.map((w) => w._id);
  const hubOf = new Map(staff.map((w) => [String(w._id), w.employment?.hubId ? String(w.employment.hubId) : null]));
  const deposits = await Transaction.aggregate([
    { $match: { reason: Transaction.REASONS.DUES_PAYMENT, 'owner.kind': 'worker', 'owner.id': { $in: staffIds }, createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: '$owner.id', paise: { $sum: '$amountPaise' } } },
  ]);

  const blank = () => ({ revenuePaise: 0, jobs: 0, cashJobs: 0, salaryPaise: 0, staff: 0, expensesPaise: 0, byCategory: {}, depositedPaise: 0, cashWithStaffPaise: 0, tipsPaise: 0 });
  const rows = new Map(hubs.map((h) => [String(h._id), { id: String(h._id), name: h.name, city: h.city, ...blank() }]));
  const fleet = { id: null, name: 'Fleet-wide', city: '', ...blank() };
  const at = (id) => (id && rows.get(String(id))) || fleet;

  revenue.forEach((r) => { const x = at(r._id); x.revenuePaise += r.paise; x.jobs += r.jobs; x.cashJobs += r.cashJobs; });
  expenses.forEach((e) => { const x = at(e._id.hub); x.expensesPaise += e.paise; x.byCategory[e._id.category] = (x.byCategory[e._id.category] || 0) + e.paise; });
  payroll.rows.forEach((p) => { const x = at(p.hubId); x.salaryPaise += p.totalPaise ?? p.payPaise; x.staff += 1; x.cashWithStaffPaise += p.cashToDepositPaise; x.tipsPaise += p.tipsPaise; });
  deposits.forEach((d) => { at(hubOf.get(String(d._id))).depositedPaise += d.paise; });

  const finish = (x) => ({
    ...x,
    profitPaise: x.revenuePaise - x.salaryPaise - x.expensesPaise,
    costPerJobPaise: x.jobs ? Math.round((x.salaryPaise + x.expensesPaise) / x.jobs) : null,
    revenuePerStaffPaise: x.staff ? Math.round(x.revenuePaise / x.staff) : null,
  });
  const list = [...rows.values()].map(finish);
  const sum = (k) => list.reduce((t, x) => t + x[k], 0) + fleet[k];
  const total = finish({
    id: 'total', name: 'All hubs', city: '', revenuePaise: sum('revenuePaise'), jobs: sum('jobs'), cashJobs: sum('cashJobs'),
    salaryPaise: sum('salaryPaise'), staff: sum('staff'), expensesPaise: sum('expensesPaise'), depositedPaise: sum('depositedPaise'),
    cashWithStaffPaise: sum('cashWithStaffPaise'), tipsPaise: sum('tipsPaise'), byCategory: {},
  });
  return { month, hubs: list, fleet: finish(fleet), total };
}

async function listExpenses({ month, hubId }) {
  const filter = { day: { $gte: `${month}-01`, $lte: `${month}-31` } };
  if (hubId === 'fleet') filter.hubId = null; else if (hubId && mongoose.isValidObjectId(hubId)) filter.hubId = hubId;
  return Expense.find(filter).sort({ day: -1, createdAt: -1 }).limit(500).populate('hubId', 'name').populate('workerId', 'name').lean();
}

module.exports = { hubFinance, listExpenses };
