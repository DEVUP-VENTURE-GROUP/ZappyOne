/** Dispute vocabulary (the website's DisputesPage): what went wrong, and where the case stands. */
import { AlertTriangle, Ban, BadgeIndianRupee, Frown, Hammer, MapPinOff, MessageCircle, ShieldAlert, Star, type LucideIcon } from 'lucide-react-native';
import { accent, ink, slate, success, zappy } from '@zappy/ui/theme/colors';

export const DISPUTE_CATEGORIES: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: 'overcharged', label: 'Overcharged', Icon: BadgeIndianRupee },
  { value: 'poor_quality', label: 'Poor Quality', Icon: Star },
  { value: 'service_not_done', label: 'Service Not Done', Icon: AlertTriangle },
  { value: 'no_show', label: 'Worker No-Show', Icon: Ban },
  { value: 'damage', label: 'Property Damage', Icon: Hammer },
  { value: 'rude_behavior', label: 'Rude Behaviour', Icon: Frown },
  { value: 'safety_concern', label: 'Safety Issue', Icon: ShieldAlert },
  { value: 'wrong_address', label: 'Wrong Address', Icon: MapPinOff },
  { value: 'other', label: 'Other', Icon: MessageCircle },
];

export const DISPUTE_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  open: { label: 'Open', bg: zappy[50], fg: zappy[700] },
  in_review: { label: 'In Review', bg: accent[50], fg: accent[700] },
  resolved: { label: 'Resolved', bg: success[50], fg: success[700] },
  closed: { label: 'Closed', bg: slate[100], fg: ink[500] },
};
