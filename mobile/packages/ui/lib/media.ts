/** Pictures the websites serve, loadable from the apps. */
import { WEB_ORIGIN } from '@zappy/core/config/env';

/** A website path ("/problems/mobile/x.webp") as a full URL; full URLs pass through. */
export const webAsset = (path?: string | null): string | null =>
  !path ? null : /^https?:\/\//.test(path) ? path : `${WEB_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
