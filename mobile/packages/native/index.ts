// ZappyOne's own native code, shared by the customer and ServicePro apps. Android: jobs that ring full-screen, one live notification per job, background upload.
// iPhone: background photo upload here; the Live Activity through @zappy/core/lib/liveActivity. Absent on the web and older builds: every call is then a safe no-op.
import { requireOptionalNativeModule } from 'expo-modules-core';

type Native = {
  canFullScreen(): boolean; openFullScreenSettings(): void; isLowRam(): boolean; enqueueUpload(id: string, fileUri: string, url: string, type: string): boolean;
};
const native = requireOptionalNativeModule<Native>('ZappyNative');

export const zappyNative = {
  available: !!native,
  canFullScreen: (): boolean => { try { return !!native?.canFullScreen(); } catch { return false; } },
  // Older builds and iPhones without the check count as not low on memory.
  isLowRam: (): boolean => { try { return !!native?.isLowRam?.(); } catch { return false; } },
  openFullScreenSettings: (): void => { try { native?.openFullScreenSettings(); } catch { /* settings screen missing on this phone */ } },
  // Android finishes the upload on its own (WorkManager), even with the app closed; false when this phone cannot.
  enqueueUpload: (id: string, fileUri: string, url: string, type: string): boolean => { try { return !!native?.enqueueUpload(id, fileUri, url, type); } catch { return false; } },
};

// The iPhone Live Activity calls live in @zappy/core/lib/liveActivity (shared code in every app reaches them there).
