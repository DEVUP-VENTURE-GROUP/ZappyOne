import { dayLabel, timeLabel } from '../customer/schedule';

// Jobs in hand as a day plan: what needs doing now first, then each booked day in time order.
export function jobDays(jobs = [], now = Date.now()) {
  const groups = new Map([['now', { key: 'now', title: 'Now', jobs: [] }]]);
  const booked = jobs.filter((j) => j.scheduledAt && new Date(j.scheduledAt).getTime() > now)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  for (const j of jobs) if (!booked.includes(j)) groups.get('now').jobs.push({ ...j, time: j.scheduledAt ? timeLabel(j.scheduledAt) : null });
  for (const j of booked) {
    const title = dayLabel(j.scheduledAt);
    if (!groups.has(title)) groups.set(title, { key: title, title, jobs: [] });
    groups.get(title).jobs.push({ ...j, time: timeLabel(j.scheduledAt) });
  }
  return [...groups.values()].filter((g) => g.jobs.length);
}
