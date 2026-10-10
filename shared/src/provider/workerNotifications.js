/**
 * A provider's notifications: what each type is called, which tab it's under,
 * how they're grouped by day, and where tapping one goes — platform-free, used
 * by the websites (WorkerNotificationsPage) and the apps alike.
 *
 * Keep this file free of browser APIs: the apps load it too.
 */

/** type → label and tone (good, bad, warn, brand, neutral, hot). Icons are each app's own. */
export const NOTIFICATION_TYPES = {
  kyc_approved: { label: 'KYC Approved', tone: 'good' },
  kyc_rejected: { label: 'KYC Rejected', tone: 'bad' },
  kyc_clarification: { label: 'KYC Query', tone: 'warn' },
  order_cancelled: { label: 'Job Cancelled', tone: 'bad' },
  job_assigned: { label: 'Job Assigned', tone: 'brand' },
  order_completed: { label: 'Job Completed', tone: 'warn' },
  shield_payout: { label: 'Shield Payout', tone: 'brand' },
  worker_earning: { label: 'Earnings', tone: 'good' },
  wallet_credited: { label: 'Money In', tone: 'good' },
  penalty_applied: { label: 'Penalty', tone: 'bad' },
  milestone_reached: { label: 'Milestone Bonus', tone: 'brand' },
  rating_received: { label: 'New Rating', tone: 'warn' },
  cancellation_fee_charged: { label: 'Fee Charged', tone: 'brand' },
  cancellation_fee_pending: { label: 'Fee Pending', tone: 'warn' },
  cancellation_warning: { label: 'Warning', tone: 'warn' },
  system_alert: { label: 'Alert', tone: 'neutral' },
  promotional: { label: 'Update', tone: 'hot' },
};
export const DEFAULT_NOTIFICATION_TYPE = { label: 'Notification', tone: 'neutral' };

export const NOTIFICATION_TABS = [
  { id: 'all', label: 'All' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'kyc', label: 'KYC' },
];
export const NOTIFICATION_TAB_TYPES = {
  jobs: ['order_cancelled', 'job_assigned', 'order_completed'],
  earnings: ['shield_payout', 'worker_earning', 'wallet_credited', 'penalty_applied', 'milestone_reached'],
  kyc: ['kyc_approved', 'kyc_rejected', 'kyc_clarification'],
};

export function inNotificationTab(n, tab) {
  return tab === 'all' || (NOTIFICATION_TAB_TYPES[tab] || []).includes(n.type);
}

export function emptyNotificationText(tab) {
  return {
    title: tab === 'all' ? 'No notifications yet' : `No ${tab} notifications`,
    body: tab === 'kyc' ? 'KYC updates from admin will appear here'
      : tab === 'earnings' ? 'Earnings, payouts and penalties will appear here'
        : tab === 'jobs' ? 'Job events will appear here'
          : "You're all caught up!",
  };
}

export function timeAgo(d) {
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}

export function groupByDay(items) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  const g = { today: [], yesterday: [], earlier: [] };
  for (const n of items) {
    const d = new Date(n.createdAt); d.setHours(0, 0, 0, 0);
    if (d >= today) g.today.push(n);
    else if (d >= yest) g.yesterday.push(n);
    else g.earlier.push(n);
  }
  return g;
}

/** Where tapping a notification goes: its own link, else by type. */
export function notificationPath(n) {
  if (n.deepLink) return n.deepLink;
  const t = n.type;
  if (t === 'kyc_approved' || t === 'kyc_rejected' || t === 'kyc_clarification') return '/worker/kyc';
  if (t === 'shield_payout') return '/worker';
  if (t?.includes('order') || t === 'job_assigned') return n.data?.orderId ? `/worker/jobs/${n.data.orderId}` : '/worker';
  return '/worker';
}
