/** Talk to ZappyOne vocabulary (the website's SupportPage): topics per audience, statuses and the reply promise per priority. */
import { AlertTriangle, Bug, CreditCard, FileCheck, Lightbulb, MessageCircle, Package, User, type LucideIcon } from 'lucide-react-native';
import { accent, ink, slate, success, zappy } from '../theme/colors';

export type Audience = 'customer' | 'partner';
type Topic = { value: string; label: string; Icon: LucideIcon };

export const CATEGORIES: Record<Audience, Topic[]> = {
  customer: [
    { value: 'order', label: 'A booking', Icon: Package },
    { value: 'payment', label: 'Payment or refund', Icon: CreditCard },
    { value: 'complaint', label: 'Complaint', Icon: AlertTriangle },
    { value: 'feature_request', label: 'Suggest a feature', Icon: Lightbulb },
    { value: 'app_bug', label: 'App problem', Icon: Bug },
    { value: 'account', label: 'My account', Icon: User },
    { value: 'other', label: 'Something else', Icon: MessageCircle },
  ],
  partner: [
    { value: 'feature_request', label: 'Suggest a feature', Icon: Lightbulb },
    { value: 'complaint', label: 'Complaint', Icon: AlertTriangle },
    { value: 'order', label: 'Jobs and bookings', Icon: Package },
    { value: 'payment', label: 'Payments and dues', Icon: CreditCard },
    { value: 'kyc', label: 'Verification', Icon: FileCheck },
    { value: 'app_bug', label: 'App problem', Icon: Bug },
    { value: 'other', label: 'Something else', Icon: MessageCircle },
  ],
};
export const TOPIC: Record<string, string> = Object.fromEntries([...CATEGORIES.customer, ...CATEGORIES.partner].map((c) => [c.value, c.label]));

export const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  open: { label: 'Open', bg: zappy[50], fg: zappy[700] },
  in_progress: { label: 'In Progress', bg: zappy[50], fg: zappy[800] },
  waiting_user: { label: 'Awaiting You', bg: accent[50], fg: accent[700] },
  resolved: { label: 'Resolved', bg: success[50], fg: success[700] },
  closed: { label: 'Closed', bg: slate[100], fg: ink[500] },
};

/** Hours until a reply is due, by priority. */
export const PRIORITY_SLA: Record<string, number> = { urgent: 1, high: 2, normal: 4, low: 24 };
export const CLOSED = ['resolved', 'closed'];
