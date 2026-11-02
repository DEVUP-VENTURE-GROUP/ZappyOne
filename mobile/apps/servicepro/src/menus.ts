/**
 * ServicePro's places, for both people who use it (the website's
 * ServiceProShell). The owner runs the shop; a technician only works the jobs
 * the owner gives them. Each place appears once: in the bottom tabs, or in the
 * menu sheet for the rest.
 */
import {
  BarChart3, FileText, KanbanSquare, Landmark, MessageSquareQuote, PlusCircle, Repeat, Scale, ShieldCheck, Star, Store, Wallet, Wrench,
} from 'lucide-react-native';

/** The owner's pages the tabs (Home, Team, Earnings, Alerts, Profile) don't show. */
export const OWNER_MENU = [
  { key: 'orders', label: 'Orders', Icon: KanbanSquare, to: '/shop/orders' },
  { key: 'plans', label: 'Plans', Icon: Repeat, to: '/shop/plans' },
  { key: 'insights', label: 'Insights', Icon: BarChart3, to: '/shop/insights' },
  { key: 'work', label: 'Work & prices', Icon: Wrench, to: '/provider/services' },
  { key: 'pricereq', label: 'Price requests', Icon: MessageSquareQuote, to: '/shop/price-requests' },
  { key: 'shop', label: 'Shop & hours', Icon: Store, to: '/shop/profile' },
  { key: 'withdraw', label: 'Withdraw', Icon: Wallet, to: '/shop/withdraw' },
  { key: 'bank', label: 'Bank & UPI', Icon: Landmark, to: '/shop/bank' },
  { key: 'reviews', label: 'Reviews', Icon: Star, to: '/shop/reviews' },
  { key: 'kyc', label: 'Verification', Icon: ShieldCheck, to: '/shop/kyc' },
  { key: 'appeals', label: 'Appeals', Icon: Scale, to: '/shop/appeals' },
  { key: 'services', label: 'Add a service', Icon: PlusCircle, to: '/provider/onboarding' },
];

/** The technician's pages the tabs (Home, Alerts, Profile, ID check) don't show. */
export const TECHNICIAN_MENU = [
  { key: 'appeals', label: 'Appeals', Icon: Scale, to: '/worker/appeals' },
  { key: 'documents', label: 'My documents', Icon: FileText, to: '/provider/documents' },
];

/** Where each account lands. */
export const homeFor = (role: string | null) => (role === 'worker' ? '/worker' : role === 'event_partner' ? '/partner' : '/shop');
