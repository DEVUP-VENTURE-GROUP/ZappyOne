// The ZappyOne bubble over other apps (android/ZappyBubbleModule). Absent on iOS, the web and older builds: every call is then a safe no-op.
import { requireOptionalNativeModule } from 'expo-modules-core';

type Native = { canDrawOverlays(): boolean; openOverlaySettings(): void; show(): void; hide(): void };
const native = requireOptionalNativeModule<Native>('ZappyBubble');

export const zappyBubble = {
  available: !!native,
  canShow: (): boolean => { try { return !!native?.canDrawOverlays(); } catch { return false; } },
  askPermission: (): void => { try { native?.openOverlaySettings(); } catch { /* settings screen missing on this phone */ } },
  show: (): void => { try { native?.show(); } catch { /* nothing to show */ } },
  hide: (): void => { try { native?.hide(); } catch { /* already gone */ } },
};
