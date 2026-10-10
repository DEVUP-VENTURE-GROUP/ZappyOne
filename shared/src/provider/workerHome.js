/**
 * The worker home's numbers and wording — platform-free, used by the websites
 * (WorkerDashboard, DuesCard, ProviderServicesCard) and the apps alike, so a
 * worker reads the same thing on either.
 *
 * Keep this file free of browser APIs: the apps load it too.
 */

const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

/** The last 7 days, oldest first, with empty days filled in. */
export function last7(breakdown = []) {
  const byDate = Object.fromEntries(breakdown.map((d) => [d.date, d]));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return byDate[key] || { date: key, earningsPaise: 0, jobs: 0 };
  });
}

/** This week against the one before, as a whole percentage. */
export function weekDeltaPct(breakdown = []) {
  const week = last7(breakdown);
  const prevWeekPaise = breakdown
    .filter((d) => { const age = (Date.now() - Date.parse(d.date)) / 86400000; return age >= 7 && age < 14; })
    .reduce((s, d) => s + d.earningsPaise, 0);
  const thisWeekPaise = week.reduce((s, d) => s + d.earningsPaise, 0);
  return prevWeekPaise > 0 ? Math.round(((thisWeekPaise - prevWeekPaise) / prevWeekPaise) * 100) : (thisWeekPaise > 0 ? 100 : 0);
}

/** Seconds online as "2h 05m". */
export const hm = (sec) => `${Math.floor(sec / 3600)}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}m`;

/** "4.8", or a dash before the first completed job. */
export const ratingLabel = (worker) => (worker?.completedJobs > 0 && worker?.rating != null ? Number(worker.rating).toFixed(1) : '—');

/** What the verification banner says, by KYC status. */
export function kycBannerText(status) {
  return status === 'pending_review' ? 'Your verification is under review'
    : status === 'rejected' ? 'Verification rejected. Tap to resubmit'
      : 'Choose a service and get verified to start earning';
}

/**
 * The dues card: what is owed on cash jobs, how close to the limit, what to do.
 * Null when there is nothing to show.
 */
export function duesView(dues) {
  const d = dues;
  const waiting = (d?.claims || []).filter((c) => c.status === 'pending');
  if (!d || (d.duesPaise <= 0 && !waiting.length)) return null;
  const used = Math.min(100, Math.round((d.duesPaise / (d.limitPaise || 1)) * 100));
  const title = d.status === 'blocked'
    ? 'New jobs are paused'
    : `You owe ZappyOne ${rupees(d.duesPaise)}`;
  const body = d.status === 'blocked'
    ? `You owe ${rupees(d.duesPaise)} from cash jobs. Pay at least ${rupees(d.duesPaise - d.limitPaise + 100)} to get jobs again. A job you are already on is not affected.`
    : d.status === 'warning'
      ? `New jobs stop at ${rupees(d.limitPaise)}. ${rupees(d.leftPaise)} left. Pay some now to keep working.`
      : `This is ZappyOne's commission on cash jobs. New jobs stop at ${rupees(d.limitPaise)}. Online-paid jobs reduce it on their own.`;
  return {
    status: d.status, title, body, used, owedLabel: rupees(d.duesPaise), limitLabel: rupees(d.limitPaise),
    owes: d.duesPaise > 0, waiting: waiting.map((c) => rupees(c.amountPaise)),
    payInstructions: d.payInstructions || '', recent: d.recent || [],
  };
}

/** Validates an "I have paid" claim; returns an error message or null. */
export function duesClaimError({ amount, method, reference }) {
  const paise = Math.round(Number(amount) * 100);
  if (!Number.isFinite(paise) || paise < 100) return 'Enter the amount you paid';
  if (method !== 'cash' && String(reference || '').trim().length < 4) return 'Enter the UPI or bank reference number';
  return null;
}

/** A service enrolment's status, as a chip. */
export const ENROLMENT_CHIP = {
  draft: { label: 'Not submitted', tone: 'none' },
  pending_review: { label: 'Under review', tone: 'pending' },
  approved: { label: 'Approved', tone: 'approved' },
  rejected: { label: 'Needs changes', tone: 'attention' },
  suspended: { label: 'Paused', tone: 'attention' },
};

/** The "my services" card headline, from onboarding status. */
export function servicesHeadline(status) {
  const enrolments = status?.enrolments || [];
  const next = status?.nextStep;
  const approved = enrolments.filter((e) => e.status === 'approved');
  if (!enrolments.length) return { title: 'Choose what you work on', body: 'Pick your services to start receiving jobs.', tone: 'none' };
  if (next?.code === 'AWAITING_REVIEW') return { title: "We're reviewing your documents", body: 'Usually within a day — we\'ll notify you.', tone: 'pending' };
  if (next?.code === 'FIX_REJECTED') return { title: 'Verification needs changes', body: next.label, tone: 'attention' };
  if (next?.code === 'COMPLETE_VERIFICATION') return { title: 'Finish your verification', body: next.label, tone: 'pending' };
  return {
    title: approved.length === 1
      ? `Approved for ${approved[0].line?.name || approved[0].lineCode}`
      : `Approved for ${approved.length} services`,
    body: 'Tap to add another service or update your details.',
    tone: 'approved',
  };
}
