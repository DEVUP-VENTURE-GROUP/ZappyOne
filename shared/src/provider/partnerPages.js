/**
 * Pages for partners paid per job (shops, agencies and their teams on
 * ServicePro), not for ZappyOne's own salaried staff on Rakshak (server
 * workforce/): earnings, goals, bank, withdraw, hours (and auto-accept),
 * appeals. Platform-free; the website and the apps both filter by it.
 */
export const PARTNER_ONLY = new Set(['/worker/earnings', '/worker/goals', '/worker/bank', '/worker/withdraw', '/worker/hours', '/worker/appeals']);

/**
 * A menu as staff see it: the money pages give way to their shifts.
 * @template {{ to: string }} T
 * @param {T[]} items
 * @param {boolean} staff
 * @returns {T[]}
 */
export function staffMenu(items, staff) {
  if (!staff) return items;
  return items
    .map((i) => (i.to === '/worker/earnings' ? { ...i, key: 'shifts', label: 'Shifts', to: '/worker/shifts' } : i))
    .filter((i) => !PARTNER_ONLY.has(i.to));
}

// ZappyOne staff help and emergency line, called straight from the Rakshak menu.
export const STAFF_HELP_PHONE = '9392756435';

// A business owner's pages, one list for the ServicePro website and app. `primary` ones are the bottom bar (with More, six in all); the rest are the menu. `icon` is a lucide name each platform draws.
export const OWNER_PAGES = [
  { key: 'home', label: 'Home', icon: 'LayoutDashboard', to: '/shop', primary: true },
  { key: 'work', label: 'Work & prices', icon: 'Wrench', to: '/provider/services', primary: true },
  { key: 'pricereq', label: 'Customers asking your price', icon: 'MessageSquareQuote', to: '/shop/price-requests' },
  { key: 'orders', label: 'Orders', icon: 'KanbanSquare', to: '/shop/orders' },
  { key: 'plans', label: 'Plans', icon: 'Repeat', to: '/shop/plans' },
  { key: 'team', label: 'Team', icon: 'Users', to: '/shop/workers', primary: true },
  { key: 'insights', label: 'How you are doing', icon: 'BarChart3', to: '/shop/insights' },
  { key: 'earnings', label: 'Earnings', icon: 'IndianRupee', to: '/shop/earnings', primary: true },
  { key: 'withdraw', label: 'Take out money', icon: 'Wallet', to: '/shop/withdraw' },
  { key: 'bank', label: 'Bank & UPI', icon: 'Landmark', to: '/shop/bank' },
  { key: 'notifications', label: 'Notifications', icon: 'Bell', to: '/shop/notifications' },
  { key: 'account', label: 'Profile', icon: 'UserRound', to: '/shop/account' },
  { key: 'shop', label: 'Shop & hours', icon: 'Store', to: '/shop/profile', primary: true },
  { key: 'reviews', label: 'Reviews', icon: 'Star', to: '/shop/reviews' },
  { key: 'kyc', label: 'ID check', icon: 'ShieldCheck', to: '/shop/kyc' },
  { key: 'appeals', label: 'Ask us to recheck', icon: 'Scale', to: '/shop/appeals' },
  { key: 'services', label: 'Add a service', icon: 'PlusCircle', to: '/provider/onboarding' },
  { key: 'support', label: 'Talk to ZappyOne', icon: 'Headphones', to: '/shop/support' },
];

// Price requests, plans and insights show only for trades that use them (server onboarding/workspace); `labels` renames a page for a trade.
const OPTIONAL_OWNER = new Set(['pricereq', 'plans', 'insights']);
export function ownerPages(workspace) {
  const on = new Set(workspace?.modules || []);
  const labels = workspace?.labels || {};
  return OWNER_PAGES.filter((p) => !OPTIONAL_OWNER.has(p.key) || on.has(p.key)).map((p) => (labels[p.key] ? { ...p, label: labels[p.key] } : p));
}

/** The menu behind More: everything not on the bar, without Notifications (the bell) or the page holding the menu. */
export const ownerMenu = (workspace, here = 'account') => ownerPages(workspace).filter((p) => !p.primary && p.key !== 'notifications' && p.key !== here);
