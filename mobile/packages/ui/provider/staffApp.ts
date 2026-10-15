/**
 * The Rakshak app is for ZappyOne's own staff only (the website's
 * staffPortal): partner-only screens (shared partnerPages) are hidden there.
 * The ServicePro app keeps all of them.
 */
import { APP_ID } from '@zappy/core/config/env';

export const STAFF_APP = APP_ID === 'rakshak';
