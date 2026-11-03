/**
 * ServicePro's places, for both people who use it (the website's
 * ServiceProShell). The owner runs the shop; a technician only works the jobs
 * the owner gives them. Each place appears once: in the bottom tabs, or in the
 * menu sheet for the rest.
 */
import {
  BarChart3, FileText, Headphones, KanbanSquare, Landmark, MessageSquareQuote, PlusCircle, Repeat, Scale, ShieldCheck, Star, Store, Wallet, Wrench,
} from 'lucide-react-native';

/** The owner's pages the tabs (Home, Team, Earnings, Alerts, Profile) don't show. */
export const OWNER_MENU = [
  { key: 'orders', label: 'Orders', Icon: KanbanSquare, to: '/shop/orders' },
  { key: 'plans', label: 'Plans', Icon: Repeat, to: '/shop/plans' },
  { key: 'insights', label: 'How you are doing', Icon: BarChart3, to: '/shop/insights' },
  { key: 'work', label: 'Work & prices', Icon: Wrench, to: '/provider/services' },
  { key: 'pricereq', label: 'Customers asking your price', Icon: MessageSquareQuote, to: '/shop/price-requests' },
  { key: 'shop', label: 'Shop & hours', Icon: Store, to: '/shop/profile' },
  { key: 'withdraw', label: 'Take out money', Icon: Wallet, to: '/shop/withdraw' },
  { key: 'bank', label: 'Bank & UPI', Icon: Landmark, to: '/shop/bank' },
  { key: 'reviews', label: 'Reviews', Icon: Star, to: '/shop/reviews' },
  { key: 'kyc', label: 'ID check', Icon: ShieldCheck, to: '/shop/kyc' },
  { key: 'appeals', label: 'Ask us to recheck', Icon: Scale, to: '/shop/appeals' },
  { key: 'services', label: 'Add a service', Icon: PlusCircle, to: '/provider/onboarding' },
  { key: 'support', label: 'Talk to ZappyOne', Icon: Headphones, to: '/shop/support' },
];

/** The technician's pages the tabs (Home, Alerts, Profile, ID check) don't show. */
export const TECHNICIAN_MENU = [
  { key: 'appeals', label: 'Ask us to recheck', Icon: Scale, to: '/worker/appeals' },
  { key: 'documents', label: 'My documents', Icon: FileText, to: '/provider/documents' },
  { key: 'support', label: 'Talk to ZappyOne', Icon: Headphones, to: '/worker/support' },
];

/** Where each account lands. */
export const homeFor = (role: string | null) => (role === 'worker' ? '/worker' : role === 'event_partner' ? '/partner' : '/shop');
