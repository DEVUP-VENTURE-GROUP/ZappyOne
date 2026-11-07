// ServicePro on the phone itself: a Quick Settings tile and a home-screen widget showing online or off and today's jobs and earnings (android/). The app writes the numbers; the tile and widget only read them. A safe no-op on iOS, the web and older builds.
import { requireOptionalNativeModule } from 'expo-modules-core';

type Status = { online: boolean; jobsToday: number; earnedToday: string };
const native = requireOptionalNativeModule<{ setStatus(s: Status): void }>('ZappyShortcuts');

export const zappyShortcuts = {
  available: !!native,
  setStatus: (s: Status): void => { try { native?.setStatus(s); } catch { /* the widget keeps its last numbers */ } },
};
