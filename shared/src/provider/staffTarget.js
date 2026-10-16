// A staff member's month against their job target, in words for the salary card (server workforce/payroll).
export function targetLine(s) {
  if (!s || s.targetJobs == null) return '';
  const rate = s.incentivePerJobPaise ? ` ₹${Math.round(s.incentivePerJobPaise / 100)} each` : '';
  if (s.extraJobs > 0) return `${s.jobs} jobs done, ${s.extraJobs} above your target of ${s.targetJobs}: ₹${Math.round(s.incentivePaise / 100).toLocaleString('en-IN')} incentive so far.`;
  const left = Math.max(0, s.targetJobs - s.jobs);
  return `${s.jobs} of ${s.targetJobs} jobs done. ${left ? `${left} more and every job after earns an incentive${rate}.` : `Every job from here earns an incentive${rate}.`}`;
}
