// ServicePro's places for a technician (the owner's come from shared partnerPages), and where each account lands.
import { FileText, Headphones, Scale } from 'lucide-react-native';

/** The technician's pages the tabs (Home, Alerts, Profile, ID check) don't show. */
export const TECHNICIAN_MENU = [
  { key: 'appeals', label: 'Ask us to recheck', Icon: Scale, to: '/worker/appeals' },
  { key: 'documents', label: 'My documents', Icon: FileText, to: '/provider/documents' },
  { key: 'support', label: 'Talk to ZappyOne', Icon: Headphones, to: '/worker/support' },
];

/** Where each account lands. */
export const homeFor = (role: string | null) => (role === 'worker' ? '/worker' : role === 'event_partner' ? '/partner' : '/shop');
