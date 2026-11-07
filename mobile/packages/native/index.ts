// ZappyOne's own Android code, shared by the customer and ServicePro apps: jobs that ring full-screen, and one live notification per job that updates itself. Absent on iOS, the web and older builds: every call is then a safe no-op.
import { requireOptionalNativeModule } from 'expo-modules-core';

type Native = { canFullScreen(): boolean; openFullScreenSettings(): void; enqueueUpload(id: string, fileUri: string, url: string, type: string): boolean };
const native = requireOptionalNativeModule<Native>('ZappyNative');

export const zappyNative = {
  available: !!native,
  canFullScreen: (): boolean => { try { return !!native?.canFullScreen(); } catch { return false; } },
  openFullScreenSettings: (): void => { try { native?.openFullScreenSettings(); } catch { /* settings screen missing on this phone */ } },
  // Android finishes the upload on its own (WorkManager), even with the app closed; false when this phone cannot.
  enqueueUpload: (id: string, fileUri: string, url: string, type: string): boolean => { try { return !!native?.enqueueUpload(id, fileUri, url, type); } catch { return false; } },
};
