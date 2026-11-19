// ZappyOne's own native code, shared by the customer and ServicePro apps. Android: jobs that ring full-screen, one live notification per job, background upload.
// iPhone: the job's Live Activity on the Lock Screen and Dynamic Island. Absent on the web and older builds: every call is then a safe no-op.
import { requireOptionalNativeModule } from 'expo-modules-core';

export type JobActivityState = { stage: string; step: number; steps: number; headline: string; proName?: string | null; etaMinutes?: number | null; updatedAt: number };
type Subscription = { remove(): void };
type Native = {
  canFullScreen(): boolean; openFullScreenSettings(): void; enqueueUpload(id: string, fileUri: string, url: string, type: string): boolean;
  liveActivitiesEnabled?(): boolean;
  startJobActivity?(jobId: string, title: string, reference: string, state: JobActivityState): Promise<string | null>;
  updateJobActivity?(jobId: string, state: JobActivityState): Promise<void>;
  endJobActivity?(jobId: string): Promise<void>;
  addListener?(event: string, cb: (e: { jobId: string; token: string }) => void): Subscription;
};
const native = requireOptionalNativeModule<Native>('ZappyNative');

export const zappyNative = {
  available: !!native,
  canFullScreen: (): boolean => { try { return !!native?.canFullScreen(); } catch { return false; } },
  openFullScreenSettings: (): void => { try { native?.openFullScreenSettings(); } catch { /* settings screen missing on this phone */ } },
  // Android finishes the upload on its own (WorkManager), even with the app closed; false when this phone cannot.
  enqueueUpload: (id: string, fileUri: string, url: string, type: string): boolean => { try { return !!native?.enqueueUpload(id, fileUri, url, type); } catch { return false; } },
};

// The job's card on an iPhone's Lock Screen and Dynamic Island (iOS 16.2+); the server keeps it current by push once it has the token.
export const liveActivity = {
  enabled: (): boolean => { try { return !!native?.liveActivitiesEnabled?.(); } catch { return false; } },
  start: async (jobId: string, title: string, reference: string, state: JobActivityState): Promise<string | null> => {
    try { return (await native?.startJobActivity?.(jobId, title, reference, state)) ?? null; } catch { return null; }
  },
  update: async (jobId: string, state: JobActivityState): Promise<void> => { try { await native?.updateJobActivity?.(jobId, state); } catch { /* the card was closed */ } },
  end: async (jobId: string): Promise<void> => { try { await native?.endJobActivity?.(jobId); } catch { /* already gone */ } },
  onToken: (cb: (e: { jobId: string; token: string }) => void): Subscription => {
    try { return native?.addListener?.('onLiveActivityToken', cb) ?? { remove() {} }; } catch { return { remove() {} }; }
  },
};
