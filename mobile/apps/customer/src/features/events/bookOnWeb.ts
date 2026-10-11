/**
 * Event bookings lock the date with an advance paid online, and the apps take
 * no online payment yet, so booking and paying finish on the website.
 */
import { WEB_ORIGIN } from '@zappy/core/config/env';
import { openLink } from '@zappy/ui/lib/openLink';

const OPEN_FAIL = 'Could not open the browser. Visit zappyone.com to finish.';
export const bookThemeOnWeb = (themeId: string, later = false) => openLink(`${WEB_ORIGIN}/events/book/${themeId}${later ? '?scheduled=true' : ''}`, OPEN_FAIL);
export const payBookingOnWeb = (bookingId: string) => openLink(`${WEB_ORIGIN}/events/bookings/${bookingId}`, OPEN_FAIL);
