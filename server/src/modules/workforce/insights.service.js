// Admin's view of the fleet, from the same numbers the Fleet portal runs on: hubs compared, people ranked, and plain-language signals with what to do.
const Hub = require('./hub.model');
const payrollService = require('./payroll.service');

const rs = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;
const attendance = (worked, missed) => (worked + missed ? Math.round((worked / (worked + missed)) * 100) : null);

async function insights(month = payrollService.monthOf()) {
  const [fin, pay, att, hubs, fa] = await Promise.all([
    require('./finance.service').hubFinance(month),
    payrollService.payroll(month),
    month === payrollService.monthOf() ? require('./watchdog.service').attention() : Promise.resolve(null),
    Hub.find().select('name serviceKm area places isActive').lean(),
    require('../pricing/services/config.service').fastAssignSettings(),
  ]);
  const cfg = await require('../pricing/services/config.service').workforceSettings();

  const people = pay.rows.map((r) => ({
    ...r,
    attendancePct: attendance(r.workedDays, r.missedShifts),
    targetPct: r.targetJobs ? Math.round((r.jobs / r.targetJobs) * 100) : null,
  })).sort((a, b) => b.jobs - a.jobs);

  const byHub = new Map();
  for (const p of people) {
    const h = byHub.get(p.hubId) || { worked: 0, missed: 0, incentivePaise: 0, low: 0 };
    h.worked += p.workedDays; h.missed += p.missedShifts; h.incentivePaise += p.incentivePaise; h.low += p.lowWork ? 1 : 0;
    byHub.set(p.hubId, h);
  }
  const hubRows = fin.hubs.map((f) => {
    const h = byHub.get(f.id) || { worked: 0, missed: 0, incentivePaise: 0, low: 0 };
    const revenuePerJob = f.jobs ? Math.round(f.revenuePaise / f.jobs) : null;
    return { ...f, attendancePct: attendance(h.worked, h.missed), incentivePaise: h.incentivePaise, lowWork: h.low, revenuePerJobPaise: revenuePerJob, marginPct: f.revenuePaise ? Math.round((f.profitPaise / f.revenuePaise) * 100) : null };
  }).sort((a, b) => b.profitPaise - a.profitPaise);

  const { kmWithinPromise } = require('../jobs/arrival');
  const promiseKm = kmWithinPromise(fa.fairBandMin);
  const signals = [];
  const add = (level, title, detail, action) => signals.push({ level, title, detail, action });

  for (const h of hubRows) {
    if (h.jobs && h.profitPaise < 0) add('risk', `${h.name} lost ${rs(-h.profitPaise)} this month`, `It costs ${rs(h.costPerJobPaise)} a job and earns ${rs(h.revenuePerJobPaise)}.`, 'Cut idle shifts, or send it more jobs by widening its area.');
    if (h.staff && !h.jobs) add('risk', `${h.name} has ${h.staff} staff and no jobs`, 'Salaries are being paid with nothing coming in.', 'Check its area covers where customers book, and that staff are checking in.');
    if (h.attendancePct != null && h.attendancePct < 85) add('watch', `${h.name} attendance is ${h.attendancePct}%`, 'Booked shifts are being missed.', 'Look at Roster for who is missing, and fill shifts with Auto-fill.');
    if (h.salaryPaise && h.incentivePaise > h.salaryPaise * 0.15) add('watch', `${h.name}: incentives are ${Math.round((h.incentivePaise / h.salaryPaise) * 100)}% of salaries`, `${rs(h.incentivePaise)} on top of ${rs(h.salaryPaise)}.`, 'Busy enough for one more person, or raise the monthly target.');
    if (h.marginPct != null && h.marginPct >= 25 && h.jobs >= 20) add('good', `${h.name} runs at a ${h.marginPct}% margin`, `${h.jobs} jobs, ${rs(h.profitPaise)} profit.`, 'A model for the next hub nearby.');
  }
  for (const hub of hubs) {
    const shaped = hub.area?.coordinates?.length || hub.places?.length;
    if (hub.isActive && !shaped && hub.serviceKm > promiseKm + 0.25) add('watch', `${hub.name} serves ${hub.serviceKm} km`, `Its edge is beyond the ${fa.fairBandMin}-minute promise (about ${promiseKm.toFixed(1)} km).`, 'Shrink its radius, draw its area, or open a hub nearer the edge.');
  }
  if (att) {
    const short = att.short.filter((s) => s.when === 'today');
    if (short.length) add('risk', `${short.length} shift${short.length === 1 ? '' : 's'} short today`, short.map((s) => `${s.hub} ${s.shift}: ${s.short} short`).join(', '), 'Roster → Auto-fill, or ask staff to book.');
    if (att.cash.length) add('watch', `${att.cash.length} ${att.cash.length === 1 ? 'person holds' : 'people hold'} cash over a day`, att.cash.map((c) => `${c.name} ${rs(c.paise)}`).join(', '), 'Record the deposit in Finance once they hand it in.');
  }
  const low = people.filter((p) => p.lowWork);
  if (low.length) add('watch', `${low.length} ${low.length === 1 ? 'person is' : 'people are'} well under target`, low.slice(0, 5).map((p) => `${p.name} ${p.jobs}/${p.targetJobs}`).join(', '), 'Talk to them; check they are on duty during their shifts.');
  const dodgers = people.filter((p) => p.manyGiveBacks);
  if (dodgers.length) add('risk', `${dodgers.length} ${dodgers.length === 1 ? 'person keeps' : 'people keep'} handing jobs back`, dodgers.slice(0, 5).map((p) => `${p.name} ${p.givenBack}`).join(', '), 'Each hand-back delays a customer. Review their reasons in Activity.');
  const stars = people.filter((p) => p.extraJobs > 0);
  if (stars.length) add('good', `${stars.length} ${stars.length === 1 ? 'person is' : 'people are'} above target`, stars.slice(0, 5).map((p) => `${p.name} +${p.extraJobs}`).join(', '), `They earn ${rs(cfg.incentivePerJobPaise)} a job above target this month.`);

  const order = { risk: 0, watch: 1, good: 2 };
  signals.sort((a, b) => order[a.level] - order[b.level]);
  return { month, total: fin.total, hubs: hubRows, people, signals, promise: { minutes: fa.fairBandMin, km: promiseKm } };
}

module.exports = { insights };
