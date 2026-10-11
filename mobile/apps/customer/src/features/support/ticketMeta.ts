/** Support ticket vocabulary (the website's SupportPage): categories, statuses and the reply promise per priority. */
import { CreditCard, Package, User, Bug, FileCheck, MessageCircle, type LucideIcon } from 'lucide-react-native';
import { accent, ink, slate, success, zappy } from '@zappy/ui/theme/colors';

export const CATEGORIES: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: 'payment', label: 'Payment', Icon: CreditCard },
  { value: 'order', label: 'Order Issue', Icon: Package },
  { value: 'account', label: 'Account', Icon: User },
  { value: 'app_bug', label: 'App Bug', Icon: Bug },
  { value: 'kyc', label: 'KYC / Verification', Icon: FileCheck },
  { value: 'other', label: 'Other', Icon: MessageCircle },
];

export const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  open: { label: 'Open', bg: zappy[50], fg: zappy[700] },
  in_progress: { label: 'In Progress', bg: '#F3EEFF', fg: '#6D28D9' },
  waiting_user: { label: 'Awaiting You', bg: accent[50], fg: accent[700] },
  resolved: { label: 'Resolved', bg: success[50], fg: success[700] },
  closed: { label: 'Closed', bg: slate[100], fg: ink[500] },
};

/** Hours until a reply is due, by priority. */
export const PRIORITY_SLA: Record<string, number> = { urgent: 1, high: 2, normal: 4, low: 24 };
export const CLOSED = ['resolved', 'closed'];
