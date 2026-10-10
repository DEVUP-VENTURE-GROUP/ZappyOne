/**
 * Open a call, map or video in the phone's own app. If the phone cannot
 * (no dialler on a tablet, no maps app), say what to do instead: a tap never
 * fails silently and never throws.
 */
import { Linking } from 'react-native';
import { toast } from '../components/Toast';

export function openLink(url: string, fallback = 'This phone could not open that.'): void {
  Linking.openURL(url).catch(() => toast.error(fallback));
}

/** Call a number, or say which number to dial. */
export const callNumber = (number: string) => openLink(`tel:${number.replace(/[^0-9+]/g, '')}`, `Could not start the call. Dial ${number} from your phone.`);
