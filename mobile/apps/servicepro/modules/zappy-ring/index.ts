// A new job rings full-screen like a call, even with the app closed (android/ZappyRingMessagingService). Absent on iOS, the web and older builds: every call is then a safe no-op.
import { requireOptionalNativeModule } from 'expo-modules-core';

type Native = { canFullScreen(): boolean; openFullScreenSettings(): void };
const native = requireOptionalNativeModule<Native>('ZappyRing');

export const zappyRing = {
  available: !!native,
  canFullScreen: (): boolean => { try { return !!native?.canFullScreen(); } catch { return false; } },
  openSettings: (): void => { try { native?.openFullScreenSettings(); } catch { /* settings screen missing on this phone */ } },
};
