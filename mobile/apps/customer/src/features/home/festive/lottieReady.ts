// Whether this installed build has the Lottie player. Asking Android for the view is unreliable on the new architecture and crashed build 1.0.0, so it is decided by the build: 1.0.0 never has it.
import * as Updates from 'expo-updates';

const WITHOUT_LOTTIE = new Set(['1.0.0']);

let ready: boolean | null = null;

export function lottieReady(): boolean {
  if (ready === null) {
    try { ready = !!Updates.runtimeVersion && !WITHOUT_LOTTIE.has(Updates.runtimeVersion); } catch { ready = false; }
  }
  return ready;
}
