// The job's card on an iPhone's Lock Screen and Dynamic Island (iOS 16.2+, packages/native/ios). Reached without importing @zappy/native, so every app's shared code can use it; absent (Android, older builds) every call is a safe no-op.
import { requireOptionalNativeModule } from 'expo-modules-core';

export type JobActivityState = { stage: string; step: number; steps: number; headline: string; proName?: string | null; etaMinutes?: number | null; updatedAt: number };
type Subscription = { remove(): void };
type Native = {
  liveActivitiesEnabled?(): boolean;
  startJobActivity?(jobId: string, title: string, reference: string, state: JobActivityState): Promise<string | null>;
  updateJobActivity?(jobId: string, state: JobActivityState): Promise<void>;
  endJobActivity?(jobId: string): Promise<void>;
  addListener?(event: string, cb: (e: { jobId: string; token: string }) => void): Subscription;
  setHomeWidget?(title: string, line: string): void;
};
const native = requireOptionalNativeModule<Native>('ZappyNative');

export const liveActivity = {
  enabled: (): boolean => { try { return !!native?.liveActivitiesEnabled?.(); } catch { return false; } },
  start: async (jobId: string, title: string, reference: string, state: JobActivityState): Promise<string | null> => {
    try { return (await native?.startJobActivity?.(jobId, title, reference, state)) ?? null; } catch { return null; }
  },
  update: async (jobId: string, state: JobActivityState): Promise<void> => { try { await native?.updateJobActivity?.(jobId, state); } catch { /* the card was closed */ } },
  end: async (jobId: string): Promise<void> => { try { await native?.endJobActivity?.(jobId); } catch { /* already gone */ } },
  // The Home Screen widget's current job (empty title clears it).
  homeWidget: (title: string, line: string): void => { try { native?.setHomeWidget?.(title, line); } catch { /* widget not in this build */ } },
  onToken: (cb: (e: { jobId: string; token: string }) => void): Subscription => {
    try { return native?.addListener?.('onLiveActivityToken', cb) ?? { remove() {} }; } catch { return { remove() {} }; }
  },
};
