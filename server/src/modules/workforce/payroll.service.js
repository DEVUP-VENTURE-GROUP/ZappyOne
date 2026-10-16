// A staff member's month: salary × paid days ÷ working days, plus an incentive per job above their pro-rated target; tips theirs, cash owed until deposited.
const Worker = require('../worker/worker.model');
const Shift = require('./shift.model');
const Leave = require('./leave.model');

const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const monthOf = (d = new Date()) => new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 7);
const bounds = (month) => {
  const start = new Date(`${month}-01T00:00:00+05:30`);
  const [y, m] = month.split('-').map(Number);
  const end = new Date(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01T00:00:00+05:30`);
  return { start, end };
};

/** One person's month, from the shifts and leave on record. */
async function monthFor(worker, month, cfg) {
  const { start, end } = bounds(month);
  const [shifts, leaves] = await Promise.all([
    Shift.find({ workerId: worker._id, startAt: { $gte: start, $lt: end } }).select('day status lateMin').lean(),
    Leave.find({ workerId: worker._id, status: 'approved', day: { $gte: `${month}-01`, $lte: `${month}-31` } }).select('day').lean(),
  ]);
  const workedDays = new Set(shifts.filter((s) => ['checked_in', 'done'].includes(s.status)).map((s) => s.day));
  const leaveDays = new Set(leaves.map((l) => l.day).filter((d) => !workedDays.has(d)));
  const paidDays = Math.min(cfg.workingDays, workedDays.size + leaveDays.size);
  const salaryPaise = worker.employment?.salaryPaise || 0;
  const done = (await require('../jobs/earnings').finishedJobs({ workerId: worker._id }, start)).filter((j) => new Date(j.at) < end);
  const tips = done.reduce((sum, j) => sum + (j.tipPaise || 0), 0);
  const [dues, givenBack] = await Promise.all([
    require('../worker/worker-dues.service').getDuesStatus(worker._id),
    require('../jobs/give-back').JobGiveBack.countDocuments({ providerId: worker._id, createdAt: { $gte: start, $lt: end } }),
  ]);
  const pay = Math.round((salaryPaise * paidDays) / Math.max(1, cfg.workingDays));
  // Target pro-rated by paid days, so a new joiner or someone on leave is measured fairly; every job above it earns the incentive.
  const targetJobs = Math.round((cfg.monthlyJobTarget * paidDays) / Math.max(1, cfg.workingDays));
  const extraJobs = Math.max(0, done.length - targetJobs);
  const incentivePaise = extraJobs * cfg.incentivePerJobPaise;
  return {
    workerId: String(worker._id), name: worker.name || 'Staff', phone: worker.phone || '', month,
    hubId: worker.employment?.hubId ? String(worker.employment.hubId) : null,
    salaryPaise, workingDays: cfg.workingDays, workedDays: workedDays.size, leaveDays: leaveDays.size, paidDays,
    missedShifts: shifts.filter((s) => s.status === 'missed').length,
    lateShifts: shifts.filter((s) => s.lateMin > 0).length,
    payPaise: pay,
    jobs: done.length, targetJobs, extraJobs, incentivePaise, incentivePerJobPaise: cfg.incentivePerJobPaise, totalPaise: pay + incentivePaise,
    givenBack,
    lowWork: paidDays >= 3 && done.length < (targetJobs * cfg.lowWorkPct) / 100,
    manyGiveBacks: givenBack >= cfg.giveBackFlag,
    tipsPaise: tips,
    cashToDepositPaise: dues.duesPaise || 0,
  };
}

/** A staff member's own month (their salary screen). */
async function myMonth(workerId, month = monthOf()) {
  const w = await Worker.findById(workerId).select('name phone employment').lean();
  if (w?.employment?.type !== 'staff') throw err(403, 'NOT_STAFF', 'Salary is for ZappyOne staff.');
  return monthFor(w, month, await require('../pricing/services/config.service').workforceSettings());
}

/** Admin: every staff member's month, for payroll. */
async function payroll(month = monthOf(), hubId = null) {
  const cfg = await require('../pricing/services/config.service').workforceSettings();
  const staff = await Worker.find({ 'employment.type': 'staff', ...(hubId ? { 'employment.hubId': hubId } : {}) }).select('name phone employment').lean();
  const rows = [];
  for (const w of staff) rows.push(await monthFor(w, month, cfg));
  return { month, workingDays: cfg.workingDays, rows };
}

/** The payroll as CSV, rupees, for the accountant. */
function toCsv({ rows }) {
  const r = (p) => (p / 100).toFixed(2);
  const head = 'Name,Phone,Month,Monthly salary (₹),Working days,Days worked,Leave days,Paid days,Missed shifts,Late shifts,Jobs done,Job target,Jobs above target,Handed back,Salary due (₹),Incentive (₹),Total pay (₹),Tips (₹),Cash to deposit (₹)';
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [head, ...rows.map((x) => [q(x.name), q(x.phone), x.month, r(x.salaryPaise), x.workingDays, x.workedDays, x.leaveDays, x.paidDays, x.missedShifts, x.lateShifts, x.jobs, x.targetJobs, x.extraJobs, x.givenBack, r(x.payPaise), r(x.incentivePaise), r(x.totalPaise), r(x.tipsPaise), r(x.cashToDepositPaise)].join(','))].join('\n');
}

module.exports = { myMonth, payroll, toCsv, monthOf };
